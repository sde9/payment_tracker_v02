// Юнит-тесты чистой логики: сопоставление календаря, импорт истории, конспекты, суммы.
// Все имена и адреса вымышленные: репозиторий публичный.
process.env.TZ = 'Pacific/Auckland';
const L = require('../src/lib.js');

let failed = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function ok(name, got, exp) {
  const p = eq(got, exp);
  if (!p) failed++;
  console.log((p ? 'PASS' : 'FAIL') + '  ' + name + '  got=' + JSON.stringify(got) + (p ? '' : ' exp=' + JSON.stringify(exp)));
}

const NOW = new Date('2026-10-14T15:00:00+13:00').getTime();
const TODAY = '2026-10-14';
const BOOK = 'Записаться на сессию встречу по английскому';
let n = 0;
const ev = (start, title, emails) => ({ key: 'uid' + (++n) + '@google.com|' + new Date(start).toISOString(), title, start: new Date(start).toISOString(), end: new Date(new Date(start).getTime() + 45 * 60e3).toISOString(), emails });

// ---------- normalize ----------
const v1 = {
  v: 1, ts: 1, thr: '2', defRate: '2000', tplLow: 'low', tplDebt: 'debt',
  students: [
    { id: 's1', arch: '0', name: 'Анна Петрова', rate: 2000, contact: '', note: '', bal: 6,
      h: [{ d: '2026-08-20', t: 'init', delta: 6, amt: 0, label: 'Стартовый остаток', note: '' },
          { d: '2026-09-02', t: 'lesson', delta: -1, amt: 0, label: 'Занятие проведено', note: '' },
          { d: '2026-09-10', t: 'pay', delta: 5, amt: 10000, label: 'Оплата', note: '' },
          { d: '2026-09-17', t: 'lesson', delta: -1, amt: 0, label: 'Занятие проведено', note: '' },
          { d: '2026-10-08', t: 'cancel-free', delta: 0, amt: 0, label: 'Отмена, урок сохранён', note: '' }] },
    { id: 's2', arch: '0', name: 'Иван Смирнов', rate: 1900, contact: '', note: '', bal: -5,
      h: [{ d: '2026-08-20', t: 'init', delta: -5, amt: 0, label: 'Стартовый остаток', note: '' }] },
    { id: 's3', arch: '0', name: 'Марк Орлов', rate: 950, contact: '', note: '', bal: 0,
      h: [{ d: '2026-08-20', t: 'init', delta: 0, amt: 0, label: 'Стартовый остаток', note: '' }] }
  ]
};
const S = L.normalize(v1, { today: TODAY });
ok('normalize: версия', S.v, 2);
ok('normalize: балансы как есть', S.students.map((s) => s.bal), [6, -5, 0]);
ok('normalize: история как есть', S.students[0].h.length, 5);
ok('normalize: адреса по умолчанию', S.students[0].emails, []);
ok('normalize: ключевые слова', S.calWords, 'по английскому, Silver Fern');
ok('normalize: мусор', L.normalize('не json'), null);
ok('normalize: строки-числа', L.normalize({ students: [{ 'имя': 'Тимур', 'ставка': '2500', 'остаток': '7' }] }).students[0].bal, 7);
ok('normalize: при импорте история достраивается', L.normalize([{ name: 'Пётр', bal: 3 }], { fillInit: true }).students[0].h.length, 1);
ok('normalize: с сервера пустая история остаётся пустой', L.normalize([{ name: 'Пётр', bal: 3, h: [] }]).students[0].h.length, 0);
ok('normalize: список скрытых адресов', L.normalize({ students: [], ignore: ['A@x.nz', 'мусор'] }).ignore, ['a@x.nz']);

// ---------- начало учёта ----------
ok('старт: по первой записи', L.studentStart(S.students[0], TODAY), '2026-08-20');
ok('старт: since важнее', L.studentStart({ since: '2026-10-01', h: [] }, TODAY), '2026-10-01');
ok('старт: записи из календаря не считаются', L.studentStart({ h: [{ d: '2026-05-01', src: 'cal' }, { d: '2026-08-20', t: 'init' }] }, TODAY), '2026-08-20');
ok('старт: пусто = сегодня', L.studentStart({ h: [] }, TODAY), TODAY);

