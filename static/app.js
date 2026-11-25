/* Аксиома — сайт. Тема, меню, заявка, формы, каталог, калькулятор, поиск. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var CFG = (window.AX && window.AX.site) || {};
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var fmt = function (n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  var kw = function (n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); };
  function goal(name, params) { try { if (window.ym && CFG.metrika) window.ym(+CFG.metrika, 'reachGoal', name, params || {}); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- тема ---------- */
  function theme(set) {
    var root = document.documentElement;
    if (set) { root.className = 'ax ' + set; store.set('ax-theme', set); try { localStorage.setItem('ax-theme', set); } catch (e) {} }
    var dark = /\bdark\b/.test(root.className);
    $$('[data-theme-label]').forEach(function (el) { el.textContent = dark ? 'Светлая тема' : 'Тёмная тема'; });
    return dark;
  }
  $$('[data-theme-toggle]').forEach(function (b) { b.addEventListener('click', function () { theme(theme() ? 'light' : 'dark'); }); });
  theme();

  /* ---------- меню ---------- */
  $$('.nav-dd > button').forEach(function (b) {
    b.addEventListener('click', function (e) {
      var dd = b.parentNode, open = !dd.classList.contains('open');
      $$('.nav-dd.open').forEach(function (x) { x.classList.remove('open'); x.firstElementChild.setAttribute('aria-expanded', 'false'); });
      if (open) { dd.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
      e.stopPropagation();
    });
  });
  document.addEventListener('click', function () { $$('.nav-dd.open').forEach(function (x) { x.classList.remove('open'); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $$('.nav-dd.open').forEach(function (x) { x.classList.remove('open'); }); closeMenu(); } });
  var mnav = $('#mnav'), burger = $('[data-burger]');
  function closeMenu() { if (mnav) { mnav.classList.remove('open'); document.body.style.overflow = ''; if (burger) burger.setAttribute('aria-expanded', 'false'); } }
  if (burger && mnav) {
    burger.addEventListener('click', function () { mnav.classList.add('open'); document.body.style.overflow = 'hidden'; burger.setAttribute('aria-expanded', 'true'); var c = $('[data-burger-close]'); if (c) c.focus(); });
    $('[data-burger-close]').addEventListener('click', closeMenu);
  }

  /* ---------- цели Метрики ---------- */
  $$('[data-goal]').forEach(function (a) { a.addEventListener('click', function () { goal(a.getAttribute('data-goal')); }); });
  $$('a[href^="tel:"]').forEach(function (a) { if (!a.hasAttribute('data-goal')) a.addEventListener('click', function () { goal('phone_click'); }); });

  /* ---------- уведомление ---------- */
  var toastEl = $('[data-toast]'), toastT;
  function toast(html) {
    if (!toastEl) return;
    toastEl.innerHTML = html; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 4000);
  }

  /* ---------- заявка (корзина) ---------- */
  var CART = 'ax-cart';
  function cart() { return store.get(CART, []); }
  function saveCart(c) { store.set(CART, c); badge(); }
  function badge() {
    var n = cart().reduce(function (s, x) { return s + (x.q || 1); }, 0);
    $$('[data-cart-count]').forEach(function (b) { b.textContent = n; b.classList.toggle('hidden', !n); b.parentNode.setAttribute('aria-label', 'Заявка' + (n ? ', позиций: ' + n : '')); });
  }
  function addToCart(item, q, install) {
    var c = cart(), f = c.filter(function (x) { return x.id === item.id; })[0];
    if (f) { f.q = (f.q || 1) + (q || 1); if (install) f.m = true; } else { c.push({ id: item.id, t: item.t, u: item.u, p: item.p, img: item.img, q: q || 1, m: !!install }); }
    saveCart(c);
    goal('add_to_cart');
    toast('Добавлено в заявку <a href="/zayavka">Открыть заявку</a>');
  }
  $$('[data-add]').forEach(function (b) {
    b.addEventListener('click', function () { try { addToCart(JSON.parse(b.getAttribute('data-add')), 1); } catch (e) {} });
  });
  var buy = $('[data-buy]');
  if (buy) {
    var qv = $('[data-qty-v]', buy), q = 1;
    $$('[data-qty]', buy).forEach(function (b) { b.addEventListener('click', function () { q = Math.max(1, q + (+b.getAttribute('data-qty'))); qv.textContent = q; }); });
    $('[data-buy-add]', buy).addEventListener('click', function () {
      var inst = $('[data-install]', buy);
      addToCart(JSON.parse(buy.getAttribute('data-buy')), q, inst && inst.checked);
    });
  }
  badge();

  function plural(n, a, b, c) { n = Math.abs(n) % 100; var n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; }

  var cartList = $('[data-cart-list]');
  function renderCart() {
    var c = cart(), form = $('[data-cart-form]'), empty = $('[data-cart-empty]');
    if (!cartList) return;
    form.classList.toggle('hidden', !c.length); empty.classList.toggle('hidden', !!c.length);
    var sum = 0, units = 0, unknown = false;
    cartList.innerHTML = c.map(function (x, i) {
      units += x.q; if (x.p) sum += x.p * x.q; else unknown = true;
      var img = x.img ? '<img src="' + esc(x.img) + '" alt="">' : '';
      return '<div class="cart-row"><div class="cart-img">' + img + '</div><div><a class="pc-n" href="' + esc(x.u) + '">' + esc(x.t) + '</a>' +
        (x.p ? '<p class="ps" style="margin-top: 4px;">' + fmt(x.p) + ' ₽ за шт.</p>' : '<p class="ps" style="margin-top: 4px;">Цена по запросу</p>') +
        '<label class="chk" style="margin: 8px 0 0;"><input type="checkbox" data-m="' + i + '"' + (x.m ? ' checked' : '') + '>Нужен монтаж</label></div>' +
        '<div class="qty"><button type="button" aria-label="Меньше" data-cq="' + i + ':-1">−</button><span>' + x.q + '</span><button type="button" aria-label="Больше" data-cq="' + i + ':1">+</button></div>' +
        '<span class="price">' + (x.p ? fmt(x.p * x.q) + ' ₽' : '—') + '</span>' +
        '<button class="ibtn" type="button" aria-label="Убрать из заявки" data-rm="' + i + '"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    }).join('');
    $('[data-cart-n]').textContent = c.length + ' ' + plural(c.length, 'позиция', 'позиции', 'позиций') + ', ' + units + ' шт.';
    $('[data-cart-sum]').textContent = fmt(sum) + ' ₽';
    $('[data-cart-total]').textContent = (unknown ? 'от ' : '') + fmt(sum) + ' ₽';
  }
  if (cartList) {
    cartList.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      var c = cart();
      if (t.hasAttribute('data-rm')) { c.splice(+t.getAttribute('data-rm'), 1); }
      if (t.hasAttribute('data-cq')) { var a = t.getAttribute('data-cq').split(':'); var it = c[+a[0]]; it.q = Math.max(1, it.q + (+a[1])); }
      saveCart(c); renderCart();
    });
    cartList.addEventListener('change', function (e) { if (e.target.hasAttribute('data-m')) { var c = cart(); c[+e.target.getAttribute('data-m')].m = e.target.checked; saveCart(c); } });
    renderCart();
  }

  /* ---------- формы ---------- */
  function readFiles(input) {
    var files = input ? Array.prototype.slice.call(input.files || []) : [];
    var total = files.reduce(function (s, f) { return s + f.size; }, 0);
    if (total > 2.5 * 1024 * 1024) return Promise.reject(new Error('big'));
    return Promise.all(files.map(function (f) {
      return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res({ name: f.name, type: f.type, data: String(r.result).split(',')[1] }); }; r.onerror = rej; r.readAsDataURL(f); });
    }));
  }
  $$('.drop input[type=file]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var d = inp.parentNode, names = Array.prototype.slice.call(inp.files).map(function (f) { return f.name; });
      d.classList.toggle('has', !!names.length);
      var txt = d.querySelector('[data-drop-t]');
      if (!txt) { txt = document.createElement('span'); txt.setAttribute('data-drop-t', ''); d.appendChild(txt); }
      txt.textContent = names.length ? ' — ' + names.join(', ') : '';
    });
  });
  $$('form[data-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('.fmsg', form), btn = $('button[type=submit]', form);
      msg.className = 'fmsg';
      if (form.website && form.website.value) return;
      var fields = {}, phone = '', mail = '';
      $$('input, textarea, select', form).forEach(function (el) {
        if (el.type === 'file' || el.name === 'website' || el.type === 'checkbox' && !el.closest('.fld')) return;
        var lab = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
        var key = lab ? lab.textContent.trim() : (el.getAttribute('aria-label') || el.name || el.id);
        if (!key || !el.value) return;
        fields[key] = el.value.trim();
        el.classList.remove('bad');
        if (el.type === 'tel') phone = el.value.replace(/\D/g, '');
        if (el.type === 'email') mail = el.value.trim();
      });
      var telEl = $('input[type=tel]', form), mailEl = $('input[type=email]', form);
      if (!(phone.length >= 10) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
        if (telEl) telEl.classList.add('bad'); if (mailEl) mailEl.classList.add('bad');
        msg.textContent = 'Укажите телефон' + (mailEl ? ' или почту' : '') + ', чтобы мы могли с вами связаться.';
        msg.className = 'fmsg err'; (telEl || mailEl).focus(); return;
      }
      var payload = { form: form.getAttribute('data-form'), page: location.pathname, title: document.title, fields: fields, ref: document.referrer || '' };
      if (form.hasAttribute('data-cart-form')) { payload.items = cart(); var cn = store.get('ax-calc', ''); if (cn && payload.items.length) payload.fields['Расчёт'] = cn; }
      btn.disabled = true; var old = btn.textContent; btn.textContent = 'Отправляем…';
      readFiles($('input[type=file]', form)).then(function (files) {
        payload.files = files;
        if (!CFG.forms) { return Promise.reject(new Error('noendpoint')); }
        return fetch(CFG.forms, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function (r) { if (!r.ok) throw new Error('http'); return r.json().catch(function () { return {}; }); });
      }).then(function () {
        goal('form_submit', { form: payload.form });
        if (window.__axSent) window.__axSent({ at: Date.now(), name: (form.closest('section, .card, main') && (form.closest('section, .card, main').querySelector('h2, h1') || {}).textContent || document.title).trim().slice(0, 80), page: location.pathname, items: payload.items ? payload.items.length : 0 });
        msg.textContent = 'Спасибо, заявка отправлена. Менеджер свяжется с вами в рабочее время.'; msg.className = 'fmsg ok';
        form.reset(); $$('.drop', form).forEach(function (d) { d.classList.remove('has'); var t = d.querySelector('[data-drop-t]'); if (t) t.textContent = ''; });
        if (payload.items) { saveCart([]); store.set('ax-calc', ''); }
      }).catch(function (err) {
        msg.textContent = err && err.message === 'big' ? 'Файлы больше 2,5 МБ — отправьте их на Info@aksioma-vent.ru.' :
          err && err.message === 'noendpoint' ? 'Тестовый режим: формы ещё не подключены. Позвоните +7 916 244 85 50 или напишите на Info@aksioma-vent.ru.' :
          'Не удалось отправить. Позвоните +7 916 244 85 50 или напишите на Info@aksioma-vent.ru.';
        msg.className = 'fmsg err';
      }).then(function () { btn.disabled = false; btn.textContent = old; });
    });
  });

  /* ---------- каталог: фильтры и сортировка ---------- */
  $$('[data-filters]').forEach(function (d) { if (window.innerWidth > 1240) d.open = true; });
  var grid = $('[data-grid]');
  if (grid) {
    var cards = $$('[data-p]', grid), state = { brand: [], inv: [], size: [], kind: [], kwb: [], pmin: '', pmax: '' }, sortSel = $('[data-sort]');
    var qs = new URLSearchParams(location.search);
    ['brand', 'inv', 'size', 'kind', 'kwb'].forEach(function (k) { if (qs.get(k)) state[k] = qs.get(k).split(','); });
    ['pmin', 'pmax'].forEach(function (k) { state[k] = qs.get(k) || ''; });
    $$('[data-f]').forEach(function (el) {
      var k = el.getAttribute('data-f');
      if (el.type === 'checkbox') { el.checked = state[k].indexOf(el.value) >= 0; el.addEventListener('change', function () { toggle(k, el.value, el.checked); }); }
      else if (el.tagName === 'BUTTON') { var v = el.getAttribute('data-v'); var on = state[k].indexOf(v) >= 0; el.classList.toggle('chip-on', on); el.setAttribute('aria-pressed', on); el.addEventListener('click', function () { var o = !el.classList.contains('chip-on'); el.classList.toggle('chip-on', o); el.setAttribute('aria-pressed', o); toggle(k, v, o); }); }
      else { el.value = state[k]; el.addEventListener('input', function () { state[k] = el.value; apply(); }); }
    });
    if (qs.get('sort') && sortSel) sortSel.value = qs.get('sort');
    function toggle(k, v, on) { var a = state[k].filter(function (x) { return x !== v; }); if (on) a.push(v); state[k] = a; apply(); }
    $$('[data-f-reset]').forEach(function (b) { b.addEventListener('click', function () { state = { brand: [], inv: [], size: [], kind: [], kwb: [], pmin: '', pmax: '' }; $$('[data-f]').forEach(function (el) { if (el.type === 'checkbox') el.checked = false; else if (el.tagName === 'BUTTON') { el.classList.remove('chip-on'); el.setAttribute('aria-pressed', false); } else el.value = ''; }); apply(); }); });
    if (sortSel) sortSel.addEventListener('change', apply);
    function apply() {
      var n = 0;
      cards.forEach(function (c) {
        var d = c.dataset, price = +d.price || 0, ok = true;
        if (state.brand.length && state.brand.indexOf(d.brand) < 0) ok = false;
        if (state.inv.length && state.inv.indexOf(d.inv) < 0) ok = false;
        if (state.size.length && state.size.indexOf(d.size) < 0) ok = false;
        if (state.kind.length && state.kind.indexOf(d.kind) < 0) ok = false;
        if (state.kwb.length && state.kwb.indexOf(d.kwb) < 0) ok = false;
        if (state.pmin && (!price || price < +state.pmin)) ok = false;
        if (state.pmax && (!price || price > +state.pmax)) ok = false;
        c.hidden = !ok; if (ok) n++;
      });
      var s = sortSel ? sortSel.value : '';
      var sorted = cards.slice().sort(function (a, b) {
        if (s === 'pa') return (+a.dataset.price || 1e9) - (+b.dataset.price || 1e9);
        if (s === 'pd') return (+b.dataset.price || 0) - (+a.dataset.price || 0);
        if (s === 'ka') return (+a.dataset.kw || 0) - (+b.dataset.kw || 0);
        return cards.indexOf(a) - cards.indexOf(b);
      });
      sorted.forEach(function (c) { grid.appendChild(c); });
      var cnt = $('[data-count]'); if (cnt) cnt.textContent = n + ' ' + plural(n, 'модель', 'модели', 'моделей');
      var em = $('[data-empty]'); if (em) em.classList.toggle('hidden', n > 0);
      var p = new URLSearchParams();
      ['brand', 'inv', 'size', 'kind', 'kwb'].forEach(function (k) { if (state[k].length) p.set(k, state[k].join(',')); });
      if (state.pmin) p.set('pmin', state.pmin); if (state.pmax) p.set('pmax', state.pmax); if (s) p.set('sort', s);
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    }
    apply();
  }

  /* ---------- уведомление о cookie ---------- */
  var ck = $('[data-ck].ck');
  if (ck && !store.get('ax-cookie', '')) {
    setTimeout(function () { ck.classList.remove('hidden'); }, 600);
    $$('button[data-ck]', ck).forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-ck'); store.set('ax-cookie', v); ck.classList.add('hidden');
        if (v === 'min') { try { if (window.ym && CFG.metrika) window.ym(+CFG.metrika, 'destruct'); } catch (e) {} toast('Аналитика отключена для этого браузера'); }
      });
    });
  }

  /* ---------- сравнение моделей ---------- */
  var CMP = 'ax-cmp', CMP_MAX = 4;
  var CMP_IC = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16M16 4v16M4 8h8M12 16h8"/></svg>';
  function cmpList() { return store.get(CMP, []); }
  function cmpHas(id) { return cmpList().indexOf(String(id)) > -1; }
  function cmpSet(l) { store.set(CMP, l); cmpSync(); }
  function cmpToggle(id) {
    id = String(id); var l = cmpList(), i = l.indexOf(id);
    if (i > -1) l.splice(i, 1);
    else { if (l.length >= CMP_MAX) { toast('Сравнить можно до ' + CMP_MAX + ' моделей. <a href="/sravnenie">Открыть сравнение</a>'); return; } l.push(id); goal('compare_add'); }
    cmpSet(l);
    if (i < 0 && l.length > 1) toast('Добавлено к сравнению <a href="/sravnenie">Сравнить ' + l.length + '</a>');
  }
  var cmpBar = document.createElement('a');
  cmpBar.className = 'cmp-bar hidden'; cmpBar.href = '/sravnenie';
  function cmpSync() {
    var l = cmpList();
    $$('[data-cmp]').forEach(function (b) { b.setAttribute('aria-pressed', l.indexOf(b.getAttribute('data-cmp')) > -1 ? 'true' : 'false'); });
    cmpBar.innerHTML = CMP_IC + '<span>Сравнение: ' + l.length + '</span>';
    cmpBar.classList.toggle('hidden', !l.length || location.pathname === '/sravnenie');
  }
  document.body.appendChild(cmpBar);
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-cmp]'); if (b) { e.preventDefault(); cmpToggle(b.getAttribute('data-cmp')); } });
  cmpSync();

  var cmpBox = $('[data-cmp-page]');
  if (cmpBox) {
    var onlyDiff = false;
    fetch('/static/compare.json').then(function (r) { return r.json(); }).then(function (all) {
      function draw() {
        var ids = cmpList().filter(function (id) { return all[id]; }), items = ids.map(function (id) { return all[id]; });
        $('[data-cmp-empty]').classList.toggle('hidden', !!items.length);
        $('[data-cmp-tools]').classList.toggle('hidden', !items.length);
        if (!items.length) { cmpBox.innerHTML = ''; return; }
        var keys = [];
        items.forEach(function (p) { p.ch.forEach(function (r) { if (keys.indexOf(r[0]) < 0) keys.push(r[0]); }); });
        var head = '<tr><th scope="col"><span class="sr">Характеристика</span></th>' + items.map(function (p, i) {
          return '<th scope="col"><div class="cmp-h"><button class="cmp-x" type="button" data-cmp-del="' + esc(ids[i]) + '" aria-label="Убрать из сравнения">×</button>' +
            '<a class="cmp-img" href="' + esc(p.u) + '">' + (p.img ? '<img src="' + esc(p.img) + '" alt="" loading="lazy">' : '') + '</a>' +
            '<a class="cmp-n" href="' + esc(p.u) + '">' + esc(p.t) + '</a><b class="cmp-p">' + (p.p ? fmt(p.p) + ' ₽' : 'Цена по запросу') + '</b>' +
            '<button class="btn btn-p btn-s" type="button" data-cmp-add="' + esc(ids[i]) + '">В заявку</button></div></th>';
        }).join('') + '</tr>';
        var body = keys.map(function (k) {
          var vals = items.map(function (p) { var r = p.ch.filter(function (x) { return x[0] === k; })[0]; return r ? r[1] : '—'; });
          var same = vals.every(function (v) { return v === vals[0]; });
          if (onlyDiff && same && items.length > 1) return '';
          return '<tr' + (same || items.length < 2 ? '' : ' class="diff"') + '><th scope="row">' + esc(k) + '</th>' + vals.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>';
        }).join('');
        cmpBox.innerHTML = '<div class="tbl-w cmp-w"><table class="tbl cmp"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
      }
      cmpBox.addEventListener('click', function (e) {
        var d = e.target.closest('[data-cmp-del]'); if (d) { var l = cmpList(); l.splice(l.indexOf(d.getAttribute('data-cmp-del')), 1); cmpSet(l); draw(); return; }
        var a = e.target.closest('[data-cmp-add]'); if (a) { var p = all[a.getAttribute('data-cmp-add')]; addToCart({ id: p.id, t: p.t, u: p.u, p: p.p, img: p.img }, 1); }
      });
      var od = $('[data-cmp-diff]'); if (od) od.addEventListener('change', function () { onlyDiff = od.checked; draw(); });
      var cl = $('[data-cmp-clear]'); if (cl) cl.addEventListener('click', function () { cmpSet([]); draw(); });
      draw();
    });
  }

  /* ---------- подбор на несколько комнат (мульти-сплит или отдельные сплиты) ---------- */
  var mp = $('[data-multi]');
  if (mp) {
    var SIZES = [['07', 2.1], ['09', 2.6], ['12', 3.5], ['18', 5.3], ['24', 7.0]];
    var SUN = [['Мало', 30], ['Средне', 35], ['Много', 40]];
    var rooms = [{ n: 'Спальня', s: 16, sun: 35 }, { n: 'Гостиная', s: 24, sun: 35 }];
    var MP_PRODUCTS = null;
    fetch('/static/products.json').then(function (r) { return r.json(); }).then(function (d) { MP_PRODUCTS = d; draw(); });
    var rowsBox = $('[data-mp-rows]', mp), res = $('[data-mp-res]', mp);
    function need(r) { return r.s * 2.7 * r.sun / 1000 + 0.13; }
    function size(q) { for (var i = 0; i < SIZES.length; i++) if (SIZES[i][1] >= q) return SIZES[i]; return null; }
    function cheapest(z) {
      if (!MP_PRODUCTS) return null;
      return MP_PRODUCTS.filter(function (p) { return p.sec === 'split' && p.z === z && p.inv && p.p; }).sort(function (a, b) { return a.p - b.p; })[0] || null;
    }
    function rowsHtml() {
      return rooms.map(function (r, i) {
        return '<div class="mp-r"><input class="inp" aria-label="Комната" value="' + esc(r.n) + '" data-i="' + i + '" data-k="n">' +
          '<label class="mp-s"><input class="inp" type="number" min="5" max="150" inputmode="numeric" aria-label="Площадь, м²" value="' + r.s + '" data-i="' + i + '" data-k="s"><span>м²</span></label>' +
          '<select class="inp" aria-label="Солнце" data-i="' + i + '" data-k="sun">' + SUN.map(function (x) { return '<option value="' + x[1] + '"' + (x[1] === r.sun ? ' selected' : '') + '>Солнце: ' + x[0].toLowerCase() + '</option>'; }).join('') + '</select>' +
          '<button class="ibtn" type="button" aria-label="Удалить комнату" data-del="' + i + '"' + (rooms.length < 2 ? ' disabled' : '') + '>×</button></div>';
      }).join('');
    }
    function draw(full) {
      if (full !== false) rowsBox.innerHTML = rowsHtml();
      var list = rooms.map(function (r) { var q = need(r), z = size(q); return { r: r, q: q, z: z }; });
      var total = list.reduce(function (s, x) { return s + (x.z ? x.z[1] : x.q); }, 0);
      var big = list.some(function (x) { return !x.z; });
      var n = rooms.length, verdict, cls;
      if (big) { verdict = 'В одной из комнат нужно больше 7 кВт — для неё подойдёт полупромышленный кондиционер. Подберём схему под объект.'; cls = 'warn'; }
      else if (n === 1) { verdict = 'На одну комнату достаточно обычной сплит-системы.'; cls = 'ok'; }
      else if (n <= 5 && total <= 12.3) { verdict = 'Подойдёт мульти-сплит-система: один наружный блок на ' + n + ' ' + plural(n, 'комнату', 'комнаты', 'комнат') + '. По каталогу Kentatsu мульти-сплит-системы — от 4,1 до 12,3 кВт и до 5 внутренних блоков на один наружный. Точную комбинацию инженер проверит по таблицам совместимости.'; cls = 'ok'; }
      else { verdict = (n > 5 ? 'Больше 5 комнат' : 'Суммарно больше 12,3 кВт') + ' — для одного наружного блока мульти-сплита это много. Варианты: две мульти-сплит-системы, отдельные сплиты или VRF-система. Подберём.'; cls = 'warn'; }
      var need_sum = list.reduce(function (s, x) { return s + x.q; }, 0), odu = '';
      if (cls === 'ok' && n > 1 && MP_PRODUCTS) {
        var fit = MP_PRODUCTS.filter(function (p) { return p.r === 'outdoor' && p.n >= n && p.kw >= need_sum; }).sort(function (a, b) { return a.kw - b.kw; });
        var pick = [], seenB = {};
        fit.forEach(function (p) { seenB[p.b] = (seenB[p.b] || 0) + 1; if (seenB[p.b] <= 2) pick.push(p); });
        if (pick.length) odu = '<div class="mp-odu"><p class="ps" style="margin: 0 0 8px;">Наружные блоки из каталога, к которым подключается ' + n + ' ' + plural(n, 'внутренний блок', 'внутренних блока', 'внутренних блоков') + ', с номинальной мощностью от ' + kw(need_sum) + ' кВт:</p><div class="mp-odu-l">' +
          pick.map(function (p) { return '<a class="mp-odu-i" href="' + p.u + '"><b>' + esc(p.b + ' ' + p.s.replace('Наружный блок ' + p.b + ' ', '')) + '</b><span>' + kw(p.kw) + ' кВт · до ' + p.n + ' блоков</span></a>'; }).join('') + '</div></div>';
      }
      var sep = list.map(function (x) { return x.z ? cheapest(x.z[0]) : null; });
      var sepSum = sep.every(Boolean) ? sep.reduce(function (s, p) { return s + p.p; }, 0) : 0;
      res.innerHTML = '<div class="mp-tbl">' + list.map(function (x, i) {
        return '<div class="mp-li"><b>' + esc(x.r.n || 'Комната') + '</b><span>' + x.r.s + ' м² → нужно ~' + kw(x.q) + ' кВт</span><span class="mp-z">' + (x.z ? 'типоразмер ' + x.z[0] : 'больше 7 кВт') + '</span></div>';
      }).join('') + '<div class="mp-li mp-sum"><b>Итого</b><span>' + kw(total) + ' кВт по внутренним блокам</span><span></span></div></div>' +
        '<p class="mp-v mp-' + cls + '">' + verdict + '</p>' + odu +
        '<div class="mp-a"><a class="btn btn-p" href="#pd-obj" data-mp-send>Отправить на подбор мульти-сплита</a>' +
        (sepSum && n > 1 ? '<button class="btn btn-o" type="button" data-mp-sep>Отдельные сплиты в заявку — от ' + fmt(sepSum) + ' ₽</button>' : '') + '</div>' +
        (sepSum && n > 1 ? '<p class="ps" style="margin: 8px 0 0;">Цена отдельных сплит-систем — по самым доступным инверторным моделям нужных типоразмеров из каталога, без монтажа.</p>' : '');
    }
    mp.addEventListener('input', function (e) {
      var t = e.target, i = t.getAttribute('data-i'); if (i == null) return;
      var k = t.getAttribute('data-k'); rooms[+i][k] = k === 'n' ? t.value : Math.max(0, +t.value || 0); draw(false);
    });
    mp.addEventListener('change', function (e) { var t = e.target; if (t.getAttribute('data-k') === 'sun') { rooms[+t.getAttribute('data-i')].sun = +t.value; draw(false); } });
    mp.addEventListener('click', function (e) {
      var d = e.target.closest('[data-del]'); if (d) { rooms.splice(+d.getAttribute('data-del'), 1); draw(); return; }
      if (e.target.closest('[data-mp-add]')) { if (rooms.length >= 8) return; rooms.push({ n: 'Комната ' + (rooms.length + 1), s: 15, sun: 35 }); draw(); return; }
      if (e.target.closest('[data-mp-send]')) {
        var ta = $('#pd-obj'); if (ta) { ta.value = rooms.map(function (r) { var z = size(need(r)); return r.n + ': ' + r.s + ' м², ' + (z ? 'типоразмер ' + z[0] : 'больше 7 кВт'); }).join('\n'); }
        goal('multi_send'); return;
      }
      if (e.target.closest('[data-mp-sep]')) {
        rooms.forEach(function (r) { var z = size(need(r)), p = z && cheapest(z[0]); if (p) addToCart({ id: p.id, t: p.t, u: p.u, p: p.p, img: p.img }, 1); });
        store.set('ax-calc', 'Подбор на несколько комнат: ' + rooms.map(function (r) { return r.n + ' ' + r.s + ' м²'; }).join(', '));
        goal('multi_sep');
      }
    });
    draw();
  }

  /* ---------- калькулятор ---------- */
  var calc = $('[data-calc]');
  if (calc) {
    var st = { mode: location.hash === '#conv' ? 'conv' : 'ac', s: 20, h: 2.7, sun: 35, people: 1, pc: 1, tv: 0, ins: 100, inv: 'all' }, PRODUCTS = null, lastQ = 0;
    $$('[data-inv]', calc).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); st.inv = a.getAttribute('data-inv'); seg(a); calcRun(); }); });
    function calcNote() {
      return st.mode === 'ac'
        ? 'Расчёт калькулятора: комната ' + st.s + ' м², потолок ' + kw(st.h) + ' м, людей ' + st.people + ', ПК ' + st.pc + ', ТВ ' + st.tv + ' → нужно около ' + kw(lastQ) + ' кВт холода'
        : 'Расчёт калькулятора: комната ' + st.s + ' м², потолок ' + kw(st.h) + ' м → нужно около ' + kw(lastQ) + ' кВт тепла';
    }
    calc.addEventListener('click', function (e) {
      var b = e.target.closest('[data-calc-add]'); if (!b || !PRODUCTS) return;
      var p = PRODUCTS.filter(function (x) { return String(x.id) === b.getAttribute('data-calc-add'); })[0]; if (!p) return;
      store.set('ax-calc', calcNote());
      addToCart({ id: p.id, t: p.t, u: p.u, p: p.p, img: p.img }, 1);
      goal('calc_add');
    });
    fetch('/static/products.json').then(function (r) { return r.json(); }).then(function (d) { PRODUCTS = d; calcRun(); });
    $$('[data-in]', calc).forEach(function (el) { el.addEventListener('input', function () { st[el.getAttribute('data-in')] = +el.value; calcRun(); }); });
    $$('[data-sun]', calc).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); st.sun = +a.getAttribute('data-sun'); seg(a); calcRun(); }); });
    $$('[data-ins]', calc).forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); st.ins = +a.getAttribute('data-ins'); seg(a); calcRun(); }); });
    $$('[data-step]', calc).forEach(function (b) { b.addEventListener('click', function () { var a = b.getAttribute('data-step').split(':'); st[a[0]] = Math.max(0, Math.min(30, st[a[0]] + (+a[1]))); calcRun(); }); });
    $$('[data-calc-tab]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); st.mode = a.getAttribute('data-calc-tab'); history.replaceState(null, '', '#' + st.mode); tabs(); calcRun(); }); });
    function seg(a) { $$('a', a.parentNode).forEach(function (x) { x.classList.toggle('on', x === a); x.setAttribute('aria-checked', x === a); }); }
    function tabs() {
      $$('[data-calc-tab]').forEach(function (a) { var on = a.getAttribute('data-calc-tab') === st.mode; a.classList.toggle('on', on); a.setAttribute('aria-selected', on); });
      $$('[data-ac-only]', calc).forEach(function (x) { x.classList.toggle('hidden', st.mode !== 'ac'); });
      $$('[data-conv-only]', calc).forEach(function (x) { x.classList.toggle('hidden', st.mode !== 'conv'); });
      $('[data-formula]', calc).textContent = st.mode === 'ac' ? 'Q = S × h × q / 1000 + 0,13 × люди + 0,3 × ПК + 0,2 × ТВ, где q — 30, 35 или 40 Вт/м³ в зависимости от солнца.' : 'Q = S × 100–150 Вт/м² при потолке до 2,7 м; выше — пропорционально высоте. Мощность делят на несколько конвекторов, если окон больше одного.';
      $('[data-res-label]', calc).textContent = st.mode === 'ac' ? 'Нужна мощность охлаждения' : 'Нужна мощность отопления';
    }
    tabs();
    function calcRun() {
      $$('[data-out]', calc).forEach(function (o) { var k = o.getAttribute('data-out'); o.textContent = k === 'h' ? kw(st.h) : st[k]; });
      var Q, hint, list = [], all = $('[data-res-all]', calc);
      if (st.mode === 'ac') {
        Q = st.s * st.h * st.sun / 1000 + 0.13 * st.people + 0.3 * st.pc + 0.2 * st.tv;
        var sizes = [['07', 2.1], ['09', 2.6], ['12', 3.5], ['18', 5.3], ['24', 7.0]], pick = null;
        for (var i = 0; i < sizes.length; i++) if (sizes[i][1] >= Q) { pick = sizes[i]; break; }
        hint = pick ? 'Подойдёт типоразмер <b style="color: var(--band-ink);">' + pick[0] + '</b> — около ' + kw(pick[1]) + ' кВт' : 'Больше 7 кВт — нужен мульти-сплит или полупромышленная система. <a href="/katalog/polupromyshlennye-kondicionery" style="color:#F7B27A">Подберём</a>';
        if (PRODUCTS && pick) list = PRODUCTS.filter(function (p) { return p.sec === 'split' && p.z === pick[0] && (st.inv === 'all' || (st.inv === 'inv') === !!p.inv); }).sort(function (a, b) { return (a.p || 1e9) - (b.p || 1e9); }).slice(0, 6);
        all.href = '/katalog/326672621123-split-sistemi' + (pick ? '?size=' + pick[0] : '');
      } else {
        Q = st.s * st.ins / 1000 * Math.max(1, st.h / 2.7);
        hint = 'Можно разделить на несколько конвекторов — по одному у каждого окна.';
        if (PRODUCTS) {
          var cands = PRODUCTS.filter(function (p) { return p.sec === 'nobo' && p.kw; });
          var one = cands.filter(function (p) { return p.kw >= Q; }).sort(function (a, b) { return a.kw - b.kw || (a.p || 0) - (b.p || 0); });
          if (one.length) list = one.slice(0, 6);
          else { var big = cands.sort(function (a, b) { return b.kw - a.kw; })[0]; if (big) { var n = Math.ceil(Q / big.kw); hint = 'Понадобится ' + n + ' ' + plural(n, 'конвектор', 'конвектора', 'конвекторов') + ' по ' + kw(big.kw) + ' кВт или больше.'; list = [big]; } }
        }
        all.href = '/katalog/654662302513-konvektori-nobo';
      }
      lastQ = Q;
      $$('[data-inv-wrap]', calc).forEach(function (x) { x.classList.toggle('hidden', st.mode !== 'ac'); });
      $('[data-res]', calc).textContent = kw(Q);
      $('[data-res-hint]', calc).innerHTML = hint;
      var box = $('[data-res-list]', calc);
      box.innerHTML = list.length ? list.map(function (p) {
        var img = p.img ? '<img src="' + esc(p.img) + '" alt="" loading="lazy">' : '';
        var meta = [p.kw ? kw(p.kw) + ' кВт' : '', p.sec === 'split' ? (p.inv ? 'инвертор' : 'on/off') : '', p.a || ''].filter(Boolean).join(' · ');
        return '<div class="cr"><a class="cr-img" href="' + esc(p.u) + '" tabindex="-1" aria-hidden="true">' + img + '</a>' +
          '<div class="cr-b"><a class="cr-n" href="' + esc(p.u) + '">' + esc(p.s) + '</a><span class="cr-m">' + esc(meta) + '</span>' +
          '<span class="cr-p">' + (p.p ? fmt(p.p) + ' ₽' : 'Цена по запросу') + '</span></div>' +
          '<div class="cr-a"><button class="btn btn-p btn-s" type="button" data-calc-add="' + esc(p.id) + '">В заявку</button>' +
          '<button class="cmp-t" type="button" data-cmp="' + esc(p.id) + '" aria-pressed="' + (cmpHas(p.id) ? 'true' : 'false') + '" title="Добавить к сравнению">' + CMP_IC + '<span>Сравнить</span></button></div></div>';
      }).join('') : '<p class="ps">Подберём модель по запросу.</p>';
    }
    calcRun();
  }

  /* ---------- вопросы: поиск по ответам ---------- */
  var fs = $('[data-faq-search]');
  if (fs) {
    var openHash = function () { if (location.hash) { var d = document.getElementById(location.hash.slice(1)); if (d && d.tagName === 'DETAILS') d.open = true; } };
    openHash(); window.addEventListener('hashchange', openHash);
    fs.addEventListener('input', function () {
      var v = fs.value.trim().toLowerCase(), any = false;
      $$('[data-faq-g]').forEach(function (g) {
        var vis = 0;
        $$('[data-faq-i]', g).forEach(function (d) { var ok = !v || d.textContent.toLowerCase().indexOf(v) >= 0; d.classList.toggle('hidden', !ok); if (ok) vis++; if (v && ok) d.open = true; });
        g.classList.toggle('hidden', !vis); if (vis) any = true;
      });
      $('[data-faq-empty]').classList.toggle('hidden', any);
    });
  }

  /* ---------- поиск по сайту ---------- */
  var sres = $('[data-search-res]');
  if (sres) {
    var qInp = $('[data-search-q]'), tabsBox = $('[data-search-tabs]'), kind = '', IDX = [];
    var KN = { p: 'Товары', q: 'Ответы', a: 'Статьи', s: 'Разделы' };
    qInp.value = new URLSearchParams(location.search).get('q') || '';
    fetch('/static/search.json').then(function (r) { return r.json(); }).then(function (d) { IDX = d; run(); });
    qInp.addEventListener('input', function () { history.replaceState(null, '', '/poisk?q=' + encodeURIComponent(qInp.value)); run(); });
    $('[data-search-form]').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/м2/g, 'м²').replace(/[«»"]/g, ''); }
    function run() {
      var words = norm(qInp.value).replace(/\d+\s*(м²|м|кв\.?\s*м)/g, ' ').split(/[\s,]+/).filter(function (w) { return w.length > 1 && !/^\d+$/.test(w); });
      var num = (qInp.value.match(/(\d+)\s*(м|кв)/) || [])[1];
      var hits = !words.length && !num ? [] : IDX.map(function (it) {
        var hay = norm(it.t + ' ' + (it.d || '') + ' ' + (it.w || '')), title = norm(it.t + ' ' + (it.w || '')), sc = 0;
        words.forEach(function (w) { var stem = w.length > 5 ? w.slice(0, w.length - 2) : w; if (title.indexOf(stem) >= 0) sc += 3; else if (hay.indexOf(stem) >= 0) sc += 1; });
        if (num && it.k === 'p' && it.d) { var m = it.d.match(/до (\d+)/); if (m && +m[1] >= +num && +m[1] - +num <= 15) sc += 2; }
        return { it: it, sc: sc };
      }).filter(function (x) { return x.sc >= Math.max(1, words.length) || (!words.length && x.sc >= 2); }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 60);
      var counts = {}; hits.forEach(function (h) { counts[h.it.k] = (counts[h.it.k] || 0) + 1; });
      $('[data-search-n]').textContent = words.length ? 'Найдено: ' + hits.length : '';
      tabsBox.innerHTML = hits.length ? ['<button type="button" class="chip' + (!kind ? ' chip-on' : '') + '" data-k="">Всё <b>' + hits.length + '</b></button>'].concat(Object.keys(KN).filter(function (k) { return counts[k]; }).map(function (k) { return '<button type="button" class="chip' + (kind === k ? ' chip-on' : '') + '" data-k="' + k + '">' + KN[k] + ' <b>' + counts[k] + '</b></button>'; })).join('') : '';
      var shown = hits.filter(function (h) { return !kind || h.it.k === kind; });
      var mark = function (s) { s = esc(s); words.forEach(function (w) { if (w.length > 2) s = s.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); }); return s; };
      sres.innerHTML = !words.length ? '<p class="ps">Введите запрос: модель, площадь, тип оборудования или вопрос.</p>' : !shown.length ? '<div class="empty"><b style="display: block;">Ничего не нашлось</b><p class="ps">Попробуйте другие слова или позвоните нам.</p></div>' :
        shown.map(function (h) {
          var it = h.it, ic = it.k === 'p' ? (it.img ? '<span class="cart-img" style="width: 72px; height: 56px;"><img src="' + esc(it.img) + '" alt="" loading="lazy"></span>' : '') : '<span class="ico">' + (it.k === 'q' ? '?' : it.k === 'a' ? '§' : '›') + '</span>';
          return '<a class="hit" href="' + esc(it.u) + '">' + ic + '<div style="flex: 1; min-width: 0;"><b style="display: block;">' + mark(it.t) + '</b><span class="ps" style="display: block; margin: 4px 0 0;">' + mark((it.d || '').slice(0, 180)) + '</span></div>' + (it.k === 'p' ? '<span class="price" style="font-size: 17px;">' + (it.p ? fmt(it.p) + ' ₽' : '') + '</span>' : '') + '</a>';
        }).join('');
      if (words.length) goal('search');
    }
    tabsBox.addEventListener('click', function (e) { var b = e.target.closest('[data-k]'); if (b) { kind = b.getAttribute('data-k'); run(); } });
  }

  /* ---------- аккаунт (общий с «Аналогично!») ---------- */
  var AUTH = { token: '', user: null };
  try { var sv = JSON.parse(localStorage.getItem('ax-auth') || 'null'); if (sv && sv.token) { AUTH.token = sv.token; AUTH.user = sv.user || null; } } catch (e) {}
  function saveAuth() { try { localStorage.setItem('ax-auth', JSON.stringify(AUTH.token ? AUTH : null)); } catch (e) {} }
  function authApi(body) {
    if (!CFG.auth) return Promise.reject(new Error('Вход временно недоступен.'));
    return fetch(CFG.auth, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var er = new Error(j.error || 'Сервис временно недоступен. Попробуйте позже.'); er.status = r.status; throw er; } return j; }); },
        function () { throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'); });
  }
  var hasProfile = function () { return !!(AUTH.token && AUTH.user && AUTH.user.fio); };
  // после входа возвращаем туда, откуда пришли (?next=/biblioteka)
  function goNext() { var n = new URLSearchParams(location.search).get('next') || ''; if (/^\/[^\/\\]/.test(n)) setTimeout(function () { location.href = n; }, 600); }
  /* ---------- библиотека проектировщика ---------- */
  var libCards = $$('[data-lib]');
  if (libCards.length) {
    var logged = !!AUTH.token, gate = $('[data-lib-gate]'), u0 = AUTH.user || {};
    if (gate) gate.hidden = logged;
    libCards.forEach(function (card) {
      var d = {}; try { d = JSON.parse(card.getAttribute('data-lib')); } catch (e) {}
      var nextUrl = '/kabinet?next=' + encodeURIComponent('/biblioteka#' + d.id);
      var dls = $$('[data-lib-dl]', card), rq = $('[data-lib-req]', card);
      dls.forEach(function (dl, i) {
        if (!logged) { if (i) { dl.hidden = true; return; } dl.removeAttribute('download'); dl.href = nextUrl; dl.textContent = 'Войти и скачать'; }
        else dl.addEventListener('click', function () { goal('lib_download', { doc: d.id }); });
      });
      if (rq) {
        if (!logged) rq.textContent = 'Войти и получить';
        rq.addEventListener('click', function () {
          if (!logged) { location.href = nextUrl; return; }
          if (!CFG.forms) return;
          rq.disabled = true; rq.textContent = 'Отправляем…';
          var f = { 'Каталог': d.t, 'Почта': u0.email || '', 'Имя': u0.fio || '', 'Телефон': u0.phone || '', 'Организация': u0.company || '' };
          fetch(CFG.forms, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'biblioteka', page: location.pathname, title: document.title, fields: f, ref: '' }) })
            .then(function (r) { if (!r.ok) throw new Error('http'); rq.textContent = 'Пришлём на ' + (u0.email || 'почту'); goal('lib_request', { doc: d.id }); })
            .catch(function () { rq.disabled = false; rq.textContent = 'Не отправилось — ещё раз'; });
        });
      }
    });
  }

  // заявки, отправленные с этого устройства
  function sentList() { try { return JSON.parse(localStorage.getItem('ax-sent') || '[]'); } catch (e) { return []; } }
  window.__axSent = function (rec) { try { var l = sentList(); l.unshift(rec); localStorage.setItem('ax-sent', JSON.stringify(l.slice(0, 30))); } catch (e) {} };

  // автозаполнение контактов в формах сайта
  function autofill() {
    if (!hasProfile()) return;
    var u = AUTH.user, map = [[/^(имя|фио|контактное лицо|ваше имя)/i, u.fio], [/телефон/i, u.phone], [/почт/i, u.email], [/организац|компан/i, [u.company, u.inn ? 'ИНН ' + u.inn : ''].filter(Boolean).join(', ')]];
    $$('form[data-form] input, form[data-form] textarea').forEach(function (el) {
      if (el.value || el.type === 'file' || el.type === 'checkbox' || el.name === 'website') return;
      var lab = el.id ? document.querySelector('label[for="' + el.id + '"]') : null, t = lab ? lab.textContent.trim() : (el.getAttribute('aria-label') || '');
      for (var k = 0; k < map.length; k++) if (map[k][0].test(t) && map[k][1]) { el.value = map[k][1]; break; }
    });
  }
  autofill();
  $$('a[href="/kabinet"]').forEach(function (a) { if (hasProfile()) { var n = a.lastChild; if (n && n.nodeType === 3 && /Войти/.test(n.textContent)) n.textContent = AUTH.user.fio.split(' ').slice(0, 2).reverse().join(' ').split(' ')[0]; } });

  /* ---------- кабинет ---------- */
  var kbOut = $('[data-auth-out]'), kbIn = $('[data-auth-in]');
  if (kbOut && kbIn) {
    var f1 = $('[data-kb-step="1"]'), f2 = $('[data-kb-step="2"]'), pf = $('[data-kb-profile]'), email = '';
    var say = function (f, t, bad) { var m = $('.fmsg', f); m.textContent = t; m.className = 'fmsg' + (t ? (bad ? ' err' : ' ok') : ''); };
    var innValid = function (v) { var d = String(v).replace(/\D/g, ''); if (!/^(\d{10}|\d{12})$/.test(d)) return false; var c = function (w, n) { var s = 0; for (var i = 0; i < w.length; i++) s += w[i] * +d[i]; return (s % 11) % 10 === +d[n]; }; return d.length === 10 ? c([2, 4, 10, 3, 5, 9, 4, 6, 8], 9) : c([7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 10) && c([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 11); };
    function show() {
      var inn = !!AUTH.token;
      kbOut.classList.toggle('hidden', inn); kbIn.classList.toggle('hidden', !inn);
      if (!inn) { f1.classList.remove('hidden'); f2.classList.add('hidden'); return; }
      var u = AUTH.user || {};
      $('[data-kb-ini]').textContent = (u.fio || u.email || '?').split(' ').slice(0, 2).map(function (x) { return x[0] || ''; }).join('').toUpperCase();
      $('[data-kb-name]').textContent = u.fio || 'Заполните профиль';
      $('[data-kb-sub]').textContent = [u.company, u.email].filter(Boolean).join(' · ');
      $('[data-kb-ptitle]').textContent = u.fio ? 'Профиль' : 'Расскажите о себе';
      $('[data-kb-pnote]').textContent = u.fio ? 'Эти данные подставляются в заявки и формы сайта.' : 'Один раз — и данные будут подставляться в заявки. Анкета общая с «Аналогично!».';
      $('#p-fio').value = u.fio || ''; $('#p-phone').value = u.phone || ''; $('#p-pos').value = u.position || '';
      $('#p-company').value = u.company || ''; $('#p-inn').value = u.inn || ''; $('#p-mail').value = u.email || email || '';
      $('#p-ok').checked = !!u.fio;
      var l = sentList(), box = $('[data-kb-sent]');
      box.innerHTML = l.length ? l.map(function (r) {
        var d = new Date(r.at); return '<div class="it"><div><b>' + esc(r.name) + '</b>' + (r.items ? esc(r.items + ' поз.') : esc(r.page || '')) + '</div><span>' + d.toLocaleDateString('ru-RU') + '</span></div>';
      }).join('') : '<div class="empty-s">Пока нет отправленных заявок</div>';
    }
    f1.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#l-mail').value.trim(), b = $('button', f1);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return say(f1, 'Проверьте адрес почты.', true);
      say(f1, 'Отправляем код…'); b.disabled = true;
      authApi({ action: 'send-code', email: v }).then(function () {
        email = v; $('[data-kb-mail]').textContent = v; $('#l-code').value = ''; say(f2, '');
        f1.classList.add('hidden'); f2.classList.remove('hidden'); $('#l-code').focus();
      }, function (er) { say(f1, er.message, true); }).then(function () { b.disabled = false; });
    });
    $('[data-kb-back]').addEventListener('click', function () { f2.classList.add('hidden'); f1.classList.remove('hidden'); say(f1, ''); $('#l-mail').focus(); });
    f2.addEventListener('submit', function (e) {
      e.preventDefault();
      var code = $('#l-code').value.replace(/\D/g, ''), b = $('button[type=submit]', f2);
      if (code.length !== 6) return say(f2, 'Введите 6 цифр из письма.', true);
      say(f2, 'Проверяем…'); b.disabled = true;
      authApi({ action: 'verify', email: email, code: code }).then(function (j) {
        AUTH.token = j.token; AUTH.user = j.user || { email: email }; saveAuth(); goal('auth_login'); show();
        if (!hasProfile()) $('#p-fio').focus(); else goNext();
      }, function (er) { say(f2, er.message, true); }).then(function () { b.disabled = false; });
    });
    pf.addEventListener('submit', function (e) {
      e.preventDefault();
      var p = { fio: $('#p-fio').value.trim(), phone: $('#p-phone').value.trim(), position: $('#p-pos').value.trim(), company: $('#p-company').value.trim(), inn: $('#p-inn').value.replace(/\D/g, ''), consent: $('#p-ok').checked };
      var errs = [];
      if (p.fio.split(/\s+/).filter(Boolean).length < 2) errs.push('укажите фамилию и имя');
      if (p.phone.replace(/\D/g, '').length < 10) errs.push('проверьте телефон');
      if (!p.company) errs.push('укажите компанию');
      if (!innValid(p.inn)) errs.push('проверьте ИНН');
      if (!p.consent) errs.push('отметьте согласие на обработку данных');
      if (errs.length) return say(pf, 'Пожалуйста, ' + errs.join(', ') + '.', true);
      var b = $('button[type=submit]', pf); say(pf, 'Сохраняем…'); b.disabled = true;
      var body = { action: 'register', token: AUTH.token }; for (var k in p) body[k] = p[k];
      authApi(body).then(function (j) { AUTH.user = j.user; saveAuth(); goal('auth_register'); show(); say(pf, 'Сохранено.'); goNext(); },
        function (er) { if (er.status === 401) { AUTH.token = ''; AUTH.user = null; saveAuth(); show(); say(f1, 'Сессия истекла — запросите код ещё раз.', true); } else say(pf, er.message, true); })
        .then(function () { b.disabled = false; });
    });
    $('[data-kb-out]').addEventListener('click', function () { AUTH.token = ''; AUTH.user = null; saveAuth(); show(); });
    show();
    // сохранённый вход ещё действует? заодно подтягиваем профиль
    if (AUTH.token) authApi({ action: 'me', token: AUTH.token }).then(function (j) { AUTH.user = j.user; saveAuth(); show(); }, function (er) { if (er.status === 401) { AUTH.token = ''; AUTH.user = null; saveAuth(); show(); } });
  }
  /* ---------- Аксик-помощник ---------- */
  var aks = $('[data-aks]');
  if (aks) {
    var ab = $('[data-aks-btn]', aks), ap = $('#aks-panel');
    var setAks = function (open) { ap.hidden = !open; ab.setAttribute('aria-expanded', open ? 'true' : 'false'); aks.classList.toggle('on', open); };
    ab.addEventListener('click', function (e) { e.stopPropagation(); setAks(ap.hidden); if (!ap.hidden) goal('aksik_open'); });
    document.addEventListener('click', function (e) { if (!aks.contains(e.target)) setAks(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setAks(false); });
  }
})();
