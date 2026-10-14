// Чистая логика учёта: без DOM и без сети. Работает и в браузере (window.UrokiLib),
// и в Node (require), поэтому её можно проверять быстрыми юнит-тестами.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UrokiLib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- даты ----------
  // Все даты в истории хранятся как 'YYYY-MM-DD' по часам устройства, как и раньше.
  function pad(n) { return String(n).padStart(2, '0'); }
  function localDate(x) {
    var d = x instanceof Date ? x : new Date(x);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function utcOf(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function dayDiff(a, b) { return Math.round((utcOf(b) - utcOf(a)) / 864e5); }
  function addDays(s, n) {
    var t = new Date(utcOf(s) + n * 864e5);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  function ym(s) { return String(s || '').slice(0, 7); }

  // ---------- имена ----------
  var TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
    л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  function latin(s) {
    return String(s || '').toLowerCase()
      .replace(/[а-яё]/g, function (c) { return TR[c] != null ? TR[c] : c; })
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // Мягкое сравнение для разных транслитераций: Dmitrii / Dmitriy, Alyona / Alena.
  function soft(t) { return t.replace(/kh/g, 'h').replace(/[aeiouy]+/g, 'a'); }
  function tokens(s) { return latin(s).split(' ').filter(function (t) { return t.length >= 3; }); }
  function sameName(a, b) {
    var A = tokens(a), B = tokens(b);
    if (!A.length || !B.length) return false;
    var short = A.length <= B.length ? A : B, long = short === A ? B : A;
    return short.every(function (t) {
      return long.some(function (u) { return u === t || soft(u) === soft(t); });
    });
  }
  function eventName(title) {
    var m = String(title || '').match(/\(([^()]+)\)\s*$/);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }
  function cleanEmail(e) {
    var v = String(e || '').trim().toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : '';
  }
  function emailLocal(e) { return String(e || '').split('@')[0].replace(/[^a-z0-9]/g, ''); }

  // ---------- состояние ----------
  var LESSONISH = { lesson: 1, 'cancel-charged': 1, 'cancel-free': 1 };
  function isLessonish(t) { return !!LESSONISH[t]; }

  // Терпимый разбор: полный снимок, голый массив, русские ключи, числа строками.
  // Баланс ученика (bal) переносится как есть и никогда не пересчитывается.
  function normalize(d, defaults) {
    defaults = defaults || {};
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return null; } }
    if (Array.isArray(d)) d = { students: d };
    if (!d || typeof d !== 'object') return null;
    var list = d.students || d['ученики'] || d.items;
    if (!Array.isArray(list)) return null;
    var today = defaults.today || localDate(new Date());
    var defRate = Number(d.defRate) || Number(defaults.defRate) || 2000;
    var dismissed = {};
    if (d.dismissed && typeof d.dismissed === 'object') {
      Object.keys(d.dismissed).forEach(function (k) { if (d.dismissed[k]) dismissed[k] = 1; });
    }
    return {
      v: 2,
      ts: Number(d.ts) || Date.now(),
      thr: d.thr != null ? String(d.thr) : String(defaults.thr != null ? defaults.thr : 2),
      defRate: String(defRate),
      tplLow: d.tplLow != null ? String(d.tplLow) : (defaults.tplLow || ''),
      tplDebt: d.tplDebt != null ? String(d.tplDebt) : (defaults.tplDebt || ''),
      calWords: d.calWords != null ? String(d.calWords) : (defaults.calWords || 'по английскому, Silver Fern'),
      dismissed: dismissed,
      ignore: uniq((Array.isArray(d.ignore) ? d.ignore : []).map(cleanEmail).filter(Boolean)),
      students: list.map(function (x, i) {
        x = x || {};
        var bal = Number(x.bal != null ? x.bal : (x.balance != null ? x.balance : x['остаток']));
        if (!isFinite(bal)) bal = 0;
        var rate = Number(x.rate != null ? x.rate : x['ставка']) || defRate;
        var h = Array.isArray(x.h) ? x.h : (Array.isArray(x.history) ? x.history : []);
        // Пустую историю достраиваем только при импорте файла: у загруженного с сервера
        // ученика без записей синтетическая строка не нужна.
        if (!h.length && !x.since && defaults.fillInit) h = [{ d: today, t: 'init', delta: bal, amt: 0, label: 'Стартовый остаток', note: '' }];
        var emails = (Array.isArray(x.emails) ? x.emails : String(x.emails || '').split(/[,;\s]+/))
          .map(cleanEmail).filter(Boolean);
        var st = {
          id: String(x.id || ('s' + (i + 1) + '-' + Math.random().toString(36).slice(2, 6))),
          arch: String(x.arch || '0') === '1' ? '1' : '0',
          name: String(x.name || x['имя'] || 'Без имени'),
          rate: rate,
          contact: String(x.contact || x['контакт'] || ''),
          note: String(x.note || ''),
          bal: Math.round(bal),
          emails: uniq(emails),
          h: h.map(function (r) {
            r = r || {};
            var e = {
              d: String(r.d || r.date || today), t: String(r.t || r.type || 'init'),
              delta: Number(r.delta) || 0, amt: Number(r.amt || r.amount) || 0,
              label: String(r.label || 'Запись'), note: String(r.note || '')
            };
            if (r.at) e.at = String(r.at);
            if (r.ev) e.ev = String(r.ev);
            if (r.src) e.src = String(r.src);
            return e;
          })
        };
        if (x.since) st.since = String(x.since);
        return st;
      })
    };
  }
  function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }

  // С какой даты учёт ведётся по-настоящему: всё раньше считается историей,
  // которая на баланс не влияет. Импортированные из календаря записи не в счёт.
  function studentStart(st, today) {
    if (st.since) return st.since;
    var min = null;
    st.h.forEach(function (e) { if (e.src !== 'cal' && (!min || e.d < min)) min = e.d; });
    return min || today;
  }

  // ---------- события календаря ----------
  // Событие из Apps Script: {key, title, start, end, emails}.
  function eventsFor(st, events) {
    if (!st.emails || !st.emails.length) return [];
    return events.filter(function (ev) {
      return (ev.emails || []).some(function (e) { return st.emails.indexOf(e) > -1; });
    });
  }
  function studentsFor(ev, students) {
    return students.filter(function (st) {
      return (st.emails || []).some(function (e) { return (ev.emails || []).indexOf(e) > -1; });
    });
  }

  // Сопоставляет события ученика с его записями.
  //   paired    событие уже отмечено (по ключу события или по близкой дате)
  //   before    событие раньше начала учёта: кандидат в историю
  //   unmarked  прошло, но не отмечено
  //   future    ещё не наступило
  // Нечёткое совпадение по дате (±tol дней) только для прошедших событий: так
  // старые отметки без ключа события находят свои уроки, а будущий урок не
  // «съедает» сегодняшнюю отметку.
  function pairEvents(st, events, opts) {
    opts = opts || {};
    var now = opts.now != null ? opts.now : Date.now();
    var today = opts.today || localDate(new Date(now));
    var tol = opts.tolerance != null ? opts.tolerance : 2;
    var dismissed = opts.dismissed || {};
    var start = studentStart(st, today);
    var used = {};
    var byEv = {};
    st.h.forEach(function (e, i) { if (e.ev && byEv[e.ev] == null) byEv[e.ev] = i; });
    var res = { paired: [], before: [], unmarked: [], future: [], start: start };
    var pending = [];
    events.slice().sort(byStart).forEach(function (ev) {
      var i = byEv[ev.key];
      if (i != null && !used[i]) { used[i] = 1; res.paired.push({ ev: ev, idx: i }); return; }
      if (dismissed[ev.key + '|' + st.id]) { res.paired.push({ ev: ev, idx: -1, dismissed: true }); return; }
      pending.push(ev);
    });
    pending.forEach(function (ev) {
      var d = localDate(ev.start);
      var past = new Date(ev.start).getTime() <= now;
      if (d < start) { res.before.push(ev); return; }
      if (past) {
        var best = -1, bestDiff = tol + 1;
        st.h.forEach(function (e, i) {
          if (used[i] || e.ev || !isLessonish(e.t) || e.src === 'cal') return;
          var diff = Math.abs(dayDiff(e.d, d));
          if (diff < bestDiff) { best = i; bestDiff = diff; }
        });
        if (best > -1) { used[best] = 1; res.paired.push({ ev: ev, idx: best, fuzzy: true }); return; }
        res.unmarked.push(ev);
      } else {
        res.future.push(ev);
      }
    });
    return res;
  }
  function byStart(a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; }

  // ---------- люди из календаря ----------
  // Склеивает адреса и имена в людей: один адрес с двумя написаниями имени и одно
  // имя с опечаткой в адресе становятся одним человеком.
  function groupPeople(events) {
    var parent = {};
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function add(x) { if (parent[x] == null) parent[x] = x; }
    function union(a, b) { add(a); add(b); var ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; }
    function nkey(nm) { return 'n:' + soft(latin(nm).replace(/ /g, '')); }
    var evs = events.slice().sort(byStart).map(function (ev) {
      return { ev: ev, nm: eventName(ev.title), emails: uniq((ev.emails || []).map(cleanEmail).filter(Boolean)) };
    });
    evs.forEach(function (x) {
      x.emails.forEach(function (e) { add('e:' + e); });
      // Имя в скобках принадлежит записавшемуся, только если адрес у события один.
      if (x.nm) { add(nkey(x.nm)); if (x.emails.length === 1) union(nkey(x.nm), 'e:' + x.emails[0]); }
    });
    var groups = {};
    evs.forEach(function (x) {
      var keys = x.emails.length ? x.emails.map(function (e) { return 'e:' + e; }) : (x.nm ? [nkey(x.nm)] : []);
      uniq(keys.map(find)).forEach(function (r) {
        var g = groups[r] || (groups[r] = { id: r, emails: [], names: [], titles: [], keys: [], first: x.ev.start, last: x.ev.start });
        if (g.keys.indexOf(x.ev.key) < 0) g.keys.push(x.ev.key);
        if (x.ev.start < g.first) g.first = x.ev.start;
        if (x.ev.start > g.last) g.last = x.ev.start;
        if (x.nm && x.emails.length <= 1) {
          if (!g.names.some(function (n) { return n.toLowerCase() === x.nm.toLowerCase(); })) g.names.push(x.nm);
        } else if (!x.nm) {
          var t = String(x.ev.title || '');
          if (t && g.titles.indexOf(t) < 0) g.titles.push(t);
        }
      });
    });
    Object.keys(parent).forEach(function (k) {
      if (k.indexOf('e:') !== 0) return;
      var g = groups[find(k)];
      if (g && g.emails.indexOf(k.slice(2)) < 0) g.emails.push(k.slice(2));
    });
    return Object.keys(groups).map(function (r) {
      var g = groups[r];
      g.count = g.keys.length;
      g.label = g.names[0] || g.emails[0] || r;
      return g;
    }).sort(function (a, b) { return b.count - a.count || (a.label < b.label ? -1 : 1); });
  }

  // Кому из учеников скорее всего принадлежит человек из календаря.
  function suggest(person, students) {
    var i, st;
    for (i = 0; i < students.length; i++) {
      st = students[i];
      if ((st.emails || []).some(function (e) { return person.emails.indexOf(e) > -1; })) return st.id;
    }
    for (i = 0; i < students.length; i++) {
      st = students[i];
      if (person.names.some(function (n) { return sameName(n, st.name); })) return st.id;
    }
    // Адрес вида svetlanakostryukova@ или danilinaalyona@: ищем фамилию внутри.
    for (i = 0; i < students.length; i++) {
      st = students[i];
      var tk = tokens(st.name).filter(function (t) { return t.length >= 5; });
      if (!tk.length) continue;
      var hit = person.emails.some(function (e) {
        var loc = emailLocal(e);
        return tk.some(function (t) { return loc.indexOf(t) > -1; });
      });
      if (hit) return st.id;
    }
    return null;
  }

  // ---------- импорт истории ----------
  // mapping: personId -> {sid} | {create: {name, rate, arch}} | {skip: true}
  // excluded: {eventKey: true} — события, которые человек снял галочкой.
  // Возвращает план, ничего не меняя. Балансы план не трогает по построению:
  // новые записи идут с delta 0, существующим только дописываются at и ev.
  function planImport(state, events, people, mapping, opts) {
    opts = opts || {};
    var excluded = opts.excluded || {};
    var today = opts.today || localDate(new Date(opts.now || Date.now()));
    var targets = {};
    var order = [];
    people.forEach(function (p) {
      var m = mapping[p.id];
      if (!m || m.skip) return;
      var tkey = m.sid ? m.sid : ('new:' + p.id);
      var t = targets[tkey];
      if (!t) {
        var base = m.sid ? findStudent(state, m.sid) : null;
        if (m.sid && !base) return;
        t = targets[tkey] = {
          key: tkey, sid: m.sid || null, isNew: !m.sid,
          name: base ? base.name : String((m.create && m.create.name) || p.label),
          rate: base ? base.rate : (Number(m.create && m.create.rate) || Number(state.defRate) || 2000),
          arch: base ? base.arch : ((m.create && m.create.arch) ? '1' : '0'),
          emails: base ? (base.emails || []).slice() : [],
          keys: []
        };
        order.push(tkey);
      }
      p.emails.forEach(function (e) { if (t.emails.indexOf(e) < 0) t.emails.push(e); });
      p.keys.forEach(function (k) { if (t.keys.indexOf(k) < 0) t.keys.push(k); });
    });
    var evByKey = {};
    events.forEach(function (ev) { evByKey[ev.key] = ev; });
    var plan = { students: [], add: 0, link: 0, unmarked: 0, today: today };
    order.forEach(function (tkey) {
      var t = targets[tkey];
      var base = t.sid ? findStudent(state, t.sid) : { id: 'new', h: [], since: today, emails: t.emails };
      var probe = { id: base.id, h: base.h, since: base.since, emails: t.emails };
      var evs = t.keys.map(function (k) { return evByKey[k]; }).filter(function (ev) { return ev && !excluded[ev.key]; });
      var r = pairEvents(probe, evs, { now: opts.now, today: today, tolerance: opts.tolerance, dismissed: state.dismissed });
      var adds = r.before.map(function (ev) {
        return { d: localDate(ev.start), t: 'lesson', delta: 0, amt: 0, label: 'Урок по календарю', note: '', at: ev.start, ev: ev.key, src: 'cal' };
      });
      var links = r.paired.filter(function (p) { return p.fuzzy; }).map(function (p) {
        return { idx: p.idx, at: p.ev.start, ev: p.ev.key };
      });
      plan.students.push({
        key: tkey, sid: t.sid, isNew: t.isNew, name: t.name, rate: t.rate, arch: t.arch,
        emails: t.emails, start: r.start, add: adds, link: links,
        already: r.paired.length - links.length, unmarked: r.unmarked.length, future: r.future.length
      });
      plan.add += adds.length;
      plan.link += links.length;
      plan.unmarked += r.unmarked.length;
    });
    return plan;
  }

  // Применяет план к копии состояния. Порядок записей «по операциям» сохраняется:
  // история из календаря встаёт перед ними, отсортированная по дате, поэтому
  // «Отменить последнюю запись» по-прежнему отменяет последнее действие.
  function applyImport(state, plan, newId) {
    var s = JSON.parse(JSON.stringify(state));
    var made = 0;
    plan.students.forEach(function (ps) {
      var st;
      if (ps.isNew) {
        st = {
          id: newId ? newId(made++) : ('s' + Date.now().toString(36) + made++),
          arch: ps.arch === '1' ? '1' : '0', name: ps.name, rate: ps.rate, contact: '', note: '',
          bal: 0, emails: ps.emails.slice(), since: plan.today, h: []
        };
        s.students.push(st);
      } else {
        st = findStudent(s, ps.sid);
        if (!st) return;
        st.emails = uniq((st.emails || []).concat(ps.emails));
      }
      ps.link.forEach(function (l) {
        var e = st.h[l.idx];
        if (e && !e.ev) { e.at = l.at; e.ev = l.ev; }
      });
      if (ps.add.length) {
        var have = {};
        st.h.forEach(function (e) { if (e.ev) have[e.ev] = 1; });
        var fresh = ps.add.filter(function (e) { return !have[e.ev]; });
        var cal = st.h.filter(function (e) { return e.src === 'cal'; }).concat(fresh);
        cal.sort(function (a, b) { return (a.at || a.d) < (b.at || b.d) ? -1 : 1; });
        st.h = cal.concat(st.h.filter(function (e) { return e.src !== 'cal'; }));
      }
    });
    return s;
  }
  function findStudent(state, id) {
    for (var i = 0; i < state.students.length; i++) if (state.students[i].id === id) return state.students[i];
    return null;
  }

  // ---------- конспекты ----------
  // Заметка: {id, start, date, title, emails, student, summary, url}.
  function notesFor(st, notes) {
    var em = st.emails || [];
    return notes.filter(function (n) {
      if ((n.emails || []).length) return n.emails.some(function (e) { return em.indexOf(e) > -1; });
      return n.student ? sameName(n.student, st.name) : false;
    }).sort(function (a, b) { return (a.start || a.date) < (b.start || b.date) ? 1 : -1; });
  }
  function noteDate(n) { return n.start ? localDate(n.start) : n.date; }
  function noteForEntry(entry, stNotes) {
    if (!isLessonish(entry.t)) return null;
    var best = null, bestGap = Infinity;
    stNotes.forEach(function (n) {
      if (entry.at && n.start) {
        var gap = Math.abs(new Date(n.start) - new Date(entry.at));
        if (gap <= 3 * 3600e3 && gap < bestGap) { best = n; bestGap = gap; }
      } else if (noteDate(n) === entry.d && bestGap === Infinity) {
        best = n; bestGap = 1e12;
      }
    });
    return best;
  }

  // ---------- деньги и уроки по месяцам ----------
  // Проведено на сумму = (уроки + отмены со списанием) × текущая ставка ученика.
  function monthSeries(state, fromYm, toYm) {
    var out = [], map = {};
    var cur = fromYm;
    var guard = 0;
    while (cur <= toYm && guard++ < 240) {
      var row = { ym: cur, lessons: 0, charged: 0, free: 0, earned: 0, paid: 0 };
      out.push(row); map[cur] = row;
      var y = +cur.slice(0, 4), m = +cur.slice(5, 7);
      m++; if (m > 12) { m = 1; y++; }
      cur = y + '-' + pad(m);
    }
    state.students.forEach(function (st) {
      st.h.forEach(function (e) {
        var r = map[ym(e.d)];
        if (!r) return;
        if (e.t === 'lesson') { r.lessons++; r.earned += st.rate; }
        else if (e.t === 'cancel-charged') { r.charged++; r.earned += st.rate; }
        else if (e.t === 'cancel-free') r.free++;
        else if (e.t === 'pay') r.paid += e.amt;
      });
    });
    return out;
  }
  function firstYm(state) {
    var min = null;
    state.students.forEach(function (st) { st.h.forEach(function (e) { if (!min || e.d < min) min = e.d; }); });
    return min ? ym(min) : null;
  }

  // ---------- маленький безопасный Markdown для конспектов ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function inline(s) {
    var t = esc(s);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function (_, a, u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + a + '</a>';
    });
    return t;
  }
  function md(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var html = '', depth = 0, para = [];
    function flushPara() { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } }
    function setDepth(n) {
      while (depth < n) { html += '<ul>'; depth++; }
      while (depth > n) { html += '</ul>'; depth--; }
    }
    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var m;
      if (!line.trim()) { flushPara(); return; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        flushPara(); setDepth(0);
        html += '<h4>' + inline(m[2]) + '</h4>';
        return;
      }
      if ((m = line.match(/^(\s*)[-*]\s+(.*)$/))) {
        flushPara();
        var lvl = Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2) + 1);
        setDepth(lvl);
        html += '<li>' + inline(m[2]) + '</li>';
        return;
      }
      if (depth && /^\s{2,}\S/.test(line)) { html += '<li class="cont">' + inline(line.trim()) + '</li>'; return; }
      setDepth(0);
      para.push(line.trim());
    });
    flushPara(); setDepth(0);
    return html;
  }

  return {
    pad: pad, localDate: localDate, dayDiff: dayDiff, addDays: addDays, ym: ym,
    latin: latin, sameName: sameName, eventName: eventName, cleanEmail: cleanEmail,
    isLessonish: isLessonish, normalize: normalize, studentStart: studentStart,
    eventsFor: eventsFor, studentsFor: studentsFor, pairEvents: pairEvents,
    groupPeople: groupPeople, suggest: suggest, planImport: planImport, applyImport: applyImport,
    findStudent: findStudent, notesFor: notesFor, noteForEntry: noteForEntry, noteDate: noteDate,
    monthSeries: monthSeries, firstYm: firstYm, esc: esc, md: md
  };
});