// ---------- люди из календаря ----------
const A = 'anna.petrova@example.com';
const I = 'smirnov.ivan@example.com';
const M = 'markorlov@example.com';
const K = 'kate.w@example.com';
const events = [
  ev('2026-06-03T19:00:00+12:00', BOOK + ' (Anna Petrova)', [A]),
  ev('2026-07-01T19:00:00+12:00', BOOK + ' (Анна  Петрова )', [A]),
  ev('2026-08-12T19:00:00+12:00', BOOK + ' (Анна Петрова)', [A]),
  ev('2026-09-01T19:00:00+12:00', BOOK + ' (Анна Петрова)', [A]),    // отмечено 2 сен, ±1 день
  ev('2026-09-17T19:00:00+12:00', BOOK + ' (Анна Петрова)', [A]),    // отмечено в тот же день
  ev('2026-09-24T19:00:00+12:00', BOOK + ' (Анна Петрова)', [A]),    // не отмечено
  ev('2026-10-08T19:00:00+13:00', BOOK + ' (Анна Петрова)', [A]),    // отмена без списания
  ev('2026-10-16T19:00:00+13:00', BOOK + ' (Анна Петрова)', [A]),    // будущее
  ev('2026-07-10T19:00:00+12:00', BOOK + ' (Ivan Smirnov)', [I]),
  ev('2026-07-17T19:00:00+12:00', BOOK + ' (Ivan Smirnoff)', [I]),
  ev('2026-07-24T19:00:00+12:00', 'Kiwi Group', [M, 'o.k@example.com']),
  ev('2026-07-31T19:00:00+12:00', 'Kiwi Group', [M, 'o.k@example.com']),
  ev('2026-09-05T19:00:00+12:00', 'Kiwi Group', [M, 'o.k@example.com']),
  ev('2026-05-27T11:00:00+12:00', BOOK + ' (Kate Wilson)', [K]),
  ev('2026-06-10T11:00:00+12:00', BOOK + ' (Kate Wilson)', ['kate.w@example.con'])
];
const people = L.groupPeople(events);
const byEmail = (e) => people.find((p) => p.emails.indexOf(e) > -1);
ok('люди: всего', people.length, 5);
ok('люди: один адрес, два написания имени', byEmail(I).names.length, 2);
ok('люди: опечатка в адресе склеена по имени', byEmail(K).emails.length, 2);
ok('люди: у Анны уроков', byEmail(A).count, 8);
ok('люди: группа даёт двух людей', [byEmail(M).count, byEmail('o.k@example.com').count], [3, 3]);
ok('люди: у группы видно название', byEmail(M).titles, ['Kiwi Group']);

// ---------- подсказки ----------
ok('подсказка: по транслиту имени', L.suggest(byEmail(A), S.students), 's1');
ok('подсказка: Smirnov ↔ Смирнов', L.suggest(byEmail(I), S.students), 's2');
ok('подсказка: фамилия внутри адреса', L.suggest(byEmail(M), S.students), 's3');
ok('подсказка: нет пары', L.suggest(byEmail('o.k@example.com'), S.students), null);
ok('подсказка: по адресу ученика', L.suggest(byEmail(K), [{ id: 'x', name: 'Кто-то', emails: [K] }]), 'x');
ok('sameName: Dmitrii ↔ Дмитрий', L.sameName('Dmitrii Lazarev', 'Дмитрий Лазарев'), true);
ok('sameName: разные люди', L.sameName('Анна Петрова', 'Анна Сидорова'), false);

// ---------- сопоставление ----------
const anna = Object.assign({}, S.students[0], { emails: [A] });
const r = L.pairEvents(anna, L.eventsFor(anna, events), { now: NOW, today: TODAY });
ok('пары: до старта учёта', r.before.length, 3);
ok('пары: отмеченные (включая отмену)', r.paired.length, 3);
ok('пары: нечёткие все', r.paired.every((p) => p.fuzzy), true);
ok('пары: не отмечено', r.unmarked.map((e) => L.localDate(e.start)), ['2026-09-24']);
ok('пары: будущее', r.future.length, 1);
const dism = L.pairEvents(anna, L.eventsFor(anna, events), { now: NOW, today: TODAY, dismissed: { [r.unmarked[0].key + '|s1']: 1 } });
ok('пары: «не было» убирает из неотмеченных', dism.unmarked.length, 0);
// Будущее событие не забирает сегодняшнюю отметку без ключа.
const fut = L.pairEvents({ id: 'z', emails: [A], h: [{ d: TODAY, t: 'lesson', delta: -1 }] },
  [ev('2026-10-15T19:00:00+13:00', BOOK, [A])], { now: NOW, today: '2026-10-01' });
ok('пары: будущее без нечёткого совпадения', [fut.future.length, fut.paired.length], [1, 0]);

