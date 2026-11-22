'use strict';
// Мониторинг сайта и приёма заявок (Yandex Cloud Functions, Node 22, запуск по таймеру раз в 15–30 минут).
// Ничего не отправляет в «Маяк» и на Info@ как заявку: форма проверяется «ловушкой для ботов» (поле website),
// которую функция приёма заявок сразу отбрасывает с ответом ok.
// Письмо-тревога уходит только при смене состояния (сломалось / починилось) и напоминание раз в REMIND_HOURS.
//
// Переменные окружения:
//   SITE_URL      https://aksioma-vent.ru (на время теста — https://new.aksioma-vent.ru)
//   FORMS_URL     https://functions.yandexcloud.net/d4eapejqjj24ihebaa3e
//   AUTH_URL      https://functions.yandexcloud.net/d4eaf60b60tqqrhiki5d   (необязательно)
//   CRM_URL       https://crm.aksioma-vent.ru                              (необязательно)
//   ALERT_TO      кому писать о сбоях (по умолчанию Info@aksioma-vent.ru)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM — как у функции заявок
//   STATE_BUCKET  бакет для файла состояния _monitor.json (сервисному аккаунту нужна запись); без него письмо при каждом сбое
//   REMIND_HOURS  напоминать о незакрытом сбое раз в N часов (по умолчанию 6)
const tls = require('tls');

const T = 10000;
async function get(url, opt = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), T);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...opt, signal: ctrl.signal, redirect: 'follow' });
    const body = opt.method === 'HEAD' || opt.method === 'OPTIONS' ? '' : await r.text();
    return { status: r.status, body, ms: Date.now() - t0, headers: r.headers };
  } finally { clearTimeout(t); }
}

function certDays(host) {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: T }, () => {
      const c = s.getPeerCertificate(); s.end();
      if (!c || !c.valid_to) return reject(new Error('нет сертификата'));
      resolve(Math.floor((new Date(c.valid_to) - Date.now()) / 86400000));
    });
    s.on('error', reject); s.on('timeout', () => { s.destroy(); reject(new Error('таймаут TLS')); });
  });
}

async function checks() {
  const site = (process.env.SITE_URL || 'https://new.aksioma-vent.ru').replace(/\/$/, '');
  const forms = process.env.FORMS_URL || 'https://functions.yandexcloud.net/d4eapejqjj24ihebaa3e';
  const list = [
    ['Главная страница', async () => {
      const r = await get(site + '/');
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      if (!/Аксиома|АКСИОМА/.test(r.body)) throw new Error('страница без содержимого');
      return r.ms + ' мс';
    }],
    ['Каталог', async () => {
      const r = await get(site + '/static/products.json');
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      const n = JSON.parse(r.body).length;
      if (!n) throw new Error('пустой список товаров');
      return n + ' товаров';
    }],
    ['HTTPS-сертификат', async () => {
      const d = await certDays(new URL(site).hostname);
      if (d < 14) throw new Error('истекает через ' + d + ' дн.');
      return d + ' дн.';
    }],
    ['Приём заявок', async () => {
      const r = await get(forms, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: site }, body: JSON.stringify({ form: 'monitor', website: 'monitor', fields: {} }) });
      if (r.status !== 200) throw new Error('HTTP ' + r.status + ' ' + r.body.slice(0, 120));
      return r.ms + ' мс';
    }],
  ];
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) list.push(['Почта (вход в SMTP)', async () => {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 465);
    await nodemailer.createTransport({ host: process.env.SMTP_HOST || 'mail.hosting.reg.ru', port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }, connectionTimeout: T }).verify();
    return 'ok';
  }]);
  if (process.env.AUTH_URL) list.push(['Личный кабинет / «Аналогично!»', async () => {
    const r = await get(process.env.AUTH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: site }, body: JSON.stringify({ action: 'me', token: 'monitor' }) });
    if (r.status >= 500) throw new Error('HTTP ' + r.status);
    return r.ms + ' мс';
  }]);
  if (process.env.CRM_URL) list.push(['CRM «Маяк»', async () => {
    const r = await get(process.env.CRM_URL);
    if (r.status >= 500) throw new Error('HTTP ' + r.status);
    return r.ms + ' мс';
  }]);
  const res = [];
  for (const [name, fn] of list) {
    let ok = false, info = '';
    for (let i = 0; i < 2 && !ok; i++) {            // одна повторная попытка — от случайных сетевых сбоев
      try { info = await fn(); ok = true; } catch (e) { info = e.name === 'AbortError' ? 'нет ответа за ' + T / 1000 + ' с' : String(e.message || e); }
    }
    res.push({ name, ok, info });
  }
  return { site, res };
}

// ---------- состояние в бакете ----------
async function stateIO(token, method, data) {
  const b = process.env.STATE_BUCKET;
  if (!b || !token) return null;
  const url = 'https://storage.yandexcloud.net/' + b + '/_monitor.json';
  const r = await fetch(url, { method, headers: { 'X-YaCloud-SubjectToken': token, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: data ? JSON.stringify(data) : undefined }).catch(() => null);
  if (method === 'GET') return r && r.ok ? r.json().catch(() => null) : null;
  return null;
}

async function alert(subject, lines) {
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 465);
  const tr = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'mail.hosting.reg.ru', port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
  await tr.sendMail({
    from: '"Мониторинг сайта" <' + (process.env.MAIL_FROM || process.env.SMTP_USER) + '>',
    to: process.env.ALERT_TO || 'Info@aksioma-vent.ru', subject, text: lines.join('\n'),
  });
}

module.exports.handler = async function (event, context) {
  const token = context && context.token && context.token.access_token;
  const { site, res } = await checks();
  const bad = res.filter((r) => !r.ok);
  const now = Date.now();
  const prev = (await stateIO(token, 'GET')) || { bad: [], since: 0, reminded: 0 };
  const key = bad.map((b) => b.name).sort().join('|');
  const prevKey = (prev.bad || []).slice().sort().join('|');
  const remind = (Number(process.env.REMIND_HOURS) || 6) * 3600000;
  const table = res.map((r) => (r.ok ? '✓ ' : '✗ ') + r.name + ' — ' + r.info);
  let mailed = '';
  try {
    if (bad.length && (key !== prevKey || !process.env.STATE_BUCKET || now - (prev.reminded || 0) > remind)) {
      await alert('Сбой на сайте ' + site.replace(/^https?:\/\//, '') + ': ' + bad.map((b) => b.name).join(', '),
        ['Проверка ' + new Date(now).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' (МСК)', ''].concat(table, ['', 'Письмо придёт снова, если сбой не исчезнет за ' + (remind / 3600000) + ' ч, и когда всё восстановится.']));
      mailed = 'alert';
    } else if (!bad.length && prevKey) {
      await alert('Сайт ' + site.replace(/^https?:\/\//, '') + ' снова работает', ['Всё восстановлено.', ''].concat(table));
      mailed = 'recovered';
    }
  } catch (e) { console.error('alert', String(e.message || e)); mailed = 'error'; }
  if (process.env.STATE_BUCKET) {
    await stateIO(token, 'PUT', { bad: bad.map((b) => b.name), since: bad.length ? (key === prevKey ? prev.since : now) : 0, reminded: mailed === 'alert' ? now : (bad.length ? prev.reminded : 0), checked: now });
  }
  const out = { ok: !bad.length, site, checks: res, mailed };
  console.log(JSON.stringify(out));
  return { statusCode: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(out) };
};
