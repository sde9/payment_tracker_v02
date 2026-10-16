// Календарь, импорт истории, конспекты, обзор, посты и резервные копии целиком:
// настоящие обработчики api/*.js, поддельные Upstash и Apps Script, настоящий браузер.
// Все имена и адреса вымышленные.
process.env.TZ = 'Pacific/Auckland';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const L = require('../src/lib.js');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS_DIR || '';
process.env.KV_REST_API_URL = 'http://fake-upstash.local';
process.env.KV_REST_API_TOKEN = 'test-token';
process.env.GOOGLE_SCRIPT_URL = 'https://script.fake/macros/s/TEST/exec';
process.env.GOOGLE_SCRIPT_TOKEN = 'gas-secret';
delete process.env.APP_PASSWORD;
process.env.ALLOW_OPEN_GOOGLE = '1';

const TODAY = L.localDate(new Date());
const at = (days, hh, mm) => { const p = L.addDays(TODAY, days).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], hh, mm || 0).toISOString(); };
const BOOK = 'Записаться на сессию встречу по английскому';
const ANNA = 'anna.petrova@example.com', MARK = 'markorlov@example.com', OLGA = 'olga.k@example.com', KATE = 'kate.w@example.com';
const EVENTS = [
  { key: 'e1@google.com|' + at(-90, 19), title: BOOK + ' (Anna Petrova)', start: at(-90, 19), end: at(-90, 19, 45), emails: [ANNA] },
  { key: 'e2@google.com|' + at(-14, 19), title: BOOK + ' (Anna Petrova)', start: at(-14, 19), end: at(-14, 19, 45), emails: [ANNA] },
  { key: 'e3@google.com|' + at(-7, 19), title: BOOK + ' (Anna Petrova)', start: at(-7, 19), end: at(-7, 19, 45), emails: [ANNA] },
  { key: 'e4@google.com|' + at(2, 19), title: BOOK + ' (Anna Petrova)', start: at(2, 19), end: at(2, 19, 45), emails: [ANNA] },
  { key: 'g@google.com|' + at(-80, 18), title: 'Kiwi Group', start: at(-80, 18), end: at(-80, 18, 45), emails: [MARK, OLGA] },
  { key: 'g@google.com|' + at(-3, 18), title: 'Kiwi Group', start: at(-3, 18), end: at(-3, 18, 45), emails: [MARK, OLGA] },
  { key: 'g@google.com|' + at(3, 18), title: 'Kiwi Group', start: at(3, 18), end: at(3, 18, 45), emails: [MARK, OLGA] },
  { key: 'k@google.com|' + at(-100, 11), title: BOOK + ' (Kate Wilson)', start: at(-100, 11), end: at(-100, 11, 45), emails: [KATE] }
];
const NOTES = [{ id: 'n2', start: at(-14, 19), date: L.addDays(TODAY, -14), title: BOOK + ' (Anna Petrova)', emails: [ANNA], student: 'Anna Petrova',
  summary: '# Погода\n- **drizzle**: морось\n  - downpour: ливень\n<script>x</script>', url: 'https://notes.granola.ai/d/n2', added: at(-14, 23) }];
const POSTS = [
  { id: 'p2', created: at(-1, 10), week: '2026-W41', title: 'Drizzle или downpour', slides: 'Слайд 1\n\nСлайд 2', caption: 'Подпись про дождь', hashtags: '#english', status: 'черновик', dates: '' },
  { id: 'p1', created: at(-8, 10), week: '2026-W40', title: 'Zed или zee', slides: 'Один', caption: 'Про букву Z', hashtags: '#nz', status: 'опубликован', dates: '' }
];
const gasLog = [];

