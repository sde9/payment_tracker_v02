// Уроки и оплаты: интерфейс. Состояние живёт в объекте S и целиком уходит
// на сервер снимком того же формата, что и раньше (students[].bal, h[]).
// Логика расчётов и сопоставления с календарём лежит в lib.js.
(function () {
  'use strict';
  var L = window.UrokiLib;

  // ---------- форматирование ----------
  var MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONF = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MONP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  var WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function num(t) {
    if (t == null) return 0;
    var c = String(t).replace(/−/g, '-').replace(/[\s  ]/g, '').replace(',', '.');
    var v = parseFloat(c);
    return isNaN(v) ? 0 : v;
  }
  function fmt(n) { n = Math.round(n); return (n < 0 ? '−' : '') + new Intl.NumberFormat('ru-RU').format(Math.abs(n)); }
  function rub(n) { return fmt(n) + ' ₽'; }
  function plural(n, f) { var a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return f[2]; if (b > 1 && b < 5) return f[1]; if (b === 1) return f[0]; return f[2]; }
  function lessonsTxt(n) { return fmt(n) + ' ' + plural(n, ['занятие', 'занятия', 'занятий']); }
  function urokTxt(n) { return fmt(n) + ' ' + plural(n, ['урок', 'урока', 'уроков']); }
  function todayISO() { return L.localDate(new Date()); }
  function dShort(s) {
    var p = String(s || todayISO()).split('-');
    var y = +p[0], cy = new Date().getFullYear();
    return String(+p[2]) + ' ' + MON[(+p[1] - 1) || 0] + (y && y !== cy ? ' ' + String(y).slice(2) : '');
  }
  function hhmm(iso) { var d = new Date(iso); return L.pad(d.getHours()) + ':' + L.pad(d.getMinutes()); }
  function dayLabel(ds) {
    var t = todayISO();
    if (ds === t) return 'сегодня';
    if (ds === L.addDays(t, 1)) return 'завтра';
    if (ds === L.addDays(t, -1)) return 'вчера';
    var p = ds.split('-');
    var wd = WD[new Date(+p[0], +p[1] - 1, +p[2]).getDay()];
    return wd + ', ' + dShort(ds);
  }
  function when(iso) { return dayLabel(L.localDate(iso)) + ', ' + hhmm(iso); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function compact(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (Math.round(v / 1e5) / 10).toString().replace('.', ',') + ' млн';
    if (a >= 1000) return (Math.round(v / 100) / 10).toString().replace('.', ',') + ' тыс';
    return String(Math.round(v));
  }
  var esc = L.esc;
  function attr(s) { return esc(s); }
  function startOfDayIso(ds) { var p = ds.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toISOString(); }

  // ---------- состояние ----------
  var TPL_LOW = 'Привет, {имя}! У тебя осталось {остаток}. Скажи, какой пакет берём дальше: 4, 5 или 10?';
  var TPL_DEBT = 'Привет, {имя}! Оплаченные занятия закончились, сейчас за нами {долг}. Давай пополним баланс: 4, 5 или 10 занятий?';
  var DEFAULTS = { thr: 2, defRate: 2000, tplLow: TPL_LOW, tplDebt: TPL_DEBT, calWords: 'по английскому, Silver Fern' };
  function norm(d, fillInit) {
    var o = {};
    Object.keys(DEFAULTS).forEach(function (k) { o[k] = DEFAULTS[k]; });
    o.today = todayISO();
    o.fillInit = !!fillInit;
    return L.normalize(d, o);
  }
  // Демо-ученики вымышленные: страница должна что-то показывать при первом открытии.
  function demo() {
    var mk = function (id, name, rate, bal, note) {
      return { id: id, arch: '0', name: name, rate: rate, contact: '', note: note || '', bal: bal,
        h: [{ d: '2026-08-20', t: 'init', delta: bal, amt: 0, label: 'Стартовый остаток', note: '' }] };
    };
    return norm({ v: 1, thr: '2', defRate: '2000', tplLow: TPL_LOW, tplDebt: TPL_DEBT, students: [
      mk('s1', 'Анна Петрова', 2000, 6), mk('s2', 'Борис Ковалёв', 2000, 4), mk('s3', 'Дарья Ильина', 2000, 0),
      mk('s4', 'Марк Соловьёв', 950, 0, 'Демо-данные. Свои загрузите через настройки.'),
      mk('s5', 'Нина Захарова', 2000, -5, 'Демо-данные: пример отрицательного баланса.')
    ] });
  }
  var S = demo();

  function snapshot() { var s = JSON.parse(JSON.stringify(S)); s.ts = Date.now(); return s; }
  function stById(id) { return L.findStudent(S, id); }
  function thr() { return Math.max(0, Math.round(num(S.thr))); }
  function stateFor(b) { return b <= 0 ? 'debt' : (b <= thr() ? 'low' : 'ok'); }
  function firstName(st) { var t = (st.name || '').trim(); return t.split(/\s+/)[0] || t || 'друг'; }
  function newId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  var LABEL = { lesson: 'Занятие проведено', 'cancel-charged': 'Отмена, урок списан', 'cancel-free': 'Отмена, урок сохранён' };
  function doOp(st, kind, date, ev) {
    var delta = kind === 'cancel-free' ? 0 : -1;
    var e = { d: date, t: kind, delta: delta, amt: 0, label: LABEL[kind], note: '' };
    if (ev) { e.at = ev.start; e.ev = ev.key; }
    st.h.push(e);
    st.bal += delta;
  }
  function doPay(st, n, sum, date, comment) {
    st.h.push({ d: date, t: 'pay', delta: n, amt: sum, label: 'Оплата' + (comment ? ', ' + comment : ''), note: '' });
    st.bal += n;
  }
  function doUndo(st) {
    if (!st.h.length) return false;
    var e = st.h.pop();
    st.bal -= e.delta;
    return true;
  }

  // ---------- хранение ----------
  // 'server' - /api/state поверх Redis, 'local' - только localStorage этого браузера.
  var MODE = 'local', saveTimer = null, saving = false, dirty = false, daysTimer = null;
  var CHIP = {
    server: ['сохранено на сервере', 0],
    saving: ['сохраняю…', 0],
    checking: ['проверяю хранилище…', 0],
    'server-error': ['не сохранилось, проверьте сеть', 1],
    locked: ['нужен вход', 1],
    local: ['только в этом браузере', 1]
  };
  function setChip(mode) {
    var c = $('#chip'); if (!c) return;
    var v = CHIP[mode] || CHIP.local;
    c.textContent = v[0];
    if (v[1]) c.dataset.mode = 'local'; else c.removeAttribute('data-mode');
  }
  function backupLocal() { try { localStorage.setItem('uroki.backup', JSON.stringify(snapshot())); } catch (e) { /* приватный режим */ } }
  function pushState() {
    if (MODE !== 'server') return;
    dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700);
  }
  function flush() {
    if (MODE !== 'server' || saving || !dirty) return;
    saving = true; dirty = false; setChip('saving');
    fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot()) })
      .then(function (r) {
        if (r.status === 401) { var e = new Error('auth'); e.auth = 1; throw e; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function () {
        saving = false; setChip('server');
        if (dirty) flush();
        else if (TAB === 'set') { clearTimeout(daysTimer); daysTimer = setTimeout(loadDays, 400); }
      })
      .catch(function (e) {
        saving = false; dirty = true;
        if (e && e.auth) { setChip('locked'); showGate('Сессия истекла, войдите снова'); return; }
        setChip('server-error'); console.warn('save', e);
      });
  }
  function commit(fn) { fn(); after(); return Promise.resolve(); }
  function after() { renderAll(); backupLocal(); pushState(); }

  // ---------- Google: календарь, конспекты, посты ----------
  var G = { state: 'unknown', err: '', me: '', events: [], notes: [], at: 0, posts: null, postsState: '', postsErr: '', drive: null };
  var GERR = {
    'google-forbidden': 'Apps Script отклонил токен. Проверьте GOOGLE_SCRIPT_TOKEN на Vercel.',
    'google-token-not-set': 'В Apps Script не задан токен: запустите там функцию setup().',
    'google-bad-response': 'Apps Script ответил не данными. Проверьте, что у веб-приложения доступ «Все».',
    'google-timeout': 'Google отвечал слишком долго. Нажмите «Обновить».',
    'google-unreachable': 'Google не ответил. Проверьте сеть и нажмите «Обновить».',
    'password-required': 'Без пароля на сайте календарь и конспекты не показываются. Задайте APP_PASSWORD на Vercel.'
  };
  function gErr(j) {
    j = j || {};
    if (GERR[j.error]) return GERR[j.error];
    if (j.error === 'google-script-error') return 'Ошибка в Apps Script: ' + (j.message || 'без описания');
    return 'Не получилось связаться с Google (' + (j.error || 'ошибка') + ').';
  }
  function gfetch(action, params) {
    var q = new URLSearchParams();
    q.set('action', action);
    Object.keys(params || {}).forEach(function (k) { q.set(k, params[k]); });
    return fetch('/api/google?' + q.toString(), { cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; });
    });
  }
  function gpost(body) {
    return fetch('/api/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); });
  }
  function cacheG() {
    try { localStorage.setItem('uroki.g', JSON.stringify({ events: G.events, notes: G.notes, at: G.at, me: G.me })); } catch (e) { /* не страшно */ }
  }
  function loadCachedG() {
    try {
      var c = JSON.parse(localStorage.getItem('uroki.g') || 'null');
      if (c && Array.isArray(c.events)) { G.events = c.events; G.notes = c.notes || []; G.at = c.at || 0; G.me = c.me || ''; G.state = 'ok'; G.cached = true; }
    } catch (e) { /* пусто */ }
  }
  var gLoading = false, driveTried = false;
  function loadGoogle() {
    if (MODE !== 'server' || gLoading) return Promise.resolve();
    gLoading = true;
    if (!G.events.length) G.state = 'loading';
    renderAll();
    var t = todayISO();
    return gfetch('events', { from: startOfDayIso(L.addDays(t, -21)), to: startOfDayIso(L.addDays(t, 16)), q: S.calWords })
      .then(function (res) {
        if (res.status === 503) { G.state = 'off'; G.events = []; G.notes = []; return; }
        if (res.status === 401) { setChip('locked'); showGate('Сессия истекла, войдите снова'); return; }
        if (res.status !== 200) { G.state = 'error'; G.err = gErr(res.j); return; }
        G.events = res.j.events || []; G.me = res.j.me || ''; G.state = 'ok'; G.err = ''; G.at = Date.now(); G.cached = false;
        cacheG();
        renderAll();
        return gfetch('notes', { since: L.addDays(t, -210) }).then(function (n) {
          if (n.status === 200) { G.notes = n.j.notes || []; cacheG(); }
          else if (n.status !== 503) G.err = 'Конспекты не загрузились: ' + gErr(n.j);
        }).then(driveBackup);
      })
      .catch(function () { G.state = G.events.length ? 'ok' : 'error'; G.err = GERR['google-unreachable']; })
      .then(function () { gLoading = false; renderAll(); });
  }
  function driveBackup() {
    if (driveTried || MODE !== 'server') return;
    driveTried = true;
    return fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"drive"}' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.date) G.drive = j.date; renderSettings(); })
      .catch(function () { /* копия в Drive подождёт до следующего открытия */ });
  }
  function loadPosts() {
    if (MODE !== 'server' || G.postsState === 'loading') return;
    G.postsState = 'loading'; renderPosts();
    gfetch('posts').then(function (res) {
      if (res.status === 503) { G.postsState = 'off'; return; }
      if (res.status !== 200) { G.postsState = 'error'; G.postsErr = gErr(res.j); return; }
      G.posts = res.j.posts || []; G.postsState = 'ok';
    }).catch(function () { G.postsState = 'error'; G.postsErr = GERR['google-unreachable']; })
      .then(renderPosts);
  }

  // Сопоставление календаря с историей пересчитывается при каждом рендере.
  var CI = { by: {}, status: {} };
  function computeCal() {
    CI = { by: {}, status: {} };
    if (G.state !== 'ok' || !G.events.length) return;
    var now = Date.now(), today = todayISO();
    S.students.forEach(function (st) {
      var r = L.pairEvents(st, L.eventsFor(st, G.events), { now: now, today: today, dismissed: S.dismissed });
      CI.by[st.id] = r;
      function set(ev, v) { (CI.status[ev.key] || (CI.status[ev.key] = {}))[st.id] = v; }
      r.paired.forEach(function (p) { set(p.ev, p.dismissed ? { k: 'dismissed' } : { k: 'paired', e: st.h[p.idx] }); });
      r.unmarked.forEach(function (ev) { set(ev, { k: 'unmarked' }); });
      r.future.forEach(function (ev) { set(ev, { k: 'future' }); });
      r.before.forEach(function (ev) { set(ev, { k: 'before' }); });
    });
  }
  function nextFor(st) { var r = CI.by[st.id]; return r && r.future.length ? r.future[0] : null; }
  function evByKey(k) { for (var i = 0; i < G.events.length; i++) if (G.events[i].key === k) return G.events[i]; return null; }
  function unlinkedEmails(ev) {
    var known = {};
    S.students.forEach(function (st) { (st.emails || []).forEach(function (e) { known[e] = 1; }); });
    (S.ignore || []).forEach(function (e) { known[e] = 1; });
    return (ev.emails || []).filter(function (e) { return !known[e]; });
  }

  // ---------- рендер ----------
  var openHist = {}, openNotes = {}, rowCache = {}, histAll = {}, TAB = 'today';
  var SEL = null, SORT = 'bal';
  function renderAll() {
    computeCal();
    renderSettings();
    renderRows();
    renderList();
    renderMonth();
    renderDue();
    renderCal();
    renderBalW();
    renderHero();
    if ($('#dlgDay') && $('#dlgDay').open) renderDayCal();
    if (TAB === 'dash') renderDash();
    if (TAB === 'posts') renderPosts();
  }
  function initials(name) {
    var w = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?').charAt(0) + (w[1] ? w[1].charAt(0) : '')).toUpperCase();
  }
  function shortName(st) { return firstName(st); }
  function balWord(b) { return b < 0 ? 'долг' : (b === 0 ? 'нет уроков' : plural(b, ['урок', 'урока', 'уроков'])); }
  function sgn(n) { return String(n).replace('-', '−'); }

  // ---------- «Сегодня» ----------
  function renderHero() {
    var h = $('#todayH'), p = $('#todaySub'); if (!h || !p) return;
    var k = (MODE === 'server' && G.state === 'ok') ? unmarkedItems().length + unknownItems().length : 0;
    var d = cap(new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
    h.textContent = k ? 'Сегодня.' : 'Всё готово.';
    p.textContent = d + '. ' + (k ? (k === 1 ? 'Одно дело ждёт вас.' : k + ' ' + plural(k, ['дело ждёт', 'дела ждут', 'дел ждут']) + ' вас.') : 'Можно выдохнуть.');
  }
  // Прошедшие события без ученика за две недели: «Чей это урок?».
  function unknownItems() {
    var now = Date.now(), from = now - 14 * 864e5;
    return G.events.filter(function (ev) {
      var t = new Date(ev.start).getTime();
      return t < now && t > from && unlinkedEmails(ev).length && !L.studentsFor(ev, S.students).length;
    }).slice(-3);
  }
  function renderBalW() {
    var box = $('#balw'); if (!box) return;
    var act = S.students.filter(function (s) { return s.arch !== '1'; });
    box.innerHTML = '<p class="lbl" style="margin-bottom:6px"><span class="ic indigo">' + ICON.people + '</span>Остатки уроков</p>' +
      (act.length ? act.map(function (st) {
        return '<button class="bl" data-act="goto-stu" data-sid="' + attr(st.id) + '" data-state="' + stateFor(st.bal) + '"><i></i>' +
          '<span class="bn">' + esc(st.name || 'без имени') + '</span><span class="bw">' + (st.bal <= 0 ? balWord(st.bal) : '') + '</span>' +
          '<span class="bv">' + sgn(st.bal) + '</span></button>';
      }).join('') : '<p class="gnote">Учеников пока нет.</p>');
  }
  var ICON = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>',
    people: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="3"/><path d="M4 19c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3"/></svg>',
    circle: '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5"/></svg>',
    done: '<svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#34C759"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  // ---------- «Ученики»: список ----------
  function sortedList() {
    var q = (($('#q') || {}).value || '').trim().toLowerCase();
    var list = S.students.filter(function (s) { return SORT === 'arch' ? s.arch === '1' : s.arch !== '1'; });
    if (q) list = list.filter(function (s) { return ((s.name || '') + ' ' + (s.contact || '')).toLowerCase().indexOf(q) > -1; });
    list = list.slice();
    if (SORT === 'name') list.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'ru'); });
    else if (SORT === 'next') list.sort(function (a, b) {
      var x = nextFor(a), y = nextFor(b);
      return (x ? x.start : '9') < (y ? y.start : '9') ? -1 : ((x ? x.start : '9') > (y ? y.start : '9') ? 1 : 0);
    });
    else if (SORT === 'bal') list.sort(function (a, b) { return a.bal - b.bal; });
    return list;
  }
  function renderList() {
    var box = $('#plist'); if (!box) return;
    var list = sortedList();
    if (!SEL || !stById(SEL) || (SORT !== 'arch' && stById(SEL).arch === '1')) SEL = list.length ? list[0].id : null;
    $$('#sorts button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.sort === SORT ? 'true' : 'false'); });
    box.innerHTML = list.length ? list.map(function (st) {
      var nx = nextFor(st);
      return '<button class="li" data-act="pick" data-sid="' + attr(st.id) + '" data-state="' + stateFor(st.bal) + '" data-arch="' + (st.arch === '1' ? '1' : '0') + '" aria-current="' + (st.id === SEL ? 'true' : 'false') + '">' +
        '<span class="av" aria-hidden="true">' + esc(initials(st.name)) + '</span>' +
        '<span class="lt"><b>' + esc(st.name || 'Без имени') + '</b><small>' + (nx ? esc(when(nx.start)) : esc(fmt(st.rate)) + ' ₽ за урок') + '</small></span>' +
        '<span class="lv"><b>' + sgn(st.bal) + '</b><small>' + balWord(st.bal) + '</small></span></button>';
    }).join('') : '<p class="pnone">' + (S.students.length ? 'Никого не нашлось' : 'Пока никого нет') + '</p>';
    $$('#rows > .row').forEach(function (el) { el.classList.toggle('sel', el.dataset.id === SEL); });
  }
  function pick(id, open) {
    SEL = id; renderList();
    var v = $('#v-main'); if (v && open) v.dataset.detail = '1';
  }

  function setVal(sel, v) {
    var el = $(sel); if (!el || document.activeElement === el) return;
    if ('value' in el && el.tagName !== 'DIV') { if (el.value !== String(v)) el.value = String(v); }
    else if (el.textContent !== String(v)) el.textContent = String(v);
  }
  function renderSettings() {
    setVal('#thr', S.thr);
    setVal('#defRate', S.defRate);
    setVal('#tplLow', S.tplLow);
    setVal('#tplDebt', S.tplDebt);
    setVal('#calWords', S.calWords);
    var gs = $('#gStatus');
    if (gs) {
      var t, err = false;
      if (MODE !== 'server') t = 'Календарь и конспекты работают в версии на сервере.';
      else if (G.state === 'off') t = 'Google не подключён. Как подключить, написано в docs/google-setup.md.';
      else if (G.state === 'loading' || G.state === 'unknown') t = 'Подключаюсь к Google…';
      else if (G.state === 'error') { t = G.err; err = true; }
      else {
        t = 'Google подключён' + (G.me ? ' (' + G.me + ')' : '') + ': в календаре ' + urokTxt(G.events.length) + ' на 5 недель, конспектов ' + G.notes.length + '.';
        if (G.err) { t += ' ' + G.err; err = true; }
      }
      gs.textContent = t;
      gs.classList.toggle('err', err);
    }
    var ds = $('#driveStatus');
    if (ds) {
      if (MODE !== 'server') ds.textContent = 'Копии на сервере и в Google Drive работают в версии на сервере.';
      else if (G.drive) ds.textContent = 'Копия в Google Drive: последняя ' + dShort(G.drive) + ', папка «Уроки и оплаты: резервные копии».';
      else if (G.state === 'off') ds.textContent = 'Копии в Google Drive начнутся, когда подключите Google.';
      else ds.textContent = '';
    }
  }

  function rowHtml(st) {
    var b = st.bal, state = stateFor(b);
    var nx = nextFor(st);
    var notes = G.notes.length ? L.notesFor(st, G.notes) : [];
    var list = st.h.map(function (e, i) { return { e: e, i: i }; }).reverse();
    var limit = histAll[st.id] ? list.length : 12;
    var rows = list.slice(0, limit).map(function (x) { return hRow(st, x.e, x.i, notes); }).join('');
    var more = list.length > limit ? '<button class="tiny ghost hmore" data-act="hist-all">Показать всю историю: ' + list.length + '</button>' : '';
    var C = 2 * Math.PI * 42, frac = b < 0 ? 1 : Math.min(1, b / 10);
    return '<div class="row" data-id="' + attr(st.id) + '" data-state="' + state + '" data-arch="' + (st.arch === '1' ? '1' : '0') + '">' +
      '<div class="dh"><span class="av big" aria-hidden="true">' + esc(initials(st.name)) + '</span>' +
      '<div class="who"><h2 class="name" contenteditable="plaintext-only" data-ph="Имя ученика">' + esc(st.name) + '</h2>' +
      '<div class="meta"><span class="ed rate" contenteditable="plaintext-only">' + esc(String(st.rate)) + '</span><span class="u">₽ за урок</span><span class="u">·</span>' +
      '<span class="ed contact" contenteditable="plaintext-only" data-ph="контакт">' + esc(st.contact) + '</span></div></div></div>' +
      '<div class="acts"><button class="pro" data-act="lesson">Провёл урок</button><button data-act="pay">Записать оплату</button>' +
      '<button data-act="copy">Напомнить…</button><button data-act="cancel">Отмена урока</button></div>' +
      '<div class="dgrid">' +
      '<div class="w full balw2"><svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true"><circle class="rt rtr" cx="52" cy="52" r="42"/>' +
      '<circle class="rt rfg" cx="52" cy="52" r="42"' + (frac ? '' : ' opacity="0"') + ' stroke-dasharray="' + (C * frac).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 52 52)"/></svg>' +
      '<div class="bal"><span class="lbl">Остаток</span><span class="bal-n">' + fmt(b) + '</span><span class="bal-w">' + balWord(b) + '</span><span class="tag"></span></div>' +
      '<div class="sum"><span class="lbl" style="justify-content:flex-end">Сумма</span><span class="bal-m">' + rub(b * st.rate) + '</span></div></div>' +
      '<div class="w"><span class="lbl nxl">СЛЕДУЮЩИЙ УРОК</span><span class="nx">' + (nx ? esc(cap(when(nx.start))) : '') + '</span>' +
      '<span class="nxs">' + (nx ? esc(L.eventName(nx.title) ? 'по календарю' : nx.title) : 'В календаре пока нет') + '</span>' +
      '<div class="fld"><span class="flbl">Адреса в календаре</span><span class="ed emails" contenteditable="plaintext-only" data-ph="адрес, с которого ученик записывается">' + esc((st.emails || []).join(', ')) + '</span></div></div>' +
      '<div class="w"><span class="lbl">Конспекты</span>' + (notes.length ? lastNotes(st, notes) : '<p class="nonotes">Конспектов пока нет.</p>') +
      '<div class="snote" contenteditable="plaintext-only" data-ph="Заметка об ученике">' + esc(st.note) + '</div></div>' +
      '<div class="w full hist" data-sid="' + attr(st.id) + '"><span class="lbl">История</span>' +
      '<div class="hrows">' + rows + '</div>' + more +
      '<div class="hbtns"><button class="tiny ghost" data-act="undo">Отменить последнюю запись</button>' +
      '<button class="tiny ghost" data-act="arch"></button><button class="tiny ghost" data-act="del">Удалить ученика</button></div></div>' +
      '</div></div>';
  }
  function noteBlock(n, key, label) {
    var url = /^https:\/\//.test(n.url || '') ? n.url : '';
    return '<details class="nt" data-k="' + attr(key) + '"' + (openNotes[key] ? ' open' : '') + '><summary><b>' + esc(label) + '</b></summary>' +
      '<div class="md">' + L.md(n.summary) + (url ? '<p><a href="' + attr(url) + '" target="_blank" rel="noopener noreferrer">Открыть в Granola</a></p>' : '') + '</div></details>';
  }
  function lastNotes(st, notes) {
    if (!notes.length) return '';
    return '<div class="lastnotes">' +
      notes.slice(0, 2).map(function (n) {
        var d = L.noteDate(n);
        return noteBlock(n, 'last:' + st.id + ':' + n.id, (d ? dayLabel(d) : '') + (n.start ? ', ' + hhmm(n.start) : ''));
      }).join('') + '</div>';
  }
  function hRow(st, e, i, notes) {
    var note = notes.length ? L.noteForEntry(e, notes) : null;
    var n = e.t === 'pay' ? ('+' + fmt(e.delta) + ' · ' + rub(e.amt)) : (e.delta > 0 ? '+' + fmt(e.delta) : fmt(e.delta));
    return '<div class="h" data-i="' + i + '" data-t="' + attr(e.t) + '" data-delta="' + e.delta + '"' + (e.src ? ' data-src="' + attr(e.src) + '"' : '') + '>' +
      '<span class="h-d">' + dShort(e.d) + '</span><span class="h-t"><span class="h-l">' + esc(e.label) + atText(e) + '</span>' +
      '<span class="h-note" contenteditable="plaintext-only" data-ph="заметка">' + esc(e.note) + '</span>' +
      (note ? noteBlock(note, st.id + ':' + i, 'Конспект') : '') + '</span>' +
      '<span class="h-n"' + (e.src === 'cal' ? ' title="до начала учёта, на баланс не влияет"' : '') + '>' + n + '</span></div>';
  }
  function atText(e) {
    if (!e.at) return '';
    var d = L.localDate(e.at);
    return d === e.d ? ' · ' + hhmm(e.at) : ' · урок ' + dShort(d) + ', ' + hhmm(e.at);
  }
  function editingIn(el) {
    var a = document.activeElement;
    return !!(a && a !== document.body && el.contains(a) && (a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName)));
  }
  function renderRows() {
    var host = $('#rows');
    var ids = {};
    S.students.forEach(function (s) { ids[s.id] = 1; });
    $$('#rows > .row').forEach(function (el) { if (!ids[el.dataset.id]) { el.remove(); delete rowCache[el.dataset.id]; } });
    var prev = null;
    S.students.forEach(function (st) {
      var el = null;
      for (var c = host.firstElementChild; c; c = c.nextElementSibling) if (c.dataset.id === st.id) { el = c; break; }
      if (!(el && editingIn(el))) {
        var html = rowHtml(st);
        if (!el || rowCache[st.id] !== html) {
          var tmp = document.createElement('div');
          tmp.innerHTML = html;
          var nel = tmp.firstElementChild;
          if (el) el.replaceWith(nel); else host.appendChild(nel);
          el = nel;
          rowCache[st.id] = html;
        }
      }
      var want = prev ? prev.nextElementSibling : host.firstElementChild;
      if (want !== el) { if (prev) prev.after(el); else host.prepend(el); }
      prev = el;
    });
  }

  var mOff = 0;
  function renderMonth() {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + mOff);
    var y = d.getFullYear(), m = d.getMonth();
    var key = y + '-' + L.pad(m + 1);
    var row = L.monthSeries(S, key, key)[0];
    var title = MONF[m] + (y !== new Date().getFullYear() ? (' ' + y) : '');
    var co = 2 * Math.PI * 50, ci = 2 * Math.PI * 33;
    var po = row.earned ? Math.min(1, row.paid / row.earned) : (row.paid ? 1 : 0);
    var all = row.lessons + row.charged + row.free, pi = all ? row.lessons / all : 0;
    $('#month').innerHTML =
      '<svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Получено ' + rub(row.paid) + ', проведено на ' + rub(row.earned) + '">' +
      '<circle class="rt ro" cx="60" cy="60" r="50"/><circle class="rt rof" cx="60" cy="60" r="50"' + (po ? '' : ' opacity="0"') + ' stroke-dasharray="' + (co * po).toFixed(1) + ' ' + co.toFixed(1) + '" transform="rotate(-90 60 60)"/>' +
      '<circle class="rt ri" cx="60" cy="60" r="33"/><circle class="rt rif" cx="60" cy="60" r="33"' + (pi ? '' : ' opacity="0"') + ' stroke-dasharray="' + (ci * pi).toFixed(1) + ' ' + ci.toFixed(1) + '" transform="rotate(-90 60 60)"/></svg>' +
      '<div style="min-width:0"><div class="month-nav"><button data-act="m-prev" aria-label="Предыдущий месяц">‹</button><b>' + title + '</b>' +
      (mOff < 0 ? '<button data-act="m-next" aria-label="Следующий месяц">›</button>' : '') + '</div>' +
      '<div class="mbig">' + rub(row.earned) + '<small>проведено на сумму</small></div>' +
      '<div class="mstats">' +
      '<span class="mstat"><i class="g"></i>Получено <b>' + rub(row.paid) + '</b></span>' +
      '<span class="mstat"><i class="b"></i>Уроков <b>' + row.lessons + '</b></span>' +
      '<span class="mstat"><i class="o"></i>Отмен со списанием <b>' + row.charged + '</b></span>' +
      '<span class="mstat"><i class="n"></i>Отмен без списания <b>' + row.free + '</b></span></div></div>';
  }

  function msgFor(st) {
    var b = st.bal, nm = firstName(st);
    if (b <= 0) {
      var dbt = Math.abs(b);
      return (S.tplDebt || '')
        .replace(/\{имя\}/g, nm)
        .replace(/\{долг\}/g, dbt ? (lessonsTxt(dbt) + ', ' + rub(dbt * st.rate)) : 'ноль занятий')
        .replace(/\{остаток\}/g, lessonsTxt(b));
    }
    return (S.tplLow || '').replace(/\{имя\}/g, nm).replace(/\{остаток\}/g, lessonsTxt(b)).replace(/\{долг\}/g, lessonsTxt(0));
  }
  function renderDue() {
    var t = thr();
    var list = S.students.filter(function (s) { return s.arch !== '1' && s.bal <= t; }).sort(function (a, b) { return a.bal - b.bal; });
    var box = $('#due');
    box.innerHTML = '<p class="lbl"><span class="ic red">' + ICON.alert + '</span>Ждут оплаты</p>' +
      (list.length ? '<ul>' + list.map(function (st) {
        var b = st.bal;
        var why = b < 0 ? ('Долг ' + urokTxt(-b) + ' · ' + rub(-b * st.rate)) : (b === 0 ? 'Уроки закончились' : ('Осталось ' + urokTxt(b)));
        return '<li><span class="dn"><b>' + esc(st.name) + '</b><span' + (b > 0 ? ' class="low"' : '') + '>' + why + '</span></span>' +
          '<button data-act="copy-due" data-sid="' + attr(st.id) + '">Напомнить…</button></li>';
      }).join('') + '</ul>' : '<p class="none">Долгов нет</p>');
  }

  // Строка события: по одной на каждого ученика события, время только у первой.
  function markText(e) {
    if (!e) return '';
    if (e.t === 'lesson') return e.src === 'cal' ? 'в истории' : 'проведён ✓';
    if (e.t === 'cancel-charged') return 'отмена, списан';
    if (e.t === 'cancel-free') return 'отмена, сохранён';
    return 'отмечен';
  }
  function evActions(ev, st) {
    var s = (CI.status[ev.key] || {})[st.id] || { k: 'none' };
    var t = new Date(ev.start).getTime(), now = Date.now();
    if (s.k === 'paired') return '<span class="mark' + (s.e && s.e.t !== 'lesson' ? ' free' : '') + '">' + markText(s.e) + '</span>';
    if (s.k === 'dismissed') return '<span class="mark free">не было</span><button class="tiny ghost" data-act="ev-unskip">вернуть</button>';
    if (s.k === 'before') return '<span class="mark free">до начала учёта</span>';
    var out = '';
    if (t <= now + 3600e3) out += '<button class="tiny" data-act="ev-lesson">Провёл</button>';
    out += '<button class="tiny" data-act="ev-cancel">Отмена</button>';
    if (t <= now) out += '<button class="tiny ghost" data-act="ev-skip">Не было</button>';
    return out;
  }
  function lastTopic(st) {
    if (!G.notes.length) return '';
    var n = L.notesFor(st, G.notes)[0]; if (!n) return '';
    var line = String(n.summary || '').split('\n').map(function (x) { return x.replace(/^[#>*\-\s]+/, '').replace(/\*\*/g, '').trim(); }).filter(Boolean)[0] || '';
    return line.length > 70 ? line.slice(0, 68) + '…' : line;
  }
  function eventBlock(ev, opts) {
    opts = opts || {};
    var ce = opts.week ? ' ce' : '';
    var sts = opts.only ? [opts.only] : L.studentsFor(ev, S.students);
    var nm = L.eventName(ev.title);
    var group = !nm ? ev.title : '';
    var tm = opts.withDate ? dShort(L.localDate(ev.start)) + '<br>' + hhmm(ev.start) : hhmm(ev.start);
    var out = '';
    sts.forEach(function (st, i) {
      var lt = opts.week ? lastTopic(st) : '';
      var tint = opts.week && st.bal <= thr() ? ' warn' : '';
      out += '<div class="evr' + ce + tint + (i ? ' cont' : '') + '" data-ev="' + attr(ev.key) + '" data-sid="' + attr(st.id) + '">' +
        '<span class="tm">' + (i ? '' : tm) + '</span><span class="ew"><b>' + esc(st.name) + '</b>' + (!i && group ? '<small>' + esc(group) + '</small>' : '') +
        (opts.week && st.bal <= 0 ? '<small>' + (st.bal < 0 ? 'долг ' + fmt(-st.bal) : 'нет оплаченных уроков') + '</small>' : '') +
        (lt ? '<small class="last">Прошлый раз: ' + esc(lt) + '</small>' : '') + '</span>' +
        '<span class="ea">' + evActions(ev, st) + '</span></div>';
    });
    if (!opts.only) {
      var un = unlinkedEmails(ev);
      if (un.length || !sts.length) {
        var who = (un.length === 1 && nm) ? nm : (un.length ? un.join(', ') : (nm || ev.title));
        out += '<div class="evr' + ce + (opts.week ? ' unl' : '') + (sts.length ? ' cont' : '') + '" data-ev="' + attr(ev.key) + '">' +
          '<span class="tm">' + (sts.length ? '' : tm) + '</span><span class="ew"><b>' + esc(who) + '</b><small>' +
          (group && !sts.length ? esc(group) + ' · ' : '') + 'не привязан к ученику</small></span>' +
          '<span class="ea">' + (un.length ? '<button class="tiny" data-act="link">Привязать</button>' : '') + '</span></div>';
      }
    }
    return out;
  }
  function weekEvents(days) {
    var t = todayISO(), end = L.addDays(t, days);
    return G.events.filter(function (ev) { var d = L.localDate(ev.start); return d >= t && d < end; });
  }
  function weekHtml(days) {
    var evs = weekEvents(days);
    if (!evs.length) return '<p class="gnote">На ближайшие ' + days + ' дней уроков в календаре нет.</p>';
    var by = {}, order = [];
    evs.forEach(function (ev) { var d = L.localDate(ev.start); if (!by[d]) { by[d] = []; order.push(d); } by[d].push(ev); });
    return order.map(function (d) {
      return '<div class="dayg"><div class="dl">' + cap(dayLabel(d)) + '</div>' + by[d].map(function (ev) { return eventBlock(ev, { week: 1 }); }).join('') + '</div>';
    }).join('');
  }
  function unmarkedItems() {
    var items = [];
    S.students.forEach(function (st) {
      if (st.arch === '1') return;
      var r = CI.by[st.id];
      if (r) r.unmarked.forEach(function (ev) { items.push({ ev: ev, st: st }); });
    });
    items.sort(function (a, b) { return a.ev.start < b.ev.start ? 1 : -1; });
    return items;
  }
  function markRow(x) {
    var st = x.st, ev = x.ev;
    return '<div class="evr mk" data-ev="' + attr(ev.key) + '" data-sid="' + attr(st.id) + '">' +
      '<button class="chk" data-act="ev-lesson" aria-label="Провёл урок: ' + attr(st.name) + '" title="Провёл">' + ICON.circle + '</button>' +
      '<span class="ew"><b>' + esc(st.name) + '</b><small>' + esc(cap(when(ev.start))) + (L.eventName(ev.title) ? '' : ' · ' + esc(ev.title)) + '</small></span>' +
      '<span class="eff">' + sgn(st.bal) + ' → ' + sgn(st.bal - 1) + '</span>' +
      '<button class="ghost tiny" data-act="ev-cancel">Отмена…</button><button class="ghost tiny" data-act="ev-skip">Не было</button></div>';
  }
  function renderCal() {
    var wk = $('#week'), un = $('#unmarked');
    var head = '<div class="whead"><p class="lbl"><span class="ic blue">' + ICON.check + '</span>Отметить уроки</p>';
    if (MODE !== 'server' || G.state === 'off' || G.state === 'unknown') {
      wk.hidden = true;
      un.innerHTML = head + '</div><div class="alldone" style="margin:auto 0"><b>Отмечайте уроки вручную</b>' +
        '<span>' + (MODE !== 'server' ? 'Календарь работает в версии на сервере.' : 'Google не подключён, уроки из календаря не подтягиваются.') + '</span>' +
        '<p style="margin:16px 0 0"><button class="pro" data-act="day">Отметить день</button></p></div>';
      return;
    }
    wk.hidden = false;
    var items = G.state === 'ok' || G.events.length ? unmarkedItems() : [];
    var unk = G.events.length ? unknownItems() : [];
    var k = items.length + unk.length;
    un.innerHTML = head + '<div class="bign">' + k + '</div></div><div class="marks">' +
      items.map(markRow).join('') +
      unk.map(function (ev) {
        return '<div class="unk" data-ev="' + attr(ev.key) + '"><div class="ur"><span class="q">?</span><span><b>Чей это урок?</b><small>' +
          esc(ev.title) + ' · ' + esc(when(ev.start)) + '</small></span><button class="ghost tiny" data-act="link" style="margin-left:auto">Выбрать ученика</button></div></div>';
      }).join('') + '</div>' +
      (items.length > 1 ? '<button class="bor" data-act="ev-all">Все прошли: отметить ' + items.length + '</button>' : '') +
      (!k ? '<div class="alldone">' + ICON.done + '<b>Всё отмечено</b><span>' + esc(nextText()) + '</span></div>' : '') +
      '<div class="wfoot">' + (G.state === 'error' ? '<span class="gnote err">' + esc(G.err) + '</span> ' : '') +
      (k ? 'Круг списывает урок. «Не было» убирает событие без списания. ' : '') + '<button class="ghost tiny" data-act="day">Отметить день вручную</button></div>';

    var today = todayISO(), now = Date.now();
    var left = weekEvents(1).filter(function (ev) { return new Date(ev.start).getTime() > now; }).length;
    var nd = new Date();
    wk.innerHTML = '<div class="cal"><div class="cd"><div class="cdw">' + nd.toLocaleDateString('ru-RU', { weekday: 'long' }) + '</div>' +
      '<div class="cdn">' + nd.getDate() + '</div><div class="cds">' + (left ? urokTxt(left) + ' впереди' : 'Сегодня уроков больше нет') + '</div>' +
      '<button class="ghost tiny" data-act="g-refresh">Обновить</button></div>' +
      '<div class="cl">' + (!G.events.length && G.state !== 'ok' ? '<p class="gnote' + (G.state === 'error' ? ' err' : '') + '">' + esc(G.state === 'error' ? G.err : 'Загружаю календарь…') + '</p>' : weekHtml(7)) + '</div></div>';
    void today;
  }
  function nextText() {
    var now = Date.now();
    var ev = G.events.filter(function (e) { return new Date(e.start).getTime() > now; })[0];
    return ev ? 'Следующий урок: ' + when(ev.start) : 'Ближайших уроков в календаре нет';
  }

  // ---------- диалоги ----------
  var curSid = null, curEv = null;
  function openPay(st, any) {
    curSid = st.id;
    $('#payWho').textContent = (st.name || '') + ' · ' + st.rate + ' ₽ за урок';
    $('#payD').value = todayISO(); $('#payN').value = 10; $('#payS').value = Math.round(10 * st.rate); $('#payC').value = '';
    $$('#packs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.n === '10' ? 'true' : 'false'); });
    var box = $('#payWhoBox');
    if (box) {
      box.hidden = !any;
      if (any) $('#payWhoChips').innerHTML = S.students.filter(function (s) { return s.arch !== '1'; }).slice().sort(function (a, b) { return a.bal - b.bal; })
        .map(function (s) { return '<button data-act="pay-who" data-sid="' + attr(s.id) + '" aria-pressed="' + (s.id === st.id ? 'true' : 'false') + '">' + esc(shortName(s)) + (s.bal < 0 ? ' · долг' : '') + '</button>'; }).join('');
    }
    payPrev();
    if (!$('#dlgPay').open) $('#dlgPay').showModal();
  }
  function openPayAny() {
    var act = S.students.filter(function (s) { return s.arch !== '1'; }).sort(function (a, b) { return a.bal - b.bal; });
    if (!act.length) { toast('Сначала добавьте ученика'); return; }
    openPay(act[0], true);
  }
  function payPrev() {
    var st = stById(curSid), el = $('#payPrev'); if (!st || !el) return;
    var n = Math.round(num($('#payN').value)), cur = st.bal, after = cur + n;
    el.textContent = n > 0 ? (urokTxt(n) + ' по ' + rub(st.rate) + '. ' + (cur < 0 ? urokTxt(Math.min(n, -cur)) + ' закроют долг. ' : '') + 'Станет: ' + sgn(after) + ' ' + balWord(after) + '.') : 'Укажите количество уроков.';
  }
  function syncPaySum() { var st = stById(curSid); if (st) $('#payS').value = Math.round(num($('#payN').value) * st.rate); payPrev(); }
  var remSid = null;
  function openRemind(st) {
    remSid = st.id;
    $('#remWho').textContent = 'Напоминание: ' + (st.name || '');
    $('#remText').value = msgFor(st);
    $('#dlgRemind').showModal();
  }
  // Действие с кнопкой «Вернуть» в уведомлении: снимок до изменения.
  var undoSnap = null;
  function withUndo(msg, fn) {
    undoSnap = JSON.stringify(snapshot());
    commit(fn);
    toast(msg, true);
  }
  function openCancel(st, ev) {
    curSid = st.id; curEv = ev || null;
    $('#cxWho').textContent = st.name || '';
    var info = 'Предупредил раньше чем за 6 часов, урок остаётся. Позже, урок сгорает.';
    if (ev) {
      var dl = new Date(new Date(ev.start).getTime() - 6 * 3600e3);
      info = 'Урок ' + when(ev.start) + '. Если ученик предупредил до ' + (L.localDate(dl) === L.localDate(ev.start) ? hhmm(dl.toISOString()) : when(dl.toISOString())) + ', урок не списывается.';
    }
    $('#cxInfo').textContent = info;
    var late = ev ? (new Date(ev.start).getTime() - Date.now() < 6 * 3600e3) : false;
    $$('#dlgCancel .opt').forEach(function (o) { o.classList.toggle('rec', (o.dataset.act === 'cx-charge') === late); });
    $('#cxD').value = ev ? L.localDate(ev.start) : todayISO();
    $('#dlgCancel').showModal();
  }
  function renderDay() {
    $('#dayList').innerHTML = S.students.filter(function (s) { return s.arch !== '1'; }).map(function (st) {
      return '<div class="dayrow" data-sid="' + attr(st.id) + '"><span class="dn">' + esc(st.name) + '</span>' +
        '<span class="db">' + fmt(st.bal) + '</span>' +
        '<button class="tiny" data-act="d-lesson">Провёл</button>' +
        '<button class="tiny" data-act="d-charge">Отмена, списать</button>' +
        '<button class="tiny" data-act="d-free">Отмена, оставить</button>' +
        '<span class="done"></span></div>';
    }).join('');
    renderDayCal();
  }
  function renderDayCal() {
    var host = $('#dayCal'); if (!host) return;
    if (G.state !== 'ok') { host.innerHTML = ''; return; }
    var d = $('#dayD').value || todayISO();
    var evs = G.events.filter(function (ev) { return L.localDate(ev.start) === d; });
    host.innerHTML = evs.length ? '<div class="sched" style="padding:0 0 6px"><h2 class="ph">По календарю</h2>' +
      evs.map(function (ev) { return eventBlock(ev); }).join('') + '</div>' : '';
  }
  function openDay() { $('#dayD').value = todayISO(); renderDay(); $('#dlgDay').showModal(); }

  // Привязка адресов события к ученикам.
  function openLink(ev) {
    curEv = ev;
    var un = unlinkedEmails(ev), nm = L.eventName(ev.title);
    $('#linkWho').textContent = when(ev.start) + (nm ? '' : ' · ' + ev.title);
    var opts = function (sel) {
      return S.students.map(function (st) {
        return '<option value="s:' + attr(st.id) + '"' + (sel === st.id ? ' selected' : '') + '>' + esc(st.name) + (st.arch === '1' ? ' (архив)' : '') + '</option>';
      }).join('');
    };
    $('#linkBody').innerHTML = un.map(function (e) {
      var person = { emails: [e], names: un.length === 1 && nm ? [nm] : [] };
      var sid = L.suggest(person, S.students);
      var name = person.names[0] || e.split('@')[0];
      return '<div class="field" data-email="' + attr(e) + '"><label>' + esc(e) + (person.names[0] ? ' · ' + esc(person.names[0]) : '') + '</label>' +
        '<select data-link="sel">' + opts(sid) + '<option value="new"' + (sid ? '' : ' selected') + '>Новый ученик</option><option value="ignore">Не ученик, не показывать</option></select>' +
        '<div class="two"' + (sid ? ' hidden' : '') + ' data-link="new"><input type="text" data-link="name" value="' + attr(name) + '" aria-label="Имя">' +
        '<input type="number" data-link="rate" value="' + attr(S.defRate) + '" aria-label="Ставка, ₽"></div></div>';
    }).join('') || '<p class="hint">Все адреса этого события уже привязаны.</p>';
    $('#dlgLink').showModal();
  }
  function saveLink() {
    var rows = $$('#linkBody .field[data-email]');
    commit(function () {
      rows.forEach(function (f) {
        var e = f.dataset.email, v = $('[data-link="sel"]', f).value;
        if (v === 'ignore') { S.ignore = (S.ignore || []).concat([e]); return; }
        if (v === 'new') {
          S.students.push({ id: newId(), arch: '0', name: ($('[data-link="name"]', f).value || e).trim(), rate: Math.round(num($('[data-link="rate"]', f).value)) || Number(S.defRate) || 2000,
            contact: '', note: '', bal: 0, emails: [e], since: todayISO(), h: [] });
          return;
        }
        var st = stById(v.slice(2));
        if (st && st.emails.indexOf(e) < 0) st.emails.push(e);
      });
    });
    $('#dlgLink').close();
    toast('Сохранено');
  }

  // ---------- импорт истории из календаря ----------
  var IMP = null;
  function openImport() {
    if (MODE !== 'server') { toast('История из календаря доступна в версии на сервере'); return; }
    if (G.state === 'off') { toast('Сначала подключите Google: docs/google-setup.md'); return; }
    IMP = { from: L.addDays(todayISO(), -183), events: [], people: [], map: {}, excl: {}, plan: null, status: '', err: false, busy: false };
    renderImport();
    $('#impOk').disabled = true;
    $('#dlgImport').showModal();
  }
  function renderImport() {
    var b = $('#impBody');
    var top = '<div class="two" style="align-items:flex-end"><div class="field"><label for="impFrom">С какой даты искать</label><input type="date" id="impFrom" value="' + attr(IMP.from) + '"></div>' +
      '<div class="field" style="flex:0 0 auto"><button class="primary" data-act="imp-find"' + (IMP.busy ? ' disabled' : '') + '>Найти уроки</button></div></div>' +
      '<p class="hint">Ищу события, в названии которых есть «' + esc(S.calWords) + '». Уроки до начала учёта у ученика попадут в историю с нулевым списанием. Уроки после начала учёта не добавляются: они только связываются с вашими отметками. Пока вы не нажмёте «Загрузить в историю», ничего не сохраняется.</p>' +
      '<p class="status' + (IMP.err ? ' err' : '') + '" id="impStatus">' + esc(IMP.status) + '</p>';
    if (!IMP.people.length) { b.innerHTML = top; return; }
    var opts = function (sel) {
      return S.students.map(function (st) {
        return '<option value="s:' + attr(st.id) + '"' + (sel === 's:' + st.id ? ' selected' : '') + '>' + esc(st.name) + (st.arch === '1' ? ' (архив)' : '') + '</option>';
      }).join('') + '<option value="new"' + (sel === 'new' ? ' selected' : '') + '>Новый ученик</option><option value="skip"' + (sel === 'skip' ? ' selected' : '') + '>Пропустить</option>';
    };
    var evIdx = {};
    IMP.events.forEach(function (ev) { evIdx[ev.key] = ev; });
    b.innerHTML = top + '<div class="plan" id="impPlan"></div><div class="people">' + IMP.people.map(function (p) {
      var m = IMP.map[p.id], sel = m.skip ? 'skip' : (m.sid ? 's:' + m.sid : 'new');
      var cr = m.create || { name: p.label, rate: S.defRate, arch: false };
      var meta = p.emails.join(', ') + (p.emails.length ? ' · ' : '') + urokTxt(p.count) + ', ' + dShort(L.localDate(p.first)) + ' — ' + dShort(L.localDate(p.last)) + (p.titles.length ? ' · ' + p.titles.join(', ') : '');
      return '<div class="person" data-p="' + attr(p.id) + '"><div><div class="pn">' + esc(p.names.join(' / ') || p.emails[0] || p.label) + '</div><div class="pm">' + esc(meta) + '</div></div>' +
        '<div class="pc"><select data-imp="sel" aria-label="Ученик">' + opts(sel) + '</select>' +
        '<div class="pnew"' + (sel === 'new' ? '' : ' hidden') + '><input type="text" data-imp="name" value="' + attr(cr.name) + '" aria-label="Имя">' +
        '<input type="number" data-imp="rate" value="' + attr(cr.rate) + '" aria-label="Ставка, ₽"><label class="chk"><input type="checkbox" data-imp="arch"' + (cr.arch ? ' checked' : '') + '> в архив</label></div></div>' +
        '<details class="pev"><summary>Уроки по датам</summary><div class="evlist">' + p.keys.map(function (k) {
          var ev = evIdx[k];
          return ev ? '<label><input type="checkbox" data-imp="ev" data-k="' + attr(k) + '"' + (IMP.excl[k] ? '' : ' checked') + '>' + esc(dShort(L.localDate(ev.start)) + ', ' + hhmm(ev.start)) + '</label>' : '';
        }).join('') + '</div></details></div>';
    }).join('') + '</div>';
    renderPlan();
  }
  function renderPlan() {
    if (!IMP || !IMP.people.length) return;
    IMP.plan = L.planImport(S, IMP.events, IMP.people, IMP.map, { excluded: IMP.excl, today: todayISO(), now: Date.now() });
    var p = IMP.plan;
    var lines = p.students.map(function (x) {
      var bits = [];
      if (x.add.length) bits.push('в историю ' + x.add.length);
      if (x.already + x.link.length) bits.push('уже отмечено ' + (x.already + x.link.length));
      if (x.unmarked) bits.push('не отмечено ' + x.unmarked);
      if (x.future) bits.push('впереди ' + x.future);
      return '<div><b>' + esc(x.name) + (x.isNew ? ' (новый' + (x.arch === '1' ? ', в архив' : '') + ')' : '') + '</b>: ' + (bits.join(', ') || 'нечего добавить') + (x.add.length && !x.isNew ? ', начало учёта ' + dShort(x.start) : '') + '</div>';
    }).join('');
    $('#impPlan').innerHTML = '<div><b>Добавится в историю: ' + urokTxt(p.add) + '.</b> Балансы не изменятся.</div>' +
      (p.unmarked ? '<div>После начала учёта не отмечено: ' + urokTxt(p.unmarked) + '. Их я не добавляю, свежие появятся в блоке «Не отмечены».</div>' : '') + lines;
    $('#impOk').disabled = !(p.add || p.link || p.students.some(function (x) { return x.isNew || x.emails.length; }));
  }
  function findImport() {
    var from = ($('#impFrom').value || IMP.from);
    IMP.from = from;
    var to = L.addDays(todayISO(), 1);
    if (L.dayDiff(from, to) > 400) { IMP.status = 'Не больше 400 дней за раз.'; IMP.err = true; renderImport(); return; }
    IMP.busy = true; IMP.status = 'Ищу уроки в календаре…'; IMP.err = false; renderImport();
    gfetch('events', { from: startOfDayIso(from), to: startOfDayIso(to), q: S.calWords }).then(function (res) {
      IMP.busy = false;
      if (res.status !== 200) { IMP.status = res.status === 503 ? 'Google не подключён.' : gErr(res.j); IMP.err = true; renderImport(); return; }
      var now = Date.now();
      IMP.events = (res.j.events || []).filter(function (ev) { return new Date(ev.start).getTime() <= now; });
      IMP.people = L.groupPeople(IMP.events);
      IMP.map = {}; IMP.excl = {};
      IMP.people.forEach(function (p) {
        var sid = L.suggest(p, S.students);
        var stale = now - new Date(p.last).getTime() > 30 * 864e5;
        IMP.map[p.id] = sid ? { sid: sid } : { create: { name: p.names[0] || p.emails[0].split('@')[0], rate: Number(S.defRate) || 2000, arch: stale } };
      });
      IMP.status = IMP.events.length ? ('Найдено ' + urokTxt(IMP.events.length) + ', людей: ' + IMP.people.length + '. Проверьте, кто есть кто.') : 'Уроков за этот период не нашлось.';
      renderImport();
    }).catch(function () { IMP.busy = false; IMP.status = GERR['google-unreachable']; IMP.err = true; renderImport(); });
  }
  function onImportInput(t) {
    var row = t.closest('.person'); if (!row || !IMP) return;
    var p = row.dataset.p, kind = t.dataset.imp, m = IMP.map[p];
    if (kind === 'ev') { if (t.checked) delete IMP.excl[t.dataset.k]; else IMP.excl[t.dataset.k] = true; }
    else if (kind === 'sel') {
      var v = t.value, keep = m.create || { name: IMP.people.filter(function (x) { return x.id === p; })[0].label, rate: Number(S.defRate) || 2000, arch: false };
      IMP.map[p] = v === 'skip' ? { skip: true, create: keep } : (v === 'new' ? { create: keep } : { sid: v.slice(2), create: keep });
      $('.pnew', row).hidden = v !== 'new';
    } else if (m.create) {
      if (kind === 'name') m.create.name = t.value;
      if (kind === 'rate') m.create.rate = Math.round(num(t.value));
      if (kind === 'arch') m.create.arch = t.checked;
    }
    renderPlan();
  }
  function applyImportNow() {
    if (!IMP || !IMP.plan) return;
    var before = {};
    S.students.forEach(function (s) { before[s.id] = s.bal; });
    var next = L.applyImport(S, IMP.plan, function () { return newId(); });
    // Балансы не трогаем ни при каких условиях: если что-то не сходится, импорт отменяется.
    var broken = next.students.some(function (s) { return before[s.id] != null && s.bal !== before[s.id]; });
    if (broken) { IMP.status = 'Импорт остановлен: сошлись не все балансы. Ничего не изменено.'; IMP.err = true; renderImport(); return; }
    try { localStorage.setItem('uroki.beforeImport', JSON.stringify(snapshot())); } catch (e) { /* не страшно */ }
    var n = IMP.plan.add;
    commit(function () { S = next; });
    $('#dlgImport').close();
    IMP = null;
    toast('В историю добавлено: ' + urokTxt(n) + '. Балансы не изменились.');
  }

  // ---------- обзор ----------
  function renderDash() {
    var v = $('#dashBody'); if (!v) return;
    var today = todayISO(), cur = L.ym(today);
    var y = +cur.slice(0, 4), m = +cur.slice(5, 7);
    var from12 = (m === 12 ? y : y - 1) + '-' + L.pad(m === 12 ? 1 : m + 1);
    var first = L.firstYm(S) || cur;
    var ms = L.monthSeries(S, first > from12 ? first : from12, cur);
    var now = ms[ms.length - 1];
    var active = S.students.filter(function (s) { return s.arch !== '1'; });
    var prepaid = 0, debt = 0, nPre = 0, nDebt = 0;
    active.forEach(function (s) {
      if (s.bal > 0) { prepaid += s.bal * s.rate; nPre++; }
      if (s.bal < 0) { debt += -s.bal * s.rate; nDebt++; }
    });
    var mi = +cur.slice(5, 7) - 1;
    var kpis = '<div class="kpis">' +
      kpi('Уроков в ' + MONP[mi], fmt(now.lessons), now.charged ? '+ ' + now.charged + ' со списанием при отмене' : 'без отмен со списанием') +
      kpi('Проведено на сумму', rub(now.earned), 'уроки × ставка ученика') +
      kpi('Получено в ' + MONP[mi], rub(now.paid), 'оплаты, записанные в учёт') +
      kpi('Предоплачено', rub(prepaid), nPre ? 'у ' + nPre + ' ' + plural(nPre, ['ученика', 'учеников', 'учеников']) : 'ни у кого') +
      kpi('Долг', rub(debt), nDebt ? 'у ' + nDebt + ' ' + plural(nDebt, ['ученика', 'учеников', 'учеников']) : 'долгов нет') + '</div>';
    var w = Math.max(280, (v.clientWidth || 880) - 34);
    var calOn = MODE === 'server' && G.state === 'ok';
    v.innerHTML = kpis +
      '<section class="panel chart viz"><h2>Проведено и получено по месяцам</h2>' +
      '<p class="sub2">Оплаты учитываются с начала учёта, уроки из календаря и раньше.</p>' +
      '<div class="legend"><span><i style="background:var(--s1)"></i>Проведено на сумму</span><span><i style="background:var(--s2)"></i>Получено</span></div>' +
      chartMonths(ms, w) + tableMonths(ms) + '</section>' +
      '<section class="panel chart viz"><h2>Балансы учеников</h2><p class="sub2">В уроках: справа предоплата, слева долг.</p>' + chartBalances(active, w) + '</section>' +
      '<div class="two-col">' +
      '<section class="panel pad sched" style="padding:14px 16px"><h2 class="ph">Неделя вперёд</h2>' + (calOn ? weekHtml(7) : '<p class="gnote">Появится, когда подключён Google.</p>') + '</section>' +
      '<section class="panel pad"><h2 class="ph">Уроки без конспекта, 30 дней</h2>' + noNotesHtml(calOn) + '</section></div>';
  }
  function kpi(label, value, small) {
    return '<div class="panel kpi"><i>' + esc(label) + '</i><b>' + esc(value) + '</b><small>' + esc(small) + '</small></div>';
  }
  // Шаг шкалы 1, 2 или 5 × 10^n, чтобы подписи оси были ровными числами.
  function niceScale(v) {
    if (v <= 0) v = 1000;
    var raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    var n = Math.max(1, Math.ceil(v / step));
    return { step: step, n: n, max: step * n };
  }
  function colPath(x, y, w, h) {
    if (h <= 0) return '';
    var r = Math.min(4, h, w / 2);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }
  function tipAttr(lines) { return ' data-tip="' + attr(lines.join('\n')) + '" tabindex="0"'; }
  function monthName(k) { return MONF[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4); }
  function chartMonths(ms, W) {
    var H = 230, ml = 52, mr = 8, mt = 18, mb = 26;
    var iw = W - ml - mr, ih = H - mt - mb;
    var sc = niceScale(Math.max.apply(null, ms.map(function (r) { return Math.max(r.earned, r.paid); }).concat([0]))), max = sc.max;
    var band = iw / ms.length, bw = Math.max(4, Math.min(20, band * 0.3)), gap = 2;
    var yv = function (v) { return mt + ih - (v / max) * ih; };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Проведено и получено по месяцам">';
    for (var i = 0; i <= sc.n; i++) {
      var tv = sc.step * i, ty = Math.round(yv(tv)) + 0.5;
      s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + ty + '" y2="' + ty + '" stroke="' + (i ? 'var(--grid)' : 'var(--axis)') + '" stroke-width="1"/>';
      s += '<text x="' + (ml - 8) + '" y="' + (ty + 4) + '" text-anchor="end">' + esc(compact(tv)) + '</text>';
    }
    var step = band < 34 ? 2 : 1;
    ms.forEach(function (r, i) {
      var cx = ml + band * i + band / 2;
      var x1 = cx - bw - gap / 2, x2 = cx + gap / 2;
      s += '<path d="' + colPath(x1, yv(r.earned), bw, ih + mt - yv(r.earned)) + '" fill="var(--s1)"/>';
      s += '<path d="' + colPath(x2, yv(r.paid), bw, ih + mt - yv(r.paid)) + '" fill="var(--s2)"/>';
      if (i % step === (ms.length - 1) % step) s += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' + MONS[+r.ym.slice(5, 7) - 1] + '</text>';
      if (i === ms.length - 1 && r.earned > 0) s += '<text class="val" x="' + (x1 + bw / 2) + '" y="' + (yv(r.earned) - 6) + '" text-anchor="middle">' + esc(compact(r.earned)) + '</text>';
      s += '<rect class="hit" x="' + (ml + band * i) + '" y="' + mt + '" width="' + band + '" height="' + ih + '"' +
        tipAttr([monthName(r.ym), 'Проведено на ' + rub(r.earned) + ' · ' + urokTxt(r.lessons + r.charged), 'Получено ' + rub(r.paid)]) + '/>';
    });
    return s + '</svg>';
  }
  function tableMonths(ms) {
    return '<details class="tview"><summary>Таблица</summary><table><thead><tr><th>Месяц</th><th>Уроков</th><th>Отмен со списанием</th><th>Проведено на сумму</th><th>Получено</th></tr></thead><tbody>' +
      ms.slice().reverse().map(function (r) {
        return '<tr><td>' + monthName(r.ym) + '</td><td>' + r.lessons + '</td><td>' + r.charged + '</td><td>' + rub(r.earned) + '</td><td>' + rub(r.paid) + '</td></tr>';
      }).join('') + '</tbody></table></details>';
  }
  function chartBalances(list, W) {
    if (!list.length) return '<p class="gnote">Учеников пока нет.</p>';
    var rows = list.slice().sort(function (a, b) { return b.bal - a.bal; });
    var rh = 30, lw = Math.min(170, Math.round(W * 0.34)), mr = 120, H = rows.length * rh + 8;
    var maxAbs = Math.max.apply(null, rows.map(function (s) { return Math.abs(s.bal); }).concat([1]));
    var hasNeg = rows.some(function (s) { return s.bal < 0; });
    var iw = W - lw - mr;
    var zero = hasNeg ? lw + iw * (maxAbs / (2 * maxAbs)) : lw;
    var scale = hasNeg ? iw / (2 * maxAbs) : iw / maxAbs;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Балансы учеников">';
    s += '<line x1="' + (Math.round(zero) + 0.5) + '" x2="' + (Math.round(zero) + 0.5) + '" y1="2" y2="' + (H - 4) + '" stroke="var(--axis)" stroke-width="1"/>';
    rows.forEach(function (st, i) {
      var y = 4 + i * rh, bh = 16, by = y + (rh - bh) / 2 - 2;
      var len = Math.abs(st.bal) * scale, neg = st.bal < 0;
      var nm = st.name.length > 22 ? st.name.slice(0, 21) + '…' : st.name;
      s += '<text class="lbl" x="' + (lw - 10) + '" y="' + (by + 12) + '" text-anchor="end">' + esc(nm) + '</text>';
      if (len > 0) {
        var r = Math.min(4, len / 2, bh / 2), x0 = neg ? zero - len : zero, x1 = neg ? zero : zero + len;
        var d = neg
          ? 'M' + x1 + ',' + by + 'H' + (x0 + r) + 'Q' + x0 + ',' + by + ' ' + x0 + ',' + (by + r) + 'V' + (by + bh - r) + 'Q' + x0 + ',' + (by + bh) + ' ' + (x0 + r) + ',' + (by + bh) + 'H' + x1 + 'Z'
          : 'M' + x0 + ',' + by + 'H' + (x1 - r) + 'Q' + x1 + ',' + by + ' ' + x1 + ',' + (by + r) + 'V' + (by + bh - r) + 'Q' + x1 + ',' + (by + bh) + ' ' + (x1 - r) + ',' + (by + bh) + 'H' + x0 + 'Z';
        s += '<path d="' + d + '" fill="' + (neg ? 'var(--neg)' : 'var(--pos)') + '"/>';
      }
      var tx = neg ? Math.max(lw + 4, zero) + (len ? 8 : 6) : zero + len + 8;
      s += '<text class="val" x="' + tx + '" y="' + (by + 12) + '">' + esc(fmt(st.bal) + ' · ' + rub(st.bal * st.rate)) + '</text>';
      s += '<rect class="hit" x="0" y="' + y + '" width="' + W + '" height="' + rh + '"' +
        tipAttr([st.name, (st.bal < 0 ? 'Долг ' : 'Осталось ') + lessonsTxt(Math.abs(st.bal)), rub(Math.abs(st.bal) * st.rate) + ' по ставке ' + rub(st.rate)]) + '/>';
    });
    return s + '</svg>';
  }
  function noNotesHtml(calOn) {
    if (!calOn) return '<p class="gnote">Появится, когда подключён Google.</p>';
    var since = L.addDays(todayISO(), -30), items = [];
    S.students.forEach(function (st) {
      var notes = L.notesFor(st, G.notes);
      st.h.forEach(function (e) { if (e.t === 'lesson' && e.d >= since && !L.noteForEntry(e, notes)) items.push({ d: e.d, at: e.at, st: st }); });
    });
    items.sort(function (a, b) { return (a.at || a.d) < (b.at || b.d) ? 1 : -1; });
    if (!items.length) return '<p class="gnote">У всех уроков за 30 дней есть конспект.</p>';
    return '<ul class="lst">' + items.slice(0, 12).map(function (x) {
      return '<li><span>' + esc(dShort(x.d) + (x.at ? ', ' + hhmm(x.at) : '')) + '</span><b>' + esc(x.st.name) + '</b></li>';
    }).join('') + '</ul>' + (items.length > 12 ? '<p class="gnote">И ещё ' + (items.length - 12) + '.</p>' : '');
  }

  // ---------- посты ----------
  var POST_ST = ['черновик', 'одобрен', 'опубликован', 'отклонён'];
  var POST_NAME = { 'черновик': 'Черновик', 'одобрен': 'В очереди', 'опубликован': 'Опубликован', 'отклонён': 'Отклонён' };
  var POST_PAL = [['#E8F1FF', '#0B3D91'], ['#1D1D1F', '#FFFFFF'], ['#E9F8EE', '#0F5A2A'], ['#FFF4E5', '#7A3B00']];
  var PF = 'all', PSLIDE = {}, PTAB = {};
  var TG_ICON = '<svg width="30" height="30" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M21.5 4.3L2.9 11.4c-1 .4-1 1.6.1 1.9l4.6 1.4 1.8 5.5c.3.8 1.3 1 1.9.4l2.6-2.5 4.6 3.4c.7.5 1.7.1 1.9-.8L23 5.5c.2-1-.6-1.6-1.5-1.2zM9.9 14.4l8.6-7.7-6.8 9-.3 3.2-1.5-4.5z"/></svg>';
  function postSlides(p) { return String(p.slides || '').split(/\n\s*---\s*\n|\n{2,}/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function tgText(p) {
    var own = String(p.telegram || '').trim();
    return own || [String(p.title || '').trim(), String(p.caption || '').trim(), String(p.hashtags || '').trim()].filter(Boolean).join('\n\n');
  }
  function postQueue() { return (G.posts || []).filter(function (p) { return p.status === 'одобрен' && !p.tgPosted; }).reverse(); }
  // Бот публикует раз в день около 19:00 (по умолчанию), самый старый одобренный первым.
  function queueWhen(n) {
    var t = L.addDays(todayISO(), (new Date().getHours() >= 19 ? 1 : 0) + n - 1);
    var lbl = t === todayISO() ? 'сегодня' : (t === L.addDays(todayISO(), 1) ? 'завтра' : dayLabel(t));
    return lbl + ' около 19:00';
  }
  function renderPosts() {
    var v = $('#postsBody'); if (!v || TAB !== 'posts') return;
    var queue = G.posts ? postQueue() : [];
    var top = '<div class="ptop"><div class="pt"><h1>Посты</h1><p>Черновики по темам уроков, без имён и личных деталей. Новые появляются по воскресеньям.</p></div>' +
      '<div class="w tgq"><span class="tgi">' + TG_ICON + '</span><div class="tgt"><span class="lbl">Очередь в Telegram · @enpony</span>' +
      (queue.length ? '<b>Дальше: «' + esc(queue[0].title || 'Без заголовка') + '»</b><span>Выйдет ' + queueWhen(1) + ' · в очереди ' + queue.length + ' · по одному в день</span>'
        : '<b>Очередь пуста</b><span>Одобрите черновик, и бот опубликует его около 19:00</span>') + '</div>' +
      (MODE === 'server' ? '<button data-act="posts-refresh">Обновить</button>' : '') + '</div></div>';
    function msg(t, cls) { v.innerHTML = top + '<div class="w pempty' + (cls ? ' ' + cls : '') + '">' + t + '</div>'; }
    if (MODE !== 'server') { msg('Посты работают в версии на сервере.'); return; }
    if (G.postsState === 'off' || G.state === 'off') { msg('Google не подключён. Как подключить: docs/google-setup.md.'); return; }
    if (G.postsState === 'error') { msg('<span class="gnote err">' + esc(G.postsErr) + '</span>'); return; }
    if (!G.posts) { msg('Загружаю…'); if (G.postsState !== 'loading') loadPosts(); return; }
    if (!G.posts.length) { msg('Черновиков пока нет. Первые появятся после воскресного запуска.'); return; }
    var cnt = { all: G.posts.length };
    G.posts.forEach(function (p) { cnt[p.status] = (cnt[p.status] || 0) + 1; });
    var fil = '<div class="pfil" role="group" aria-label="Фильтр по статусу">' + [['all', 'Все'], ['черновик', 'Черновики'], ['одобрен', 'В очереди'], ['опубликован', 'Опубликованы'], ['отклонён', 'Отклонены']].map(function (f) {
      return '<button data-act="post-filter" data-f="' + attr(f[0]) + '" aria-pressed="' + (PF === f[0] ? 'true' : 'false') + '">' + f[1] + '<i>' + (cnt[f[0]] || 0) + '</i></button>';
    }).join('') + '</div>';
    var list = G.posts.filter(function (p) { return PF === 'all' || p.status === PF; });
    v.innerHTML = top + fil + (list.length ? '<div class="posts">' + list.map(function (p) {
      var idx = G.posts.indexOf(p), pal = POST_PAL[idx % POST_PAL.length];
      var sl = postSlides(p), cur = Math.min(PSLIDE[p.id] || 0, Math.max(0, sl.length - 1));
      var tab = PTAB[p.id] || 'ig', qn = queue.indexOf(p) + 1;
      var meta = [p.week ? 'Неделя ' + String(p.week).replace(/^\d{4}-W0?/, '') : '', p.dates ? 'по урокам ' + p.dates : ''].filter(Boolean).join(' · ');
      var act = '';
      if (p.status === 'черновик') act = '<button class="pro" data-act="post-approve">Одобрить в Telegram</button><button class="ghost" data-act="post-reject">Отклонить</button>';
      else if (p.status === 'одобрен' && !p.tgPosted) act = '<span class="qt">' + (qn ? qn + '-й в очереди, выйдет ' + queueWhen(qn) : 'В очереди') + '</span><button class="ghost" data-act="post-unqueue">Убрать из очереди</button>';
      else if (p.status === 'отклонён') act = '<button data-act="post-unqueue">Вернуть в черновики</button>';
      else act = '<span class="ok">Опубликован' + (p.tgPosted ? ' в Telegram ' + esc(dShort(L.localDate(p.tgPosted))) : '') + '</span>';
      return '<article class="w post" data-post="' + attr(p.id) + '">' +
        '<div class="car"><ol class="slides" style="--sbg:' + pal[0] + '; --sfg:' + pal[1] + '">' + (sl.length ? sl : [p.title || '']).map(function (x, k) {
          return '<li class="' + (k === cur ? 'on' : '') + '"><span class="sno">' + (k + 1) + ' / ' + (sl.length || 1) + '</span>' + esc(x) + '</li>';
        }).join('') + '</ol>' +
        (sl.length > 1 ? '<div class="arws"><button data-act="post-prev" aria-label="Предыдущий слайд">‹</button><button data-act="post-next" aria-label="Следующий слайд">›</button></div>' +
          '<div class="dots" aria-hidden="true">' + sl.map(function (x, k) { return '<i' + (k === cur ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' : '') + '</div>' +
        '<div class="pb"><div class="pm"><span class="pst" data-s="' + attr(p.status) + '">' + esc(POST_NAME[p.status] || p.status) + '</span>' + esc(meta) + '</div>' +
        '<h3>' + esc(p.title || 'Без заголовка') + '</h3>' +
        '<div class="pseg" role="tablist"><button role="tab" data-act="post-tab" data-t="ig" aria-selected="' + (tab === 'ig') + '">Instagram</button>' +
        '<button role="tab" data-act="post-tab" data-t="tg" aria-selected="' + (tab === 'tg') + '">Telegram</button></div>' +
        (tab === 'ig'
          ? '<div class="cap">' + esc(p.caption || 'Подписи нет') + (p.hashtags ? '<div class="tags">' + esc(p.hashtags) + '</div>' : '') + '</div>' +
            '<div class="hbtns"><button data-act="post-copy-slides">Скопировать слайды</button><button data-act="post-copy-cap">Скопировать подпись</button></div>'
          : '<div class="tgbox"><div class="bub">' + esc(tgText(p)) + '</div><small>Так пост будет выглядеть в канале. Текст правится в таблице, в колонке «Telegram».</small></div>' +
            '<div class="hbtns"><button data-act="post-copy-tg">Скопировать текст</button></div>') +
        '<div class="pact">' + act +
        '<select data-act-change="post-status" aria-label="Статус">' + POST_ST.map(function (s2) { return '<option value="' + s2 + '"' + (s2 === p.status ? ' selected' : '') + '>' + (POST_NAME[s2] || s2) + '</option>'; }).join('') + '</select></div>' +
        '</div></article>';
    }).join('') + '</div>' : '<div class="w pempty">Здесь пусто</div>');
  }
  function setPostStatus(p, val, okMsg) {
    var old = p.status;
    p.status = val; renderPosts();
    gpost({ action: 'post-status', id: p.id, status: val }).then(function (res) {
      if (res.status === 200) toast(okMsg || 'Статус сохранён');
      else { p.status = old; renderPosts(); toast(gErr(res.j)); }
    });
  }
  function postById(id) { return (G.posts || []).filter(function (p) { return p.id === id; })[0]; }

  // ---------- мелочи ----------
  function toast(msg, undo) {
    var old = document.getElementById('toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'toast' + (undo ? ' u' : ''); t.id = 'toast'; t.setAttribute('role', 'status');
    var sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
    if (undo) { var bt = document.createElement('button'); bt.dataset.act = 'toast-undo'; bt.textContent = 'Вернуть'; t.appendChild(bt); }
    document.body.appendChild(t); setTimeout(function () { if (t.parentNode) t.remove(); }, undo ? 6000 : 2600);
  }
  function copyText(s, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch (e) { toast('Не удалось скопировать'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(function () { toast(okMsg); }, fallback);
    else fallback();
  }
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  var armedKey = null, armedT = null;
  function needSecond(key, msg) {
    if (armedKey === key) { clearTimeout(armedT); armedKey = null; return true; }
    armedKey = key; toast(msg); clearTimeout(armedT); armedT = setTimeout(function () { armedKey = null; }, 4500);
    return false;
  }
  function showTip(el, x, y) {
    var tip = $('#tip'); if (!tip) return;
    var lines = String(el.getAttribute('data-tip') || '').split('\n');
    tip.innerHTML = '<b>' + esc(lines[0]) + '</b>' + lines.slice(1).map(function (l) { return '<br>' + esc(l); }).join('');
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, x + 14), top = y + 14;
    if (top + h > window.innerHeight - 8) top = y - h - 10;
    tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { var tip = $('#tip'); if (tip) tip.hidden = true; }

  // ---------- резервные копии на сервере ----------
  function loadDays() {
    var sel = $('#daySel'); if (!sel) return;
    if (MODE !== 'server') { sel.innerHTML = '<option value="">только в версии на сервере</option>'; return; }
    fetch('/api/backup', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) { sel.innerHTML = '<option value="">список недоступен</option>'; return; }
      sel.innerHTML = j.days.length ? j.days.map(function (d) { return '<option value="' + attr(d) + '">' + esc(dayLabel(d)) + '</option>'; }).join('') : '<option value="">копий пока нет</option>';
      if (j.drive && j.drive.last) G.drive = j.drive.last;
      renderSettings();
    }).catch(function () { sel.innerHTML = '<option value="">список недоступен</option>'; });
  }
  function fetchDay(d) {
    return fetch('/api/backup?date=' + encodeURIComponent(d), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; });
  }

  // ---------- импорт файла и вставки ----------
  function loadSnapshot(input) {
    var d = norm(input, true);
    if (!d || !d.students.length) return null;
    try { localStorage.setItem('uroki.beforeImport', JSON.stringify(snapshot())); } catch (e) { /* не страшно */ }
    commit(function () { S = d; });
    return d.students.length;
  }
  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var n = loadSnapshot(String(reader.result));
      toast(n ? ('Загружено учеников: ' + n) : 'В файле не нашлось учеников');
    };
    reader.onerror = function () { toast('Файл не читается'); };
    reader.readAsText(file);
  }

  // ---------- события ----------
  function rowSt(el) { var r = el.closest('.row'); return r ? stById(r.dataset.id) : null; }
  function evSt(el) {
    var r = el.closest('.evr') || el.closest('[data-ev]');
    return r ? { ev: evByKey(r.dataset.ev), st: r.dataset.sid ? stById(r.dataset.sid) : null } : { ev: null, st: null };
  }
  var TABS = ['today', 'main', 'dash', 'posts', 'set'];
  function setTab(t) {
    TAB = t;
    $$('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
    TABS.forEach(function (k) { var v = $('#v-' + k); if (v) v.hidden = k !== t; });
    var ha = $('#hact');
    if (ha) {
      ha.hidden = !(t === 'today' || t === 'main');
      ha.dataset.act = t === 'main' ? 'add' : 'pay-any';
      ha.textContent = t === 'main' ? 'Новый ученик' : 'Записать оплату';
    }
    var vm = $('#v-main'); if (vm && t !== 'main') vm.dataset.detail = '0';
    try { localStorage.setItem('uroki.tab', t); } catch (e) { /* не страшно */ }
    renderAll();
    if (t === 'set') loadDays();
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('button[data-act],button[data-tab]') : null;
    if (!b) return;
    if (b.dataset.tab) { setTab(b.dataset.tab); return; }
    var act = b.dataset.act, st = rowSt(b);
    if (act === 'm-prev') { mOff--; renderMonth(); return; }
    if (act === 'm-next') { if (mOff < 0) { mOff++; renderMonth(); } return; }
    if (act === 'add') { addStudent(); return; }
    if (act === 'pay-any') { openPayAny(); return; }
    if (act === 'pay-who') { var pw = stById(b.dataset.sid); if (pw) openPay(pw, true); return; }
    if (act === 'pick') { pick(b.dataset.sid, true); window.scrollTo(0, 0); return; }
    if (act === 'back') { var vb = $('#v-main'); if (vb) vb.dataset.detail = '0'; return; }
    if (act === 'sort') { SORT = b.dataset.sort; SEL = null; renderList(); return; }
    if (act === 'goto-stu') { SORT = stById(b.dataset.sid) && stById(b.dataset.sid).arch === '1' ? 'arch' : SORT; SEL = b.dataset.sid; setTab('main'); pick(b.dataset.sid, true); return; }
    if (act === 'toast-undo') {
      var snap = undoSnap; undoSnap = null; if (!snap) return;
      var nd = norm(snap); if (!nd) return;
      commit(function () { S = nd; }); toast('Вернул как было'); return;
    }
    if (act === 'remind-copy') { var rs = stById(remSid); copyText($('#remText').value, 'Текст скопирован'); if (rs) $('#dlgRemind').close(); return; }
    if (act === 'remind-wa') {
      var wt = $('#remText').value, ws = stById(remSid), ph = ws ? String(ws.contact || '').replace(/[^\d]/g, '') : '';
      window.open('https://wa.me/' + (ph.length >= 8 ? ph : '') + '?text=' + encodeURIComponent(wt), '_blank', 'noopener');
      return;
    }
    if (act === 'ev-all') {
      var its = unmarkedItems();
      withUndo('Отмечено уроков: ' + its.length, function () { its.forEach(function (x) { doOp(x.st, 'lesson', L.localDate(x.ev.start), x.ev); }); });
      return;
    }
    if (act === 'day') { openDay(); return; }
    if (act === 'export') { download('uroki-' + todayISO() + '.json', JSON.stringify(snapshot(), null, 2)); toast('Копия скачана'); return; }
    if (act === 'restore') { restoreLocal(); return; }
    if (act === 'import') { var fi = $('#importFile'); if (fi) fi.click(); return; }
    if (act === 'paste') {
      var box = $('#pasteBox'), pe = $('#pasteErr');
      if (box) box.value = ''; if (pe) pe.hidden = true;
      $('#dlgPaste').showModal(); if (box) setTimeout(function () { box.focus(); }, 50);
      return;
    }
    if (act === 'paste-ok') {
      var n = loadSnapshot($('#pasteBox').value || '');
      if (!n) { var pe2 = $('#pasteErr'); pe2.textContent = 'Не получилось разобрать. Нужен объект со списком students или просто массив учеников.'; pe2.hidden = false; return; }
      $('#dlgPaste').close(); toast('Загружено учеников: ' + n); return;
    }
    if (act === 'logout') { logout(); return; }
    if (act === 'close') { var dg = b.closest('dialog'); if (dg) dg.close(); return; }
    if (act === 'copy-due') { var r = stById(b.dataset.sid); if (r) openRemind(r); return; }
    if (act === 'pay-ok') {
      var ps = stById(curSid); if (!ps) return;
      var cnt = Math.round(num($('#payN').value)), sum = Math.round(num($('#payS').value));
      if (!cnt) { toast('Укажите количество уроков'); return; }
      var dt = $('#payD').value || todayISO(), cm = ($('#payC').value || '').trim();
      $('#dlgPay').close();
      withUndo(shortName(ps) + ': +' + urokTxt(cnt) + ', ' + rub(sum), function () { doPay(ps, cnt, sum, dt, cm); }); return;
    }
    if (act === 'cx-free' || act === 'cx-charge') {
      var cs = stById(curSid); if (!cs) return;
      var dt3 = $('#cxD').value || todayISO(), k = act === 'cx-charge' ? 'cancel-charged' : 'cancel-free', ev3 = curEv;
      curEv = null;
      $('#dlgCancel').close();
      withUndo(shortName(cs) + ': ' + (act === 'cx-charge' ? 'отмена, урок списан' : 'отмена, урок сохранён'), function () { doOp(cs, k, dt3, ev3); }); return;
    }
    if (act === 'd-lesson' || act === 'd-charge' || act === 'd-free') {
      var dr = b.closest('.dayrow'); if (!dr) return;
      var ds = stById(dr.dataset.sid); if (!ds) return;
      var kind = act === 'd-lesson' ? 'lesson' : (act === 'd-charge' ? 'cancel-charged' : 'cancel-free');
      var dd = $('#dayD').value || todayISO();
      commit(function () { doOp(ds, kind, dd); });
      $('.db', dr).textContent = fmt(ds.bal);
      $('.done', dr).textContent = kind === 'lesson' ? 'провёл ✓' : (kind === 'cancel-charged' ? 'списано ✓' : 'отмена ✓');
      return;
    }
    if (act === 'ev-lesson' || act === 'ev-cancel' || act === 'ev-skip' || act === 'ev-unskip') {
      var x = evSt(b); if (!x.ev || !x.st) return;
      var key = x.ev.key + '|' + x.st.id;
      if (act === 'ev-lesson') withUndo('Списано: ' + shortName(x.st) + ', ' + sgn(x.st.bal) + ' → ' + sgn(x.st.bal - 1), function () { doOp(x.st, 'lesson', L.localDate(x.ev.start), x.ev); });
      else if (act === 'ev-cancel') openCancel(x.st, x.ev);
      else if (act === 'ev-skip') { commit(function () { S.dismissed[key] = 1; }); toast('Отмечено: урока не было'); }
      else commit(function () { delete S.dismissed[key]; });
      return;
    }
    if (act === 'link') { var xl = evSt(b); if (xl.ev) openLink(xl.ev); return; }
    if (act === 'link-ok') { saveLink(); return; }
    if (act === 'g-refresh') { loadGoogle(); return; }
    if (act === 'cal-import') { openImport(); return; }
    if (act === 'imp-find') { findImport(); return; }
    if (act === 'imp-ok') { applyImportNow(); return; }
    if (act === 'day-restore' || act === 'day-download') {
      var d = ($('#daySel') || {}).value;
      if (!d) { toast('Выберите дату'); return; }
      if (act === 'day-restore' && !needSecond('day-restore', 'Заменить текущие данные копией за ' + dShort(d) + '? Нажмите ещё раз')) return;
      fetchDay(d).then(function (j) {
        if (!j || !j.state) { toast('Копия не найдена'); return; }
        if (act === 'day-download') { download('uroki-' + d + '.json', JSON.stringify(j.state, null, 2)); return; }
        var ns = norm(j.state);
        if (!ns) { toast('Копия повреждена'); return; }
        try { localStorage.setItem('uroki.beforeImport', JSON.stringify(snapshot())); } catch (e2) { /* не страшно */ }
        commit(function () { S = ns; });
        toast('Восстановлено состояние за ' + dShort(d));
      }).catch(function () { toast('Сервер не отвечает'); });
      return;
    }
    if (act === 'posts-refresh') { G.posts = null; G.postsState = ''; loadPosts(); return; }
    if (act === 'post-filter') { PF = b.dataset.f; renderPosts(); return; }
    if (/^post-/.test(act) && b.closest('[data-post]')) {
      var p = postById(b.closest('[data-post]').dataset.post); if (!p) return;
      var nsl = Math.max(1, postSlides(p).length);
      if (act === 'post-copy-cap') copyText(String(p.caption || '') + (p.hashtags ? '\n\n' + p.hashtags : ''), 'Подпись скопирована');
      else if (act === 'post-copy-slides') copyText(String(p.slides || ''), 'Слайды скопированы');
      else if (act === 'post-copy-tg') copyText(tgText(p), 'Текст для Telegram скопирован');
      else if (act === 'post-prev' || act === 'post-next') { PSLIDE[p.id] = ((PSLIDE[p.id] || 0) + (act === 'post-next' ? 1 : -1) + nsl) % nsl; renderPosts(); }
      else if (act === 'post-tab') { PTAB[p.id] = b.dataset.t; renderPosts(); }
      else if (act === 'post-approve') setPostStatus(p, 'одобрен', 'В очереди: ' + (postQueue().length + 1) + '-й. Бот опубликует сам');
      else if (act === 'post-reject') setPostStatus(p, 'отклонён', 'Пост отклонён');
      else if (act === 'post-unqueue') setPostStatus(p, 'черновик', 'Вернул в черновики');
      return;
    }
    if (act === 'hist-all') { if (st) { histAll[st.id] = 1; renderRows(); } return; }
    if (!st) return;
    if (act === 'lesson') { withUndo('Урок записан: ' + sgn(st.bal) + ' → ' + sgn(st.bal - 1), function () { doOp(st, 'lesson', todayISO()); }); return; }
    if (act === 'cancel') { openCancel(st, null); return; }
    if (act === 'pay') { openPay(st); return; }
    if (act === 'copy') { openRemind(st); return; }
    if (act === 'undo') {
      if (!needSecond('undo:' + st.id, 'Отменить последнюю запись? Нажмите ещё раз')) return;
      commit(function () { if (!doUndo(st)) toast('История пуста'); });
      return;
    }
    if (act === 'arch') { commit(function () { st.arch = st.arch === '1' ? '0' : '1'; }); return; }
    if (act === 'del') {
      if (!needSecond('del:' + st.id, 'Удалить ученика и всю историю? Нажмите ещё раз')) return;
      commit(function () { S.students = S.students.filter(function (x) { return x.id !== st.id; }); });
      toast('Ученик удалён');
    }
  }
  function addStudent() {
    var id = newId();
    commit(function () {
      S.students.push({ id: id, arch: '0', name: '', rate: Math.round(num(S.defRate)) || 2000, contact: '', note: '', bal: 0, emails: [], since: todayISO(), h: [] });
    });
    if (TAB !== 'main') setTab('main');
    SORT = 'bal'; pick(id, true);
    var row = $('#rows .row[data-id="' + id + '"]');
    if (row) { var n = $('.name', row); n.focus(); }
  }
  function restoreLocal() {
    var raw = null; try { raw = localStorage.getItem('uroki.backup'); } catch (e) { /* нет доступа */ }
    if (!raw) { toast('Копии на этом устройстве нет'); return; }
    if (!needSecond('restore', 'Это заменит текущие данные. Нажмите ещё раз')) return;
    var d = norm(raw);
    if (!d) { toast('Копия повреждена'); return; }
    commit(function () { S = d; });
    toast('Данные восстановлены');
  }
  // Правка полей прямо в карточке: сохраняем, когда поле теряет фокус.
  function onFocusOut(e) {
    var t = e.target; if (!t || !t.classList) return;
    var changed = false;
    if (t.id === 'tplLow' || t.id === 'tplDebt') {
      var k = t.id, v = t.textContent || '';
      if (S[k] !== v) { S[k] = v; changed = true; }
    } else {
      var st = rowSt(t); if (!st) return;
      if (t.classList.contains('name')) { var nm = (t.textContent || '').replace(/\s+/g, ' ').trim(); if (nm !== st.name) { st.name = nm; changed = true; } }
      else if (t.classList.contains('rate')) { var r = Math.round(num(t.textContent)); r = r > 0 ? r : 0; if (r !== st.rate) { st.rate = r; } changed = true; }
      else if (t.classList.contains('contact')) { var c = (t.textContent || '').trim(); if (c !== st.contact) { st.contact = c; changed = true; } }
      else if (t.classList.contains('snote')) { var no = t.textContent || ''; if (no !== st.note) { st.note = no; changed = true; } }
      else if (t.classList.contains('emails')) {
        var em = String(t.textContent || '').split(/[,;\s]+/).map(L.cleanEmail).filter(Boolean);
        em = em.filter(function (x, i) { return em.indexOf(x) === i; });
        if (em.join(',') !== (st.emails || []).join(',')) { st.emails = em; changed = true; }
      } else if (t.classList.contains('h-note')) {
        var h = t.closest('.h'), en = h ? st.h[+h.dataset.i] : null;
        if (en && en.note !== (t.textContent || '')) { en.note = t.textContent || ''; changed = true; }
      }
    }
    if (changed) setTimeout(after, 0);
  }
  function bind() {
    document.addEventListener('click', onClick);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('toggle', function (e) {
      var t = e.target;
      if (t.classList && t.classList.contains('hist')) { if (t.open) openHist[t.dataset.sid] = 1; else delete openHist[t.dataset.sid]; }
      if (t.classList && t.classList.contains('nt') && t.dataset.k) { if (t.open) openNotes[t.dataset.k] = 1; else delete openNotes[t.dataset.k]; }
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('.name,.rate,.contact,.h-note,.emails')) { e.preventDefault(); e.target.blur(); }
      if (e.key === 'Escape') hideTip();
    });
    document.addEventListener('paste', function (e) {
      var t = e.target; if (!t || !t.isContentEditable) return;
      var cd = e.clipboardData || window.clipboardData; if (!cd) return;
      e.preventDefault();
      var txt = cd.getData('text') || '';
      if (!t.classList.contains('tpl') && !t.classList.contains('snote')) txt = txt.replace(/\s+/g, ' ').trim();
      document.execCommand('insertText', false, txt);
    });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'arch') { $('#rows').dataset.localArch = t.checked ? '1' : '0'; return; }
      if (t.id === 'thr') { commit(function () { S.thr = String(Math.max(0, Math.round(num(t.value)))); }); return; }
      if (t.id === 'defRate') { commit(function () { S.defRate = String(Math.round(num(t.value)) || 2000); }); return; }
      if (t.id === 'calWords') { var w = t.value.trim(); if (w && w !== S.calWords) { commit(function () { S.calWords = w; }); loadGoogle(); } return; }
      if (t.id === 'payN') { syncPaySum(); return; }
      if (t.id === 'dayD') { renderDayCal(); return; }
      if (t.id === 'importFile') { if (t.files && t.files[0]) importFile(t.files[0]); t.value = ''; return; }
      if (t.dataset && t.dataset.imp) { onImportInput(t); return; }
      if (t.dataset && t.dataset.link === 'sel') { var f = t.closest('.field'); $('[data-link="new"]', f).hidden = t.value !== 'new'; return; }
      if (t.dataset && t.dataset.actChange === 'post-status') {
        var card = t.closest('[data-post]'), p = postById(card.dataset.post);
        if (p) setPostStatus(p, t.value);
      }
    });
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'q') { SEL = null; renderList(); return; }
      if (t.id === 'payN') {
        syncPaySum();
        $$('#packs button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.n === String(Math.round(num($('#payN').value))) ? 'true' : 'false'); });
      }
      if (t.dataset && (t.dataset.imp === 'name' || t.dataset.imp === 'rate')) onImportInput(t);
    });
    document.addEventListener('mouseover', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); });
    document.addEventListener('mousemove', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else hideTip(); });
    document.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('[data-tip]'); if (el) { var r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top + 10); } else hideTip(); });
    var rz = null;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (TAB === 'dash') renderDash(); }, 150); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') renderAll(); });
    window.addEventListener('beforeunload', function () {
      if (MODE === 'server' && dirty && navigator.sendBeacon) {
        try { navigator.sendBeacon('/api/state', new Blob([JSON.stringify(snapshot())], { type: 'application/json' })); } catch (e) { /* поздно */ }
      }
    });
    var gf = $('#gateForm');
    if (gf) gf.addEventListener('submit', function (e) { e.preventDefault(); var pw = $('#gatePw'); login(pw ? pw.value : ''); });
    var packs = $('#packs');
    if (packs) packs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]'); if (!b) return;
      $('#payN').value = b.dataset.n; syncPaySum();
      $$('#packs button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    });
    setInterval(function () {
      if (document.visibilityState === 'visible' && MODE === 'server' && G.state !== 'off') loadGoogle();
    }, 15 * 60e3);
  }

  // ---------- запуск ----------
  function loadLocal() {
    var raw = null; try { raw = localStorage.getItem('uroki.backup'); } catch (e) { /* нет доступа */ }
    if (!raw) return false;
    var d = norm(raw);
    if (!d || !d.students.length) return false;
    S = d;
    return true;
  }
  function showGate(msg) {
    var g = $('#gate'); if (!g) return;
    g.hidden = false;
    var e = $('#gateErr'); if (e) { e.textContent = msg || ''; e.hidden = !msg; }
    var f = $('#gatePw'); if (f) { f.value = ''; setTimeout(function () { f.focus(); }, 50); }
  }
  function hideGate() { var g = $('#gate'); if (g) g.hidden = true; }
  function startServer() {
    if (location.protocol === 'file:') { goLocal(); return Promise.resolve(); }
    setChip('checking');
    return fetch('/api/state', { cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401) { MODE = 'server'; setChip('locked'); showGate(''); return null; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        if (j === null) return;
        MODE = 'server'; hideGate();
        var needsPw = !!(j && j.auth && j.auth.required);
        var btn = $('[data-act="logout"]'); if (btn) btn.hidden = !needsPw;
        var warn = $('#openWarn'); if (warn) warn.hidden = needsPw;
        var d = j && j.state ? norm(j.state) : null;
        if (d) {
          S = d; renderAll(); backupLocal(); setChip('server');
        } else {
          // Хранилище пустое: заливаем то, что есть на руках, как начальное состояние.
          loadLocal(); renderAll(); backupLocal(); setChip('server'); dirty = true; flush();
        }
        loadCachedG();
        renderAll();
        loadGoogle();
      })
      .catch(function (e) { console.warn('storage', e); goLocal(); });
  }
  function login(pw) {
    return fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
      .then(function (r) {
        if (r.ok) return startServer();
        if (r.status === 429) { showGate('Слишком много попыток. Подождите 15 минут.'); return; }
        if (r.status === 400) { showGate('Пароль на сервере не задан. Добавьте APP_PASSWORD в настройках проекта.'); return; }
        showGate('Пароль не подошёл');
      })
      .catch(function () { showGate('Сервер не отвечает'); });
  }
  function logout() {
    if (!needSecond('logout', 'Выйти из аккаунта? Нажмите ещё раз')) return;
    try { localStorage.removeItem('uroki.g'); } catch (e) { /* не страшно */ }
    fetch('/api/session', { method: 'DELETE', cache: 'no-store' })
      .then(function () { return null; }, function () { return null; })
      .then(function () { location.replace(location.pathname + '?logout=' + Date.now()); });
  }
  function goLocal() {
    MODE = 'local'; setChip('local');
    loadLocal();
    renderAll(); backupLocal();
  }
  function init() {
    var saved = null; try { saved = localStorage.getItem('uroki.tab'); } catch (e) { /* нет доступа */ }
    setTab(TABS.indexOf(saved) > -1 ? saved : 'today');
    startServer();
  }
  if (!window.__urokiBound) { window.__urokiBound = true; bind(); }
  init();
})();
