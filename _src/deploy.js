'use strict';
// Загрузчик сайта в Object Storage.
// Откуда берёт сайт: архив репозитория GitHub (SOURCE_URL, по умолчанию pootisman93/aksioma-site-build, ветка main).
// Если в коде функции есть папка site/ и в запросе передано {"source":"local"} — берёт её.
// Переменные: BUCKET (обязательно), SOURCE_URL (необязательно). Сервисный аккаунт с правом записи в бакет.
// Ключи берутся из _keys.json: «katalog» и «katalog/index.html» → katalog.html и т. п.
// Фото товаров с Tilda (_remote.json) копируются к себе, если их ещё нет.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'application/javascript; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8', ico: 'image/x-icon', pdf: 'application/pdf', woff: 'font/woff', woff2: 'font/woff2' };
const DEFAULT_SOURCE = 'https://codeload.github.com/pootisman93/aksioma-site-build/tar.gz/refs/heads/main';

// Разбор tar (GitHub отдаёт tar.gz с pax-заголовками). Первый каталог пути (имя-коммит) отбрасывается.
function untar(buf) {
  const files = {};
  let off = 0, longName = null;
  const str = (b) => b.toString('utf8').replace(/\0.*$/s, '');
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    let name = str(h.subarray(0, 100));
    const prefix = str(h.subarray(345, 500));
    if (prefix) name = prefix + '/' + name;
    const size = parseInt(str(h.subarray(124, 136)).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { // pax: путь может быть длиннее 100 символов
      const m = data.toString('utf8').match(/\d+ path=([^\n]*)\n/);
      longName = m ? m[1] : null;
      continue;
    }
    if (type === 'g') continue;
    if (type === 'L') { longName = str(data); continue; }
    if (longName) { name = longName; longName = null; }
    if (type !== '0' && type !== '\0' && type !== '7') continue;
    const rel = name.split('/').slice(1).join('/');
    if (rel) files[rel] = Buffer.from(data);
  }
  return files;
}

async function loadSite(event) {
  let body = {};
  try { body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || event || {}); } catch (e) { body = {}; }
  const local = path.join(__dirname, 'site');
  if (body.source === 'local' && fs.existsSync(local)) {
    const files = {};
    (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files[path.relative(local, p).split(path.sep).join('/')] = fs.readFileSync(p); } })(local);
    return { files, from: 'local' };
  }
  const src = process.env.SOURCE_URL || DEFAULT_SOURCE;
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(src + (src.includes('?') ? '&' : '?') + 't=' + Date.now());
      if (!r.ok) throw new Error('GitHub ' + r.status);
      const files = untar(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())));
      if (!files['_keys.json']) throw new Error('в архиве нет _keys.json');
      return { files, from: src };
    } catch (e) { last = e; }
  }
  throw last;
}

module.exports.handler = async function (event, context) {
  const bucket = process.env.BUCKET;
  const token = context && context.token && context.token.access_token;
  if (!bucket || !token) return { statusCode: 500, body: 'Нет BUCKET или сервисного аккаунта' };
  let site;
  try { site = await loadSite(event || {}); } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: 'Не удалось получить сайт: ' + e.message }) }; }
  const files = site.files;
  const keys = JSON.parse(files['_keys.json'].toString('utf8'));
  const list = Object.entries(keys).filter(([, f]) => files[f]);
  const missing = Object.entries(keys).filter(([, f]) => !files[f]).map(([k]) => k);
  let done = 0; const errors = missing.map((k) => k + ': нет файла в архиве');

  async function put([key, file]) {
    const ext = path.extname(file).slice(1).toLowerCase();
    const body = files[file];
    const cache = ext === 'html' || ext === 'json' || ext === 'xml' || ext === 'txt' ? 'no-cache' : 'public, max-age=86400';
    const url = 'https://storage.yandexcloud.net/' + bucket + '/' + key.split('/').map(encodeURIComponent).join('/');
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { method: 'PUT', headers: { 'X-YaCloud-SubjectToken': token, 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache }, body });
        if (r.ok) { done++; return; }
        if (i === 2) errors.push(key + ': ' + r.status + ' ' + (await r.text()).slice(0, 200));
      } catch (e) { if (i === 2) errors.push(key + ': ' + e.message); }
    }
  }

  // фото товаров с Tilda — копируем к себе, если ещё не скопированы
  let remote = {};
  try { remote = JSON.parse((files['_remote.json'] || '{}').toString('utf8')); } catch (e) { remote = {}; }
  let copied = 0;
  async function copy([key, src]) {
    const url = 'https://storage.yandexcloud.net/' + bucket + '/' + key;
    const head = await fetch(url, { method: 'HEAD', headers: { 'X-YaCloud-SubjectToken': token } }).catch(() => null);
    if (head && head.ok) return;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(src);
        if (!r.ok) throw new Error('Tilda ' + r.status);
        const body = Buffer.from(await r.arrayBuffer());
        const ext = path.extname(key).slice(1).toLowerCase();
        const w = await fetch(url, { method: 'PUT', headers: { 'X-YaCloud-SubjectToken': token, 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=2592000' }, body });
        if (!w.ok) throw new Error('PUT ' + w.status);
        copied++; return;
      } catch (e) { if (i === 2) errors.push(key + ': ' + e.message); }
    }
  }
  for (const item of Object.entries(remote)) await copy(item);
  for (let i = 0; i < list.length; i += 16) await Promise.all(list.slice(i, i + 16).map(put));

  let version = '';
  try { version = JSON.parse(files['_version.json'].toString('utf8')).version || ''; } catch (e) { /* нет файла */ }
  const out = { bucket, from: site.from, version, uploaded: done, total: Object.keys(keys).length, images: copied, imagesTotal: Object.keys(remote).length, errors: errors.slice(0, 20) };
  console.log(JSON.stringify(out));
  return { statusCode: errors.length ? 500 : 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(out) };
};
