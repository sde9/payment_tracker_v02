// Серверная часть целиком: настоящие обработчики api/state.js и api/session.js
// поверх поддельного Upstash, страница из public/ и настоящий браузер.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
process.env.KV_REST_API_URL = 'http://fake-upstash.local';
process.env.KV_REST_API_TOKEN = 'test-token';
delete process.env.APP_PASSWORD;

// Поддельный Upstash: перехватываем fetch, который делают обработчики.
const store = new Map();
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('http://fake-upstash.local')) {
    const [cmd, key, value] = JSON.parse(opts.body);
    let result = null;
    if (cmd === 'GET') result = store.has(key) ? store.get(key) : null;
    else if (cmd === 'SET') { store.set(key, value); result = 'OK'; }
    else if (cmd === 'DEL') { result = store.delete(key) ? 1 : 0; }
    else if (cmd === 'INCR') { const n = Number(store.get(key) || 0) + 1; store.set(key, String(n)); result = n; }
    else if (cmd === 'EXPIRE') { result = 1; }
    return { ok: true, text: async () => JSON.stringify({ result }) };
  }
  return realFetch(url, opts);
};

const stateHandler = require('../api/state.js');
const sessionHandler = require('../api/session.js');

function shim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  return res;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/state') return stateHandler(req, shim(res));
  if (url === '/api/session') return sessionHandler(req, shim(res));
  const file = path.join(ROOT, 'public', url === '/' ? 'index.html' : url);
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file)) {
    res.statusCode = 404; return res.end('not found');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
});

