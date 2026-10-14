// Apps Script нельзя запустить вне Google, поэтому гоняем google/Code.gs в песочнице
// Node с поддельными CalendarApp, SpreadsheetApp, DriveApp и остальными сервисами.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failed = 0;
const ok = (n, got, exp) => {
  const p = JSON.stringify(got) === JSON.stringify(exp);
  if (!p) failed++;
  console.log((p ? 'PASS' : 'FAIL') + '  ' + n + '  got=' + JSON.stringify(got) + (p ? '' : ' exp=' + JSON.stringify(exp)));
};

const ME = 'teacher@example.com';
const props = new Map();
const mkEvent = (o) => ({
  isAllDayEvent: () => !!o.allDay,
  getTitle: () => o.title,
  getStartTime: () => new Date(o.start),
  getEndTime: () => new Date(new Date(o.start).getTime() + 45 * 60e3),
  getId: () => o.id,
  getGuestList: () => (o.guests || []).map((e) => ({ getEmail: () => e })),
  getDescription: () => o.desc || ''
});
const E = {
  a: { id: 'a@google.com', title: 'Записаться на сессию встречу по английскому (Anna Petrova)', start: '2026-10-15T06:05:00Z', guests: [ME, 'Anna@Example.com'],
    desc: '<b>Booked by</b>\nAnna Petrova\nanna@example.com\n+64 21 000 000\n<br>' },
  dup: { id: 'a@google.com', title: 'Записаться на сессию встречу по английскому (Anna Petrova)', start: '2026-10-15T06:05:00Z', guests: [ME, 'anna@example.com'] },
  grp: { id: 'g@google.com', title: 'Kiwi Group', start: '2026-10-16T06:00:00Z', guests: ['mytime@group.calendar.google.com', 'm@example.com', 'o@example.com'] },
  booked: { id: 'b@google.com', title: 'Записаться на сессию встречу по английскому (Ivan)', start: '2026-10-14T07:00:00Z', guests: [],
    desc: 'Booked by\nIvan\nivan@example.com' },
  other: { id: 'x@google.com', title: 'Стоматолог', start: '2026-10-15T01:00:00Z', desc: 'урок по английскому перенесли' },
  allday: { id: 'd@google.com', title: 'Каникулы по английскому', start: '2026-10-15T00:00:00Z', allDay: true }
};
const calendars = [
  { name: 'primary', list: [E.a, E.booked, E.other, E.allday] },
  { name: 'MY TIME', list: [E.dup, E.grp] }
].map((c) => ({
  getEvents: (from, to, opts) => c.list
    .filter((o) => new Date(o.start) >= from && new Date(o.start) < to)
    .filter((o) => !opts || !opts.search || (o.title + ' ' + (o.desc || '')).toLowerCase().indexOf(opts.search.toLowerCase()) > -1)
    .map(mkEvent)
}));

function sheet(rows) {
  return {
    rows,
    getLastRow: () => rows.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => rows.slice(r - 1, r - 1 + nr).map((row) => {
        const out = row.slice(c - 1, c - 1 + nc);
        while (out.length < nc) out.push('');
        return out;
      }),
      setValue: (v) => { rows[r - 1][c - 1] = v; }
    })
  };
}
const sheets = {
  'Конспекты': sheet([
    ['id Granola', 'Начало', 'Дата', 'Название', 'Email', 'Ученик', 'Конспект', 'Ссылка', 'Добавлено'],
    ['n1', new Date('2026-10-13T06:05:00Z'), '2026-10-13', 'Урок', 'anna@example.com, m@example.com', 'Anna', '# Тема', 'https://notes.granola.ai/d/n1', new Date('2026-10-13T10:00:00Z')],
    ['n0', '2026-09-01T07:00:00Z', '', 'Старый урок', '', 'Ivan', 'x', '', ''],
    ['', '', '', '', '', '', '', '', '']
  ]),
  'Посты': sheet([
    ['id', 'Создан', 'Неделя', 'Заголовок', 'Слайды', 'Подпись', 'Хэштеги', 'Статус', 'Даты'],
    ['p1', '2026-10-05T00:00:00Z', '2026-W40', 'Первый', 's', 'c', '#a', 'черновик', ''],
    ['p2', '2026-10-12T00:00:00Z', '2026-W41', 'Второй', 's', 'c', '#b', '', '']
  ])
};
const files = [];
const folder = {
  getId: () => 'F1', getUrl: () => 'https://drive.google.com/drive/folders/F1',
  getFilesByName: (name) => { const l = files.filter((f) => f.name === name && !f.trashed); let i = 0; return { hasNext: () => i < l.length, next: () => api(l[i++]) }; },
  getFiles: () => { const l = files.filter((f) => !f.trashed); let i = 0; return { hasNext: () => i < l.length, next: () => api(l[i++]) }; },
  createFile: (name, data) => { const f = { name, data }; files.push(f); return api(f); }
};
function api(f) { return { getName: () => f.name, setContent: (d) => { f.data = d; }, setTrashed: (t) => { f.trashed = t; } }; }

