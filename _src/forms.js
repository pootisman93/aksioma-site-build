'use strict';
// Приём заявок с сайта aksioma-vent.ru (Yandex Cloud Functions, Node 22).
// 1) письмо на Info@aksioma-vent.ru с вложениями — через SMTP, как в «Маяке» (mail.js);
// 2) заявка в «Маяк» — через его вебхук /api/hook/site?key=site_… (sitehook.js).
// Переменные окружения: см. ИНСТРУКЦИЯ.md рядом.

const LIMIT_BODY = 3.4 * 1024 * 1024;            // предел запроса Cloud Functions ~3,5 МБ
const LIMIT_FILES = 2.5 * 1024 * 1024;           // как на сайте
const FILE_TYPES = /\.(pdf|docx?|xlsx?|csv|txt|rtf|odt|ods|dwg|dxf|jpe?g|png|webp|heic|zip|rar|7z)$/i;

const FORM_NAMES = {
  zayavka: 'Заявка из корзины',
  biznes: 'Запрос КП (проектировщикам и оптовикам)',
  klapany: 'Противопожарные клапаны',
  vozduhovody: 'Воздуховоды',
  zavesy: 'Тепловые завесы',
  proekt: 'Проектирование ОВиК',
  montazh: 'Монтаж',
  service: 'Обслуживание кондиционеров',
  home: 'Главная страница',
};

function origins() {
  return String(process.env.ORIGINS || 'https://aksioma-vent.ru,https://www.aksioma-vent.ru,https://new.aksioma-vent.ru')
    .split(',').map((s) => s.trim()).filter(Boolean);
}
function cors(origin) {
  const list = origins();
  const allow = list.includes(origin) ? origin : list[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const reply = (code, obj, origin) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) },
  body: JSON.stringify(obj),
});

const str = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('ru-RU') + ' ₽';

// ---------- простая защита от спама: не больше 10 заявок за 10 минут с одного адреса ----------
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 10;
}

// ---------- разбор и проверка ----------
function parse(body) {
  const form = str(body.form, 40).replace(/[^a-z0-9_-]/gi, '') || 'site';
  const fields = {};
  for (const [k, v] of Object.entries(body.fields && typeof body.fields === 'object' ? body.fields : {}).slice(0, 30)) {
    const key = str(k, 80), val = str(v, 3000);
    if (key && val) fields[key] = val;
  }
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100).map((i) => ({
    t: str(i && i.t, 200), q: Math.max(1, Math.min(999, parseInt(i && i.q, 10) || 1)),
    p: Math.max(0, Number(i && i.p) || 0), m: Boolean(i && i.m), u: str(i && i.u, 200),
  })).filter((i) => i.t);
  let size = 0;
  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 10).map((f) => {
    const name = str(f && f.name, 150).replace(/[\\/:*?"<>|]/g, '_');
    const data = String((f && f.data) || '');
    if (!name || !data || !FILE_TYPES.test(name) || !/^[A-Za-z0-9+/=]+$/.test(data)) return null;
    const buf = Buffer.from(data, 'base64');
    size += buf.length;
    return { filename: name, content: buf, contentType: str(f.type, 100) || undefined };
  }).filter(Boolean);
  if (size > LIMIT_FILES) throw Object.assign(new Error('Файлы больше 2,5 МБ'), { code: 413 });
  const page = str(body.page, 300), title = str(body.title, 300), ref = str(body.ref, 500);
  const vals = Object.values(fields);
  const phone = vals.map((v) => v.replace(/\D/g, '')).find((d) => d.length >= 10 && d.length <= 15) || '';
  const email = vals.find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || '';
  return { form, formName: FORM_NAMES[form] || ({ 'podbor-multi': 'Подбор мульти-сплит системы', 'podbor-poluprom': 'Подбор полупромышленного кондиционера' })[form] || 'Форма сайта', fields, items, files, page, title, ref, phone, email };
}

function itemsText(items) {
  if (!items.length) return '';
  const total = items.reduce((s, i) => s + i.p * i.q, 0);
  return items.map((i, n) => (n + 1) + '. ' + i.t + ' — ' + i.q + ' шт.' + (i.p ? ' × ' + money(i.p) : ' (цена по запросу)') + (i.m ? ', нужен монтаж' : '')).join('\n') +
    (total ? '\nИтого по ценам сайта: ' + money(total) : '');
}

function letter(r) {
  const base = process.env.SITE_URL || 'https://aksioma-vent.ru';
  const rows = Object.entries(r.fields).map(([k, v]) => [k, v]);
  if (r.page) rows.push(['Страница', base + r.page]);
  if (r.ref) rows.push(['Откуда пришёл', r.ref]);
  const items = itemsText(r.items);
  const text = r.formName + '\n\n' + rows.map(([k, v]) => k + ': ' + v).join('\n') +
    (items ? '\n\nСостав заявки:\n' + items : '') +
    (r.files.length ? '\n\nВложения: ' + r.files.map((f) => f.filename).join(', ') : '');
  const td = 'padding:6px 12px;border-bottom:1px solid #E3E8F0;vertical-align:top;';
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1B2F55">' +
    '<h2 style="margin:0 0 12px">' + esc(r.formName) + '</h2>' +
    '<table style="border-collapse:collapse">' + rows.map(([k, v]) => '<tr><td style="' + td + 'color:#5B6B86">' + esc(k) + '</td><td style="' + td + '">' + esc(v).replace(/\n/g, '<br>') + '</td></tr>').join('') + '</table>' +
    (r.items.length ? '<h3 style="margin:18px 0 8px">Состав заявки</h3><table style="border-collapse:collapse">' +
      r.items.map((i) => '<tr><td style="' + td + '">' + (i.u ? '<a href="' + esc(base + i.u) + '">' + esc(i.t) + '</a>' : esc(i.t)) + '</td><td style="' + td + '">' + i.q + ' шт.</td><td style="' + td + '">' + (i.p ? money(i.p) : 'по запросу') + '</td><td style="' + td + '">' + (i.m ? 'с монтажом' : '') + '</td></tr>').join('') +
      '</table>' + (r.items.some((i) => i.p) ? '<p><b>Итого по ценам сайта: ' + money(r.items.reduce((s, i) => s + i.p * i.q, 0)) + '</b></p>' : '') : '') +
    '</div>';
  const who = r.fields['Компания'] || r.fields['Имя'] || r.phone || r.email;
  return { subject: 'Заявка с сайта: ' + r.formName + (who ? ' — ' + who : ''), text, html };
}

// ---------- письмо (как в «Маяке»: SMTP ящика noreply@aksioma-vent.ru) ----------
let transportCache = null;
function transport() {
  if (transportCache) return transportCache;
  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 465);
  transportCache = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.yandex.ru', port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  return transportCache;
}
async function sendMail(r) {
  const m = letter(r);
  if (process.env.MAIL === 'console') { console.log('[mail]', m.subject, '\n' + m.text); return; }
  const from = '"Сайт Аксиома" <' + (process.env.MAIL_FROM || process.env.SMTP_USER) + '>';
  await transport().sendMail({
    from, to: process.env.MAIL_TO || 'Info@aksioma-vent.ru', replyTo: r.email || undefined,
    subject: m.subject, text: m.text, html: m.html, attachments: r.files,
  });
}