let failed = 0;
const norm = (v) => (typeof v === 'string' ? v.replace(/[\u00a0\u202f]/g, ' ') : v);
const ok = (n, got, exp) => {
  const p = norm(got) === norm(exp);
  if (!p) failed++;
  const shown = typeof got === 'string' && got.length > 60 ? got.slice(0, 60) + '…' : got;
  console.log((p ? 'PASS' : 'FAIL') + '  ' + n + '  got=' + JSON.stringify(shown) + (p ? '' : ' exp=' + JSON.stringify(exp)));
};
const chip = (p) => p.$eval('#chip', (e) => e.textContent);
const waitChip = (p, needle) =>
  p.waitForFunction((n) => document.querySelector('#chip').textContent.indexOf(n) > -1, needle, { timeout: 8000 });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch();
  const errs = [];

  // ============ хранение, пароль не задан ============
  console.log('--- хранение ---');
  const p = await b.newPage();
  p.on('pageerror', (e) => errs.push(String(e.message)));

  await p.goto(base);
  await waitChip(p, 'сервер');
  ok('индикатор после загрузки', await chip(p), 'сохранено на сервере');
  ok('снимок залит в хранилище', store.has('uroki:state'), true);
  ok('учеников в хранилище', JSON.parse(store.get('uroki:state')).students.length, 5);

  await p.click('.row[data-id="s1"] button[data-act="lesson"]');
  await p.waitForTimeout(1400);
  await p.click('.row[data-id="s5"] button[data-act="pay"]');
  await p.waitForTimeout(200);
  await p.click('#packs button[data-n="10"]');
  await p.click('#dlgPay button[data-act="pay-ok"]');
  await p.waitForTimeout(1400);
  ok('первый баланс в хранилище', JSON.parse(store.get('uroki:state')).students[0].bal, 5);
  ok('пятый баланс в хранилище', JSON.parse(store.get('uroki:state')).students[4].bal, 5);

  const ctx2 = await b.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(base);
  await waitChip(p2, 'сервер');
  ok('другое устройство: первый', await p2.$eval('.row[data-id="s1"] .bal-n', (e) => e.textContent), '5');
  ok('другое устройство: пятый', await p2.$eval('.row[data-id="s5"] .bal-n', (e) => e.textContent), '5');
  ok('другое устройство: сумма', await p2.$eval('.row[data-id="s5"] .bal-m', (e) => e.textContent), '10 000 ₽');
  ok('предыдущий снимок сохранён', store.has('uroki:state:prev'), true);

  const before = store.get('uroki:state');
  const bad = await p.evaluate(async () => {
    const r = await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nope: 1 }) });
    return r.status;
  });
  ok('битый снимок отклонён', bad, 400);
  ok('данные не затёрты', store.get('uroki:state') === before, true);

  await p.route('**/api/state', (route) => route.abort());
  await p.click('.row[data-id="s2"] button[data-act="lesson"]');
  await p.waitForTimeout(1500);
  ok('индикатор при обрыве', await chip(p), 'не сохранилось, проверьте сеть');
  ok('изменение осталось на экране', await p.$eval('.row[data-id="s2"] .bal-n', (e) => e.textContent), '3');
  await p.close();
  await ctx2.close();

  // ============ вход по паролю ============
  console.log('--- вход по паролю ---');
  process.env.APP_PASSWORD = 'ponyclub-2026';
  const snapshotBefore = store.get('uroki:state');

  const ctx3 = await b.newContext();
  const p3 = await ctx3.newPage();
  p3.on('pageerror', (e) => errs.push(String(e.message)));
  await p3.goto(base);
  await p3.waitForSelector('#gate:not([hidden])', { timeout: 8000 });
  ok('гейт показан', await p3.$eval('#gate', (e) => e.hidden), false);
  ok('индикатор в гейте', await chip(p3), 'нужен вход');
  ok('состояние закрыто', await p3.evaluate(async () => (await fetch('/api/state')).status), 401);

  await p3.fill('#gatePw', 'не тот пароль');
  await p3.click('#gateForm button[type="submit"]');
  await p3.waitForFunction(() => !document.querySelector('#gateErr').hidden, null, { timeout: 5000 });
  ok('ошибка на неверном пароле', await p3.$eval('#gateErr', (e) => e.textContent), 'Пароль не подошёл');
  ok('гейт не пропустил', await p3.$eval('#gate', (e) => e.hidden), false);

  await p3.fill('#gatePw', 'ponyclub-2026');
  await p3.click('#gateForm button[type="submit"]');
  await waitChip(p3, 'сервер');
  ok('после входа гейт скрыт', await p3.$eval('#gate', (e) => e.hidden), true);
  ok('данные приехали с сервера', await p3.$eval('.row[data-id="s1"] .bal-n', (e) => e.textContent), '5');
  ok('данные на сервере не пострадали', store.get('uroki:state') === snapshotBefore, true);
  ok('кнопка выхода видна', await p3.$eval('[data-act="logout"]', (e) => e.hidden), false);

  await p3.reload();
  await waitChip(p3, 'сервер');
  ok('сессия пережила перезагрузку', await p3.$eval('#gate', (e) => e.hidden), true);

  // Смена пароля должна разлогинивать: ключ подписи выводится из пароля.
  process.env.APP_PASSWORD = 'другой-пароль';
  ok('старая кука после смены пароля', await p3.evaluate(async () => (await fetch('/api/state')).status), 401);
  process.env.APP_PASSWORD = 'ponyclub-2026';

  // Выход.
  await p3.click('.settings > summary');
  await p3.click('[data-act="logout"]');
  await p3.waitForSelector('#gate:not([hidden])', { timeout: 8000 });
  ok('после выхода снова гейт', await p3.$eval('#gate', (e) => e.hidden), false);

  // Перебор пароля упирается в счётчик.
  const codes = await p3.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const r = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x' + i }) });
      out.push(r.status);
    }
    return out;
  });
  ok('первые попытки отвергнуты', codes[0], 401);
  ok('после лимита включается 429', codes[11], 429);
  store.delete('uroki:login:fails');

  console.log('ошибки страницы:', errs.length ? errs : 'нет');
  if (errs.length) failed += errs.length;
  await b.close();
  server.close();
  console.log(failed ? ('\nПРОВАЛЕНО проверок: ' + failed) : '\nВсе проверки прошли');
  process.exit(failed ? 1 : 0);
})();