// ---------- импорт ----------
const mapping = {};
mapping[byEmail(A).id] = { sid: 's1' };
mapping[byEmail(I).id] = { sid: 's2' };
mapping[byEmail(M).id] = { sid: 's3' };
mapping[byEmail('o.k@example.com').id] = { create: { name: 'Ольга К.', rate: 950 } };
mapping[byEmail(K).id] = { create: { name: 'Kate Wilson', rate: 2500, arch: true } };
const balBefore = S.students.map((s) => s.bal);
const sumDelta = (st) => st.h.reduce((a, e) => a + e.delta, 0);
const deltaBefore = S.students.map(sumDelta);
const plan = L.planImport(S, events, people, mapping, { now: NOW, today: TODAY });
ok('план: добавить всего', plan.add, 3 + 2 + 2 + 3 + 2);
ok('план: связать', plan.link, 3);
ok('план: не отмечено', plan.unmarked, 2);
const S2 = L.applyImport(S, plan, (i) => 'new' + i);
ok('импорт: балансы не изменились', S2.students.slice(0, 3).map((s) => s.bal), balBefore);
ok('импорт: сумма списаний не изменилась', S2.students.slice(0, 3).map(sumDelta), deltaBefore);
ok('импорт: исходное состояние не тронуто', S.students[0].h.length, 5);
const a2 = S2.students[0];
ok('импорт: история Анны', a2.h.length, 5 + 3);
ok('импорт: календарные записи впереди и по дате', a2.h.slice(0, 3).map((e) => e.d), ['2026-06-03', '2026-07-01', '2026-08-12']);
ok('импорт: календарные с нулевым списанием', a2.h.slice(0, 3).every((e) => e.delta === 0 && e.src === 'cal' && e.t === 'lesson'), true);
ok('импорт: последняя запись прежняя', a2.h[a2.h.length - 1].t, 'cancel-free');
ok('импорт: отметки связаны с событиями', a2.h.filter((e) => e.ev && e.src !== 'cal').length, 3);
ok('импорт: адрес записан ученику', a2.emails, [A]);
ok('импорт: группа на двоих, у Марка до старта', S2.students[2].h.filter((e) => e.src === 'cal').length, 2);
ok('импорт: события группы после старта у Марка не отмечены', plan.students.find((p) => p.sid === 's3').unmarked, 1);
const olga = S2.students.find((s) => s.name === 'Ольга К.');
ok('импорт: новый ученик создан с нулём', [olga.bal, olga.rate, olga.since, olga.h.length], [0, 950, TODAY, 3]);
const kate = S2.students.find((s) => s.name === 'Kate Wilson');
ok('импорт: новый в архиве', kate.arch, '1');
ok('импорт: адреса с опечаткой', kate.emails.length, 2);
const plan2 = L.planImport(S2, events, L.groupPeople(events),
  (() => { const m = {}; L.groupPeople(events).forEach((p) => { const sid = L.suggest(p, S2.students); m[p.id] = sid ? { sid } : { skip: true }; }); return m; })(),
  { now: NOW, today: TODAY });
ok('повторный импорт: нечего добавлять', [plan2.add, plan2.link], [0, 0]);
const excl = {};
excl[events[0].key] = true;
const plan3 = L.planImport(S, events, people, mapping, { now: NOW, today: TODAY, excluded: excl });
ok('импорт: снятое галочкой не добавляется', plan3.students.find((p) => p.sid === 's1').add.length, 2);

// ---------- конспекты ----------
const notes = [
  { id: 'g1', start: '2026-09-17T06:05:00.000Z', date: '2026-09-17', title: BOOK + ' (Анна Петрова)', emails: [A], student: 'Анна Петрова', summary: '# Тема' },
  { id: 'g2', start: '', date: '2026-09-02', title: 'Урок с Анной', emails: [], student: 'Анна Петрова', summary: 'x' },
  { id: 'g3', start: '2026-09-17T06:05:00.000Z', date: '2026-09-17', title: 'другое', emails: [K], student: '', summary: 'y' }
];
const an = L.notesFor(a2, notes);
ok('конспекты: по адресу и по имени', an.map((x) => x.id), ['g1', 'g2']);
const lesson917 = a2.h.find((e) => e.d === '2026-09-17');
ok('конспект урока по времени', (L.noteForEntry(lesson917, an) || {}).id, 'g1');
ok('конспект урока по дате', (L.noteForEntry(a2.h.find((e) => e.d === '2026-09-02'), an) || {}).id, 'g2');
ok('у оплаты конспекта нет', L.noteForEntry({ t: 'pay', d: '2026-09-17' }, an), null);

// ---------- суммы по месяцам ----------
const ms = L.monthSeries(S2, '2026-06', '2026-10');
ok('месяцы: подряд', ms.map((m) => m.ym), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
const sep = ms.find((m) => m.ym === '2026-09');
// Анна: 2 и 17 сентября; Ольга (новая): групповой урок 5 сентября по 950.
ok('месяцы: сентябрь уроков', sep.lessons, 3);
ok('месяцы: сентябрь проведено на сумму', sep.earned, 2 * 2000 + 950);
ok('месяцы: сентябрь получено', sep.paid, 10000);
ok('месяцы: октябрь отмен без списания', ms[4].free, 1);
ok('месяцы: первый месяц данных', L.firstYm(S2), '2026-05');

// ---------- markdown ----------
ok('md: экранирует', L.md('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
ok('md: заголовок и список', L.md('# Тема\n- **слово**\n  - вложенный'), '<h4>Тема</h4><ul><li><b>слово</b></li><ul><li>вложенный</li></ul></ul>');
ok('md: ссылка только http', L.md('[a](javascript:alert(1)) [b](https://x.nz)'), '<p>[a](javascript:alert(1)) <a href="https://x.nz" target="_blank" rel="noopener noreferrer">b</a></p>');

console.log(failed ? '\nПРОВАЛЕНО: ' + failed : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