// ---------- подтверждение клиенту (если он указал почту) ----------
function confirmLetter(r) {
  const base = process.env.SITE_URL || 'https://aksioma-vent.ru';
  const phone = process.env.COMPANY_PHONE || '+7 916 244 85 50';
  const name = (r.fields['Имя'] || r.fields['Фамилия и имя'] || r.fields['Контактное лицо'] || '').split(/\s+/)[0];
  const hi = name ? 'Здравствуйте, ' + name + '!' : 'Здравствуйте!';
  const items = itemsText(r.items);
  const nm = r.form === 'zayavka' ? 'Заявка на оборудование' : r.formName;
  const text = hi + '\n\nМы получили вашу заявку «' + nm + '». Менеджер свяжется с вами в рабочее время (пн–пт, 9:00–18:00), уточнит детали и пришлёт расчёт.' +
    (items ? '\n\nСостав заявки:\n' + items + '\nЦены ориентировочные: наличие и итоговую стоимость подтвердит менеджер.' : '') +
    '\n\nЕсли вопрос срочный, позвоните: ' + phone + '.\n\nАксиома — климатическое оборудование, проектирование и монтаж\n' + base +
    '\n\nПисьмо отправлено автоматически. Если заявку оставляли не вы, просто удалите его.';
  const p = 'margin:0 0 14px;line-height:22px;';
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1B2F55;max-width:560px">' +
    '<p style="' + p + '">' + esc(hi) + '</p>' +
    '<p style="' + p + '">Мы получили вашу заявку «' + esc(nm) + '». Менеджер свяжется с вами в рабочее время (пн–пт, 9:00–18:00), уточнит детали и пришлёт расчёт.</p>' +
    (r.items.length ? '<table style="border-collapse:collapse;margin:0 0 8px;width:100%">' + r.items.map((i) => '<tr><td style="padding:6px 0;border-bottom:1px solid #E3E8F0">' + esc(i.t) + (i.m ? ', с монтажом' : '') + '</td><td style="padding:6px 0 6px 12px;border-bottom:1px solid #E3E8F0;white-space:nowrap;text-align:right">' + i.q + ' шт.</td></tr>').join('') + '</table>' +
      '<p style="' + p + 'color:#5B6B86;font-size:13px">Цены ориентировочные: наличие и итоговую стоимость подтвердит менеджер.</p>' : '') +
    '<p style="' + p + '">Если вопрос срочный, позвоните: <a href="tel:' + phone.replace(/[^\d+]/g, '') + '" style="color:#1B2F55;font-weight:bold">' + esc(phone) + '</a>.</p>' +
    '<p style="' + p + '">Аксиома — климатическое оборудование, проектирование и монтаж<br><a href="' + esc(base) + '" style="color:#2F6BFF">' + esc(base.replace(/^https?:\/\//, '')) + '</a></p>' +
    '<p style="margin:18px 0 0;color:#8A97AD;font-size:12px">Письмо отправлено автоматически. Если заявку оставляли не вы, просто удалите его.</p></div>';
  return { subject: 'Аксиома: заявка получена', text, html };
}
async function sendConfirm(r) {
  if (!r.email || process.env.CONFIRM === 'off') return 'skip';
  const m = confirmLetter(r);
  if (process.env.MAIL === 'console') { console.log('[confirm]', r.email, m.subject, '\n' + m.text); return 'ok'; }
  const from = '"Аксиома" <' + (process.env.MAIL_FROM || process.env.SMTP_USER) + '>';
  await transport().sendMail({ from, to: r.email, replyTo: process.env.MAIL_TO || 'Info@aksioma-vent.ru', subject: m.subject, text: m.text, html: m.html });
  return 'ok';
}

// ---------- заявка в «Маяк» ----------
async function toMayak(r) {
  const url = process.env.MAYAK_HOOK; // https://crm.aksioma-vent.ru/api/hook/site?key=site_…
  if (!url) return 'skip';
  const body = { ...r.fields, formname: r.formName, source: 'site' };
  const extra = [];
  const items = itemsText(r.items);
  if (items) extra.push('Состав заявки:\n' + items);
  if (r.files.length) extra.push('Вложения (в письме на Info@): ' + r.files.map((f) => f.filename).join(', '));
  if (r.page) extra.push('Страница: ' + r.page);
  if (extra.length) body['Дополнительно'] = extra.join('\n');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) throw new Error('Маяк ответил ' + res.status);
    return 'ok';
  } finally { clearTimeout(t); }
}

