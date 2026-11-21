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
      if (form.hasAttribute('data-cart-form')) payload.items = cart();
      btn.disabled = true; var old = btn.textContent; btn.textContent = 'Отправляем…';
      readFiles($('input[type=file]', form)).then(function (files) {
        payload.files = files;
        if (!CFG.forms) { return Promise.reject(new Error('noendpoint')); }
        return fetch(CFG.forms, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function (r) { if (!r.ok) throw new Error('http'); return r.json().catch(function () { return {}; }); });
      }).then(function () {
        goal('form_submit', { form: payload.form });
        msg.textContent = 'Спасибо, заявка отправлена. Менеджер свяжется с вами в рабочее время.'; msg.className = 'fmsg ok';
        form.reset(); $$('.drop', form).forEach(function (d) { d.classList.remove('has'); var t = d.querySelector('[data-drop-t]'); if (t) t.textContent = ''; });
        if (payload.items) { saveCart([]); }
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
    var cards = $$('[data-p]', grid), state = { brand: [], inv: [], size: [], pmin: '', pmax: '' }, sortSel = $('[data-sort]');
    var qs = new URLSearchParams(location.search);
    ['brand', 'inv', 'size'].forEach(function (k) { if (qs.get(k)) state[k] = qs.get(k).split(','); });
    ['pmin', 'pmax'].forEach(function (k) { state[k] = qs.get(k) || ''; });
    $$('[data-f]').forEach(function (el) {
      var k = el.getAttribute('data-f');
      if (el.type === 'checkbox') { el.checked = state[k].indexOf(el.value) >= 0; el.addEventListener('change', function () { toggle(k, el.value, el.checked); }); }
      else if (el.tagName === 'BUTTON') { var v = el.getAttribute('data-v'); var on = state[k].indexOf(v) >= 0; el.classList.toggle('chip-on', on); el.setAttribute('aria-pressed', on); el.addEventListener('click', function () { var o = !el.classList.contains('chip-on'); el.classList.toggle('chip-on', o); el.setAttribute('aria-pressed', o); toggle(k, v, o); }); }
      else { el.value = state[k]; el.addEventListener('input', function () { state[k] = el.value; apply(); }); }
    });
    if (qs.get('sort') && sortSel) sortSel.value = qs.get('sort');
    function toggle(k, v, on) { var a = state[k].filter(function (x) { return x !== v; }); if (on) a.push(v); state[k] = a; apply(); }
    $$('[data-f-reset]').forEach(function (b) { b.addEventListener('click', function () { state = { brand: [], inv: [], size: [], pmin: '', pmax: '' }; $$('[data-f]').forEach(function (el) { if (el.type === 'checkbox') el.checked = false; else if (el.tagName === 'BUTTON') { el.classList.remove('chip-on'); el.setAttribute('aria-pressed', false); } else el.value = ''; }); apply(); }); });
    if (sortSel) sortSel.addEventListener('change', apply);
    function apply() {
      var n = 0;
      cards.forEach(function (c) {
        var d = c.dataset, price = +d.price || 0, ok = true;
        if (state.brand.length && state.brand.indexOf(d.brand) < 0) ok = false;
        if (state.inv.length && state.inv.indexOf(d.inv) < 0) ok = false;
        if (state.size.length && state.size.indexOf(d.size) < 0) ok = false;
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
      ['brand', 'inv', 'size'].forEach(function (k) { if (state[k].length) p.set(k, state[k].join(',')); });
      if (state.pmin) p.set('pmin', state.pmin); if (state.pmax) p.set('pmax', state.pmax); if (s) p.set('sort', s);
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    }
    apply();
  }

  /* ---------- калькулятор ---------- */
  var calc = $('[data-calc]');
  if (calc) {
    var st = { mode: location.hash === '#conv' ? 'conv' : 'ac', s: 20, h: 2.7, sun: 35, people: 1, pc: 1, tv: 0, ins: 100 }, PRODUCTS = null;
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
        if (PRODUCTS && pick) list = PRODUCTS.filter(function (p) { return p.sec === 'split' && p.z === pick[0]; }).sort(function (a, b) { return (a.p || 1e9) - (b.p || 1e9); }).slice(0, 4);
        all.href = '/katalog/326672621123-split-sistemi' + (pick ? '?size=' + pick[0] : '');
      } else {
        Q = st.s * st.ins / 1000 * Math.max(1, st.h / 2.7);
        hint = 'Можно разделить на несколько конвекторов — по одному у каждого окна.';
        if (PRODUCTS) {
          var cands = PRODUCTS.filter(function (p) { return p.sec === 'nobo' && p.kw; });
          var one = cands.filter(function (p) { return p.kw >= Q; }).sort(function (a, b) { return a.kw - b.kw || (a.p || 0) - (b.p || 0); });
          if (one.length) list = one.slice(0, 4);
          else { var big = cands.sort(function (a, b) { return b.kw - a.kw; })[0]; if (big) { var n = Math.ceil(Q / big.kw); hint = 'Понадобится ' + n + ' ' + plural(n, 'конвектор', 'конвектора', 'конвекторов') + ' по ' + kw(big.kw) + ' кВт или больше.'; list = [big]; } }
        }
        all.href = '/katalog/654662302513-konvektori-nobo';
      }
      $('[data-res]', calc).textContent = kw(Q);
      $('[data-res-hint]', calc).innerHTML = hint;
      var box = $('[data-res-list]', calc);
      box.innerHTML = list.length ? list.map(function (p) {
        return '<a class="row-l" href="' + esc(p.u) + '" style="grid-template-columns: minmax(0,1fr) auto; padding: 14px 0; text-decoration: none; color: var(--ink);"><span><b style="display: block;">' + esc(p.s) + '</b><span class="muted" style="font-size: 13px;">' + (p.kw ? kw(p.kw) + ' кВт' : '') + (p.a ? ', ' + esc(p.a) : '') + '</span></span><span class="price" style="font-size: 17px;">' + (p.p ? fmt(p.p) + ' ₽' : 'по запросу') + '</span></a>';
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

  /* ---------- кабинет: вход ---------- */
  var lf = $('[data-login-form]');
  if (lf) {
    lf.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('.fmsg', lf), mail = $('#l-mail').value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { msg.textContent = 'Проверьте адрес почты.'; msg.className = 'fmsg err'; return; }
      msg.textContent = 'Вход подключим вместе с переносом сайта: он будет общий с «Аналогично!». Пока войти можно в самой программе.'; msg.className = 'fmsg ok';
    });
  }
})();
