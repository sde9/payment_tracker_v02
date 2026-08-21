// Проверка серверного хранения: настоящий обработчик api/state.js поверх
// поддельного Upstash, страница из public/ и браузер.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
process.env.KV_REST_API_URL = 'http://fake-upstash.local';
process.env.KV_REST_API_TOKEN = 'test-token';

// Поддельный Upstash: перехватываем fetch, который делает обработчик.
const store = new Map();
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('http://fake-upstash.local')) {
    const [cmd, key, value] = JSON.parse(opts.body);
    let result = null;
    if (cmd === 'GET') result = store.has(key) ? store.get(key) : null;
    else if (cmd === 'SET') { store.set(key, value); result = 'OK'; }
    return { ok: true, text: async () => JSON.stringify({ result }) };
  }
  return realFetch(url, opts);
};

const handler = require('../api/state.js');

function shim(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  return res;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/state') return handler(req, shim(res));
  const file = path.join(ROOT, 'public', url === '/' ? 'index.html' : url);
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file)) {
    res.statusCode = 404; return res.end('not found');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
});

let failed = 0;
const ok = (n, got, exp) => {
  const p = got === exp;
  if (!p) failed++;
  console.log((p ? 'PASS' : 'FAIL') + '  ' + n + '  got=' + JSON.stringify(got) + (p ? '' : ' exp=' + JSON.stringify(exp)));
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message)));

  // Первый заход: хранилище пустое, страница заливает то, что в разметке.
  await p.goto(base);
  await p.waitForFunction(() => document.querySelector('#chip').textContent.indexOf('сервер') > -1, null, { timeout: 8000 });
  ok('индикатор после загрузки', await p.$eval('#chip', (e) => e.textContent), 'сохранено на сервере');
  ok('снимок залит в хранилище', store.has('uroki:state'), true);
  ok('учеников в хранилище', JSON.parse(store.get('uroki:state')).students.length, 5);

  // Отмечаем занятие и оплату, ждём записи.
  await p.click('.row[data-id="s1"] button[data-act="lesson"]');
  await p.waitForTimeout(1400);
  await p.click('.row[data-id="s5"] button[data-act="pay"]');
  await p.waitForTimeout(200);
  await p.click('#packs button[data-n="10"]');
  await p.click('#dlgPay button[data-act="pay-ok"]');
  await p.waitForTimeout(1400);
  ok('баланс Светланы в хранилище', JSON.parse(store.get('uroki:state')).students[0].bal, 5);
  ok('баланс Геннадия в хранилище', JSON.parse(store.get('uroki:state')).students[4].bal, 5);

  // Другое устройство: чистый браузер без localStorage должен увидеть то же.
  const ctx = await b.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(base);
  await p2.waitForFunction(() => document.querySelector('#chip').textContent.indexOf('сервер') > -1, null, { timeout: 8000 });
  ok('другое устройство: Светлана', await p2.$eval('.row[data-id="s1"] .bal-n', (e) => e.textContent), '5');
  ok('другое устройство: Геннадий', await p2.$eval('.row[data-id="s5"] .bal-n', (e) => e.textContent), '5');
  ok('другое устройство: сумма', await p2.$eval('.row[data-id="s5"] .bal-m', (e) => e.textContent.replace(/[  ]/g, ' ')), '10 000 ₽');

  // Резервная копия предыдущего снимка ведётся.
  ok('предыдущий снимок сохранён', store.has('uroki:state:prev'), true);

  // Битый снимок не должен затирать данные.
  const before = store.get('uroki:state');
  const bad = await p.evaluate(async () => {
    const r = await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nope: 1 }) });
    return r.status;
  });
  ok('битый снимок отклонён', bad, 400);
  ok('данные не затёрты', store.get('uroki:state'), before);

  // Сеть отвалилась: страница честно говорит об этом и не теряет данные.
  await p.route('**/api/state', (route) => route.abort());
  await p.click('.row[data-id="s2"] button[data-act="lesson"]');
  await p.waitForTimeout(1500);
  ok('индикатор при обрыве', await p.$eval('#chip', (e) => e.textContent), 'не сохранилось, проверьте сеть');
  ok('на экране изменение осталось', await p.$eval('.row[data-id="s2"] .bal-n', (e) => e.textContent), '3');

  console.log('ошибки страницы:', errs.length ? errs : 'нет');
  if (errs.length) failed += errs.length;
  await b.close();
  server.close();
  console.log(failed ? ('\nПРОВАЛЕНО проверок: ' + failed) : '\nВсе проверки прошли');
  process.exit(failed ? 1 : 0);
})();