// ---------- поддельные Upstash и Apps Script ----------
const store = new Map();
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith('http://fake-upstash.local')) {
    const [cmd, key, value] = JSON.parse(opts.body);
    let result = null;
    if (cmd === 'GET') result = store.has(key) ? store.get(key) : null;
    else if (cmd === 'SET') { store.set(key, value); result = 'OK'; }
    else if (cmd === 'DEL') result = store.delete(key) ? 1 : 0;
    else if (cmd === 'INCR') { const n = Number(store.get(key) || 0) + 1; store.set(key, String(n)); result = n; }
    else if (cmd === 'EXPIRE') result = 1;
    return { ok: true, text: async () => JSON.stringify({ result }) };
  }
  if (u.startsWith('https://script.fake/')) {
    const q = Object.fromEntries(new URL(u).searchParams);
    const p = Object.assign({}, q, opts && opts.body ? JSON.parse(opts.body) : {});
    gasLog.push(p.action);
    let out;
    if (p.token !== 'gas-secret') out = { error: 'forbidden' };
    else if (p.action === 'events') {
      const from = new Date(p.from), to = new Date(p.to);
      out = { me: 'teacher@example.com', events: EVENTS.filter((e) => new Date(e.start) >= from && new Date(e.start) < to) };
    } else if (p.action === 'notes') out = { notes: NOTES };
    else if (p.action === 'posts') out = { posts: POSTS };
    else if (p.action === 'post-status') { const x = POSTS.find((y) => y.id === p.id); x.status = p.status; out = { ok: true }; }
    else if (p.action === 'backup') { gasLog.push('backup:' + p.date + ':' + JSON.parse(p.data).students.length); out = { ok: true, name: 'uroki-' + p.date + '.json', folder: 'https://drive.google.com/x' }; }
    else out = { error: 'unknown-action' };
    return { ok: true, text: async () => JSON.stringify(out) };
  }
  return realFetch(url, opts);
};

const handlers = {
  '/api/state': require('../api/state.js'),
  '/api/session': require('../api/session.js'),
  '/api/google': require('../api/google.js'),
  '/api/backup': require('../api/backup.js')
};
function shim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  return res;
}
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (handlers[url]) return handlers[url](req, shim(res));
  const file = path.join(ROOT, 'public', url === '/' ? 'index.html' : url);
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
});

// Стартовое состояние в формате старой версии: учёт начат 60 дней назад.
const START = L.addDays(TODAY, -60);
const mk = (id, name, rate, bal, h) => ({ id, arch: '0', name, rate, contact: '', note: '', bal, h });
store.set('uroki:state', JSON.stringify({ v: 1, ts: 1, thr: '2', defRate: '2000', tplLow: 'low {имя}', tplDebt: 'debt {имя}', students: [
  mk('s1', 'Анна Петрова', 2000, 6, [
    { d: START, t: 'init', delta: 6, amt: 0, label: 'Стартовый остаток', note: '' },
    { d: L.addDays(TODAY, -13), t: 'lesson', delta: -1, amt: 0, label: 'Занятие проведено', note: '' },
    { d: L.addDays(TODAY, -10), t: 'pay', delta: 1, amt: 2000, label: 'Оплата', note: '' }]),
  mk('s2', 'Марк Орлов', 950, 0, [{ d: START, t: 'init', delta: 0, amt: 0, label: 'Стартовый остаток', note: '' }]),
  mk('s3', 'Нина Захарова', 2000, -5, [{ d: START, t: 'init', delta: -5, amt: 0, label: 'Стартовый остаток', note: '' }])
] }));

