// Вход и выход.
//   GET    - нужен ли пароль и есть ли уже сессия
//   POST   - {password} проверяется, в ответ ставится кука на 30 дней
//   DELETE - выход
const auth = require('../lib/auth.js');
const { redis, hasRedis } = require('../lib/store.js');

const FAIL_KEY = 'uroki:login:fails';
const FAIL_LIMIT = 10;
const FAIL_WINDOW = 15 * 60;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 4096) raw = raw.slice(0, 4096); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : null); } catch (e) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

// Подбор пароля тормозим общим счётчиком: пользователь один, гонок нет.
async function fails() {
  if (!hasRedis()) return 0;
  try { return Number(await redis(['GET', FAIL_KEY])) || 0; } catch (e) { return 0; }
}
async function noteFail() {
  if (!hasRedis()) return;
  try {
    await redis(['INCR', FAIL_KEY]);
    await redis(['EXPIRE', FAIL_KEY, String(FAIL_WINDOW)]);
  } catch (e) { /* счётчик не критичен */ }
}
async function clearFails() {
  if (!hasRedis()) return;
  try { await redis(['DEL', FAIL_KEY]); } catch (e) { /* см. выше */ }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    res.status(200).json({ required: auth.required(), authed: auth.isAuthed(req) });
    return;
  }

  if (req.method === 'DELETE') {
    auth.revoke(req, res);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST') {
    if (!auth.required()) {
      res.status(400).json({ error: 'password-not-set' });
      return;
    }
    if (await fails() >= FAIL_LIMIT) {
      res.status(429).json({ error: 'too-many-attempts', retryAfterSec: FAIL_WINDOW });
      return;
    }
    const body = await readBody(req);
    if (!body || !auth.checkPassword(body.password)) {
      await noteFail();
      res.status(401).json({ error: 'bad-password' });
      return;
    }
    await clearFails();
    auth.issue(req, res);
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  res.status(405).json({ error: 'method-not-allowed' });
};
