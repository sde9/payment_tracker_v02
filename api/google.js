// Календарь, конспекты и посты: прокси к Apps Script, закрытый тем же паролем.
//   GET  ?action=ping
//   GET  ?action=events&from=ISO&to=ISO&q=слова,через,запятую
//   GET  ?action=notes&since=ГГГГ-ММ-ДД
//   GET  ?action=posts
//   POST {action:'post-status', id, status}
// Наружу пропускаются только эти действия и только эти параметры.
const auth = require('../lib/auth.js');
const gas = require('../lib/gas.js');
const { readJson, query } = require('../lib/body.js');

const GET_ACTIONS = { ping: [], events: ['from', 'to', 'q'], notes: ['since'], posts: [] };
const POST_ACTIONS = { 'post-status': ['id', 'status'] };

function pick(src, keys) {
  const out = {};
  keys.forEach((k) => {
    if (src[k] != null) out[k] = String(src[k]).slice(0, 500);
  });
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!auth.isAuthed(req)) {
    res.status(401).json({ error: 'auth-required' });
    return;
  }
  if (!gas.configured()) {
    res.status(503).json({ error: 'google-not-configured' });
    return;
  }
  // В конспектах личные подробности учеников: без пароля на сайте их не отдаём.
  // ALLOW_OPEN_GOOGLE=1 нужен только для локальных тестов.
  if (!auth.required() && process.env.ALLOW_OPEN_GOOGLE !== '1') {
    res.status(403).json({ error: 'password-required' });
    return;
  }
  try {
    if (req.method === 'GET') {
      const q = query(req);
      const keys = GET_ACTIONS[q.action];
      if (!keys) {
        res.status(400).json({ error: 'bad-action' });
        return;
      }
      res.status(200).json(await gas.call(q.action, pick(q, keys)));
      return;
    }
    if (req.method === 'POST') {
      const body = (await readJson(req, 64 * 1024)) || {};
      const keys = POST_ACTIONS[body.action];
      if (!keys) {
        res.status(400).json({ error: 'bad-action' });
        return;
      }
      res.status(200).json(await gas.call(body.action, null, pick(body, keys)));
      return;
    }
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method-not-allowed' });
  } catch (e) {
    res.status(502).json({ error: e.code || 'google-error', message: e.detail || '' });
  }
};