let failed = 0;
const norm = (v) => (typeof v === 'string' ? v.replace(/[  ]/g, ' ') : v);
const ok = (n, got, exp) => {
  const p = JSON.stringify(norm(got)) === JSON.stringify(norm(exp));
  if (!p) failed++;
  const shown = typeof got === 'string' && got.length > 90 ? got.slice(0, 90) + '…' : got;
  console.log((p ? 'PASS' : 'FAIL') + '  ' + n + '  got=' + JSON.stringify(shown) + (p ? '' : ' exp=' + JSON.stringify(exp)));
};
const saved = () => JSON.parse(store.get('uroki:state'));
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext({ timezoneId: 'Pacific/Auckland', viewport: { width: 1100, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message)));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_TUNNEL|ERR_NAME|net::/.test(m.text())) errs.push(m.text()); });

  await p.goto(base);
  await p.waitForFunction(() => document.querySelector('#chip').textContent.indexOf('сервер') > -1, null, { timeout: 8000 });
  await p.waitForSelector('#week:not([hidden]) .dayg', { timeout: 8000 });
  ok('старые балансы прочитаны как есть', await p.$$eval('#rows .row .bal-n', (n) => n.map((x) => x.textContent)), ['6', '0', '−5']);
  ok('неделя: два урока не привязаны', await p.$$eval('#week [data-act="link"]', (n) => n.length), 2);
  ok('неотмеченных пока нет (адресов у учеников нет)', await p.$eval('#unmarked', (e) => e.hidden), true);
  ok('статус Google в настройках', (await p.$eval('#gStatus', (e) => e.textContent)).indexOf('Google подключён') === 0, true);
  await shot(p, '01-main-before');

  // ---------- привязка адреса из события ----------
  await p.click('#week .evr:has-text("Anna Petrova") [data-act="link"]');
  await p.waitForSelector('#dlgLink[open]');
  ok('привязка: подсказан ученик по имени', await p.$eval('#linkBody select', (e) => e.value), 's:s1');
  await p.click('#dlgLink [data-act="link-ok"]');
  await p.waitForTimeout(300);
  ok('привязка: адрес у ученика', await p.$eval('.row[data-id="s1"] .emails', (e) => e.textContent), ANNA);
  ok('привязка: следующий урок в карточке', (await p.$eval('.row[data-id="s1"] .nx', (e) => e.textContent)).indexOf('Следующий урок:') === 0, true);
  ok('неотмеченные: прошедший урок без отметки', await p.$$eval('#unmarked .evr', (n) => n.length), 1);
  ok('отметка за день до урока нашла свой урок', await p.$eval('.row[data-id="s1"]', (e) => e.dataset.state), 'ok');

  // ---------- импорт истории ----------
  await p.click('#settings > summary');
  await p.click('[data-act="cal-import"]');
  await p.waitForSelector('#dlgImport[open]');
  await p.fill('#impFrom', L.addDays(TODAY, -120));
  await p.click('[data-act="imp-find"]');
  await p.waitForSelector('#impBody .person', { timeout: 8000 });
  ok('импорт: людей найдено', await p.$$eval('#impBody .person', (n) => n.length), 4);
  const sel = await p.$$eval('#impBody .person', (n) => n.map((x) => x.querySelector('select').value));
  ok('импорт: Анна и Марк узнаны, Ольга и Катя новые', sel.slice().sort(), ['new', 'new', 's:s1', 's:s2']);
  ok('импорт: давний новый ученик уходит в архив', await p.$eval('#impBody .person:has-text("Kate") [data-imp="arch"]', (e) => e.checked), true);
  const planTxt = await p.$eval('#impPlan', (e) => e.textContent);
  ok('импорт: в плане сказано про балансы', planTxt.indexOf('Балансы не изменятся') > -1, true);
  await shot(p, '02-import');
  await p.click('#impOk');
  await p.waitForTimeout(1500);
  ok('импорт: балансы на экране', await p.$$eval('#rows .row:not([data-arch="1"]) .bal-n', (n) => n.map((x) => x.textContent)), ['6', '0', '−5', '0']);
  const st1 = saved();
  ok('импорт: балансы в хранилище', st1.students.map((s) => s.bal), [6, 0, -5, 0, 0]);
  const anna = st1.students[0];
  ok('импорт: у Анны урок до старта с нулевым списанием', anna.h.filter((e) => e.src === 'cal').map((e) => [e.d, e.delta]), [[L.addDays(TODAY, -90), 0]]);
  ok('импорт: старая отметка связана с событием', anna.h.find((e) => e.d === L.addDays(TODAY, -13)).ev, EVENTS[1].key);
  ok('импорт: последняя запись Анны по-прежнему оплата', anna.h[anna.h.length - 1].t, 'pay');
  ok('импорт: Марку групповой урок до старта', st1.students[1].h.filter((e) => e.src === 'cal').length, 1);
  const olga = st1.students.find((s) => s.emails.indexOf(OLGA) > -1);
  ok('импорт: Ольга создана с уроками в истории', [olga.bal, olga.h.length, olga.arch], [0, 2, '0']);
  ok('импорт: Катя в архиве', st1.students.find((s) => s.emails.indexOf(KATE) > -1).arch, '1');

  // ---------- отметки из календаря ----------
  ok('неотмеченные: Анна и Марк', await p.$$eval('#unmarked .evr b', (n) => n.map((x) => x.textContent).sort()), ['Анна Петрова', 'Марк Орлов']);
  await shot(p, '03-main-after-import');
  await p.click('#unmarked .evr[data-sid="s1"] [data-act="ev-lesson"]');
  await p.waitForTimeout(300);
  ok('Провёл из календаря: баланс −1', await p.$eval('.row[data-id="s1"] .bal-n', (e) => e.textContent), '5');
  await p.click('#unmarked .evr[data-sid="s2"] [data-act="ev-skip"]');
  await p.waitForTimeout(300);
  ok('«Не было» убирает из списка', await p.$eval('#unmarked', (e) => e.hidden), true);
  ok('«Не было» не трогает баланс', await p.$eval('.row[data-id="s2"] .bal-n', (e) => e.textContent), '0');
  await p.click('#week .evr[data-sid="s1"] [data-act="ev-cancel"]');
  await p.waitForSelector('#dlgCancel[open]');
  ok('отмена: подсказка про 6 часов со временем урока', (await p.$eval('#cxInfo', (e) => e.textContent)).indexOf('Если ученик предупредил до 13:00') > -1, true);
  await p.click('#dlgCancel [data-act="cx-free"]');
  await p.waitForTimeout(300);
  ok('отмена заранее: баланс прежний', await p.$eval('.row[data-id="s1"] .bal-n', (e) => e.textContent), '5');
  ok('отмена заранее: видно в неделе', await p.$eval('#week .evr[data-sid="s1"] .mark', (e) => e.textContent), 'отмена, сохранён');
  ok('следующий урок Анны пропал (отменён)', await p.$eval('.row[data-id="s1"] .nx', (e) => e.textContent), '');
  await p.waitForTimeout(1200);
  const st2 = saved();
  const evd = st2.students[0].h.filter((e) => e.ev && e.src !== 'cal').map((e) => [e.t, e.ev]);
  ok('в хранилище отметки с ключом события', evd, [['lesson', EVENTS[1].key], ['lesson', EVENTS[2].key], ['cancel-free', EVENTS[3].key]]);
  ok('в хранилище «не было»', Object.keys(st2.dismissed), [EVENTS[5].key + '|s2']);

  // ---------- конспекты ----------
  await p.click('.row[data-id="s1"] .hist summary');
  await p.waitForTimeout(150);
  ok('конспект у урока', await p.$$eval('.row[data-id="s1"] .h .nt', (n) => n.length), 1);
  ok('последние конспекты', await p.$$eval('.row[data-id="s1"] .lastnotes .nt', (n) => n.length), 1);
  await p.click('.row[data-id="s1"] .h .nt summary');
  ok('конспект: заголовок и вложенный список', await p.$eval('.row[data-id="s1"] .h .nt .md', (e) => [e.querySelectorAll('h4').length, e.querySelectorAll('ul ul').length, e.querySelectorAll('script').length]), [1, 1, 0]);
  ok('конспект: ссылка в Granola', await p.$eval('.row[data-id="s1"] .h .nt .md a', (e) => e.href), 'https://notes.granola.ai/d/n2');
  await shot(p, '04-history-note');

  // ---------- копии ----------
  ok('копия за день на сервере', store.has('uroki:day:' + TODAY) && JSON.parse(store.get('uroki:days')).indexOf(TODAY) > -1, true);
  ok('копия в Drive отправлена один раз', gasLog.filter((x) => String(x).indexOf('backup:') === 0).length, 1);
  await p.waitForFunction(() => document.querySelector('#daySel option') && document.querySelector('#daySel option').value, null, { timeout: 5000 });
  ok('список копий в настройках', await p.$eval('#daySel', (e) => e.options[0].textContent), 'сегодня');
  ok('статус Drive', (await p.$eval('#driveStatus', (e) => e.textContent)).indexOf('Копия в Google Drive') === 0, true);

  // ---------- обзор ----------
  await p.click('[data-tab="dash"]');
  await p.waitForSelector('#v-dash .kpi');
  ok('обзор: пять показателей', await p.$$eval('#v-dash .kpi', (n) => n.length), 5);
  ok('обзор: два графика', await p.$$eval('#v-dash svg', (n) => n.length), 2);
  ok('обзор: долг', await p.$eval('#v-dash .kpi:nth-child(5) b', (e) => e.textContent), '10 000 ₽');
  await p.locator('#v-dash .chart').first().locator('.hit').last().hover();
  ok('обзор: подсказка при наведении', await p.$eval('#tip', (e) => !e.hidden && e.textContent.indexOf('Проведено на') > -1), true);
  ok('обзор: таблица под графиком', await p.$$eval('#v-dash .tview tbody tr', (n) => n.length) >= 1, true);
  await shot(p, '05-dash');

  // ---------- посты ----------
  await p.click('[data-tab="posts"]');
  await p.waitForSelector('#v-posts .post');
  ok('посты: карточки', await p.$$eval('#v-posts .post h3', (n) => n.map((x) => x.textContent)), ['Drizzle или downpour', 'Zed или zee']);
  ok('посты: слайды раздельно', await p.$$eval('#v-posts .post:first-child .slides li', (n) => n.length), 2);
  await p.click('#v-posts .post:first-child [data-act="post-copy-cap"]');
  await p.waitForTimeout(200);
  ok('посты: подпись с хэштегами в буфере', await p.evaluate(() => navigator.clipboard.readText()), 'Подпись про дождь\n\n#english');
  await p.selectOption('#v-posts .post:first-child select', 'опубликован');
  await p.waitForTimeout(400);
  ok('посты: статус ушёл в таблицу', POSTS[0].status, 'опубликован');
  await shot(p, '06-posts');

  // ---------- телефон и тёмная тема ----------
  await p.setViewportSize({ width: 390, height: 900 });
  for (const tab of ['main', 'dash', 'posts']) {
    await p.click('[data-tab="' + tab + '"]');
    await p.waitForTimeout(250);
    ok('телефон без горизонтальной прокрутки: ' + tab, await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    await shot(p, '07-phone-' + tab);
  }
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.setViewportSize({ width: 1100, height: 900 });
  await p.click('[data-tab="dash"]');
  await p.waitForTimeout(250);
  ok('тёмная тема: цвет серии сменился', await p.$eval('#v-dash .viz', (e) => getComputedStyle(e).getPropertyValue('--s1').trim()), '#3987e5');
  await shot(p, '08-dash-dark');
  await p.click('[data-tab="main"]');
  await p.waitForTimeout(200);
  await shot(p, '09-main-dark');

  // ---------- Google не подключён ----------
  const tok = process.env.GOOGLE_SCRIPT_TOKEN;
  delete process.env.GOOGLE_SCRIPT_TOKEN;
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errs.push(String(e.message)));
  await p2.goto(base);
  await p2.waitForFunction(() => document.querySelector('#gStatus').textContent.indexOf('не подключён') > -1, null, { timeout: 8000 });
  ok('без Google: расписание скрыто', await p2.$eval('#week', (e) => e.hidden), true);
  ok('без Google: учёт работает', await p2.$eval('.row[data-id="s1"] .bal-n', (e) => e.textContent), '5');
  process.env.GOOGLE_SCRIPT_TOKEN = tok;

  // ---------- без пароля конспекты не отдаются ----------
  delete process.env.ALLOW_OPEN_GOOGLE;
  ok('без пароля календарь закрыт', await p2.evaluate(async () => (await fetch('/api/google?action=notes')).status), 403);
  process.env.ALLOW_OPEN_GOOGLE = '1';

  console.log('ошибки страницы:', errs.length ? errs : 'нет');
  if (errs.length) failed += errs.length;
  await b.close();
  server.close();
  console.log(failed ? '\nПРОВАЛЕНО: ' + failed : '\nВсе проверки прошли');
  process.exit(failed ? 1 : 0);
})();