// ---------- точка входа ----------
async function handler(event) {
  const headers = Object.fromEntries(Object.entries((event && event.headers) || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const origin = headers.origin || '';
  const method = String((event && event.httpMethod) || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, headers: cors(origin), body: '' };
  if (method !== 'POST') return reply(405, { error: 'Только POST' }, origin);
  if (origin && !origins().includes(origin)) return reply(403, { error: 'Чужой сайт' }, origin);

  const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : String(event.body)) : '';
  if (raw.length > LIMIT_BODY) return reply(413, { error: 'Слишком большой запрос' }, origin);
  let body;
  try { body = JSON.parse(raw || '{}'); } catch (e) { return reply(400, { error: 'Неверный формат' }, origin); }

  const ip = String(headers['x-forwarded-for'] || (event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp) || '').split(',')[0].trim();
  if (body.website) return reply(200, { ok: true }, origin);         // ловушка для ботов
  if (ip && tooMany(ip)) return reply(429, { error: 'Слишком много заявок, попробуйте позже' }, origin);

  let r;
  try { r = parse(body); } catch (e) { return reply(e.code || 400, { error: e.message }, origin); }
  if (!r.phone && !r.email) return reply(400, { error: 'Нужен телефон или почта' }, origin);

  // Письмо — главное: без него заявка считается неотправленной. «Маяк» — дополнительно.
  const [mail, crm] = await Promise.allSettled([sendMail(r), toMayak(r)]);
  if (crm.status === 'rejected') console.error('mayak', String(crm.reason));
  if (mail.status === 'rejected') {
    console.error('mail', String(mail.reason && mail.reason.stack || mail.reason));
    if (crm.status === 'fulfilled' && crm.value === 'ok') return reply(200, { ok: true, warning: 'mail' }, origin);
    return reply(502, { error: 'Не удалось отправить заявку' }, origin);
  }
  // подтверждение клиенту — только после того, как заявка дошла до нас; ошибка не влияет на ответ
  let confirm = 'skip';
  try { confirm = await sendConfirm(r); } catch (e) { confirm = 'error'; console.error('confirm', String(e && e.message || e)); }
  console.log('lead', JSON.stringify({ form: r.form, page: r.page, items: r.items.length, files: r.files.length, crm: crm.status === 'fulfilled' ? crm.value : 'error', confirm }));
  return reply(200, { ok: true }, origin);
}

module.exports = { handler, _test: { parse, letter, itemsText, confirmLetter } };