const ctx = {
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, v), deleteProperty: (k) => props.delete(k) }) },
  CalendarApp: { getAllOwnedCalendars: () => calendars },
  Session: { getEffectiveUser: () => ({ getEmail: () => ME }), getScriptTimeZone: () => 'Pacific/Auckland' },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null, getUrl: () => 'https://docs.google.com/spreadsheets/d/S1', getId: () => 'S1' }) },
  DriveApp: {
    getFolderById: (id) => { if (id !== 'F1') throw new Error('nope'); return folder; },
    getFoldersByName: () => ({ hasNext: () => false }),
    createFolder: () => folder
  },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }) },
  Utilities: {
    getUuid: () => '1234-5678-' + Math.random().toString(16).slice(2),
    formatDate: (d) => new Date(d.getTime() + 13 * 3600e3).toISOString().slice(0, 10)
  },
  Logger: { log: () => {} }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'google', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });

const get = (p) => JSON.parse(ctx.doGet({ parameter: p }).body);
const post = (p, q) => JSON.parse(ctx.doPost({ parameter: q || {}, postData: { contents: JSON.stringify(p) } }).body);

ok('без токена', get({ action: 'ping' }).error, 'token-not-set');
ctx.setup();
const T = props.get('TOKEN');
ok('setup создал токен', typeof T === 'string' && T.length > 20, true);
ok('setup запомнил таблицу', props.get('SHEET_ID'), 'S1');
ok('чужой токен', get({ action: 'ping', token: 'x' }).error, 'forbidden');
ok('ping', get({ action: 'ping', token: T }).me, ME);
ok('неизвестное действие', get({ action: 'drop', token: T }).error, 'unknown-action');

const evs = get({ action: 'events', token: T, from: '2026-10-13T00:00:00Z', to: '2026-10-20T00:00:00Z', q: 'по английскому, Kiwi Group' });
ok('события: дубли из двух календарей склеены, лишние отброшены', evs.events.map((e) => e.key.split('|')[0]), ['b@google.com', 'a@google.com', 'g@google.com']);
ok('события: адрес из «Booked by»', evs.events[0].emails, ['ivan@example.com']);
ok('события: без себя, в нижнем регистре, без дублей', evs.events[1].emails, ['anna@example.com']);
ok('события: адрес календаря-организатора отброшен', evs.events[2].emails, ['m@example.com', 'o@example.com']);
ok('события: описание наружу не отдаётся', Object.keys(evs.events[1]).sort(), ['emails', 'end', 'key', 'start', 'title']);
ok('события: пустой список слов', get({ action: 'events', token: T, from: '2026-10-13', to: '2026-10-20', q: ' ' }).message, 'no-keywords');
ok('события: слишком длинный период', get({ action: 'events', token: T, from: '2025-01-01', to: '2026-10-20', q: 'x' }).message, 'range-too-long');

const nt = get({ action: 'notes', token: T });
ok('конспекты: пустые строки пропущены', nt.notes.map((x) => x.id), ['n1', 'n0']);
ok('конспекты: адреса списком', nt.notes[0].emails, ['anna@example.com', 'm@example.com']);
ok('конспекты: дата из ISO, если колонка пуста', nt.notes[1].date, '2026-09-01');
ok('конспекты: since', get({ action: 'notes', token: T, since: '2026-10-01' }).notes.length, 1);

const ps = get({ action: 'posts', token: T });
ok('посты: свежие первыми', ps.posts.map((x) => x.id), ['p2', 'p1']);
ok('посты: статус по умолчанию', ps.posts[0].status, 'черновик');
ok('статус: меняется', post({ action: 'post-status', token: T, id: 'p1', status: 'опубликован' }).ok, true);
ok('статус: записан в таблицу', sheets['Посты'].rows[1][7], 'опубликован');
ok('статус: чужое значение', post({ action: 'post-status', token: T, id: 'p1', status: 'удалить' }).message, 'bad-status');
ok('статус: токен в теле запроса', post({ action: 'post-status', id: 'p1', status: 'черновик' }, {}).error, 'forbidden');

const snap = JSON.stringify({ v: 2, students: [{ id: 's1', bal: 3, h: [] }] });
ok('копия: создана', post({ action: 'backup', token: T, date: '2026-10-14', data: snap }).name, 'uroki-2026-10-14.json');
post({ action: 'backup', token: T, date: '2026-10-14', data: JSON.stringify({ v: 2, students: [] }) });
ok('копия: тот же день перезаписан', files.filter((f) => !f.trashed).length, 1);
ok('копия: битые данные отклонены', post({ action: 'backup', token: T, date: '2026-10-15', data: '{"x":1}' }).message, 'bad-data');
ok('копия: неверная дата', post({ action: 'backup', token: T, date: '14.10.2026', data: snap }).message, 'bad-date');
vm.runInContext('BACKUP_KEEP = 3', ctx);
['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].forEach((d) => post({ action: 'backup', token: T, date: d, data: snap }));
ok('копия: старые уходят в корзину', files.filter((f) => !f.trashed).map((f) => f.name).sort(), ['uroki-2026-10-12.json', 'uroki-2026-10-13.json', 'uroki-2026-10-14.json']);

console.log(failed ? '\nПРОВАЛЕНО: ' + failed : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
