// Резервные копии.
//   GET               дни, за которые на сервере есть копия, и дата последней копии в Drive
//   GET ?date=ДАТА    снимок за этот день целиком
//   POST {action:'drive'}  отправить текущий снимок в Google Drive, если сегодня ещё не отправляли
// Сами дневные копии пишет api/state.js при каждом сохранении.
const auth = require('../lib/auth.js');
const gas = require('../lib/gas.js');
const days = require('../lib/days.js');
const { redis, hasRedis } = require('../lib/store.js');
const { readJson, query } = require('../lib/body.js');

const DRIVE_LAST = 'uroki:drive:last';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!auth.isAuthed(req)) {
    res.status(401).json({ error: 'auth-required' });
    return;
  }
  if (!hasRedis()) {
    res.status(503).json({ error: 'storage-not-configured' });
    return;
  }
  try {
    if (req.method === 'GET') {
      const q = query(req);
      if (q.date) {
        const raw = await days.get(q.date);
        if (!raw) {
          res.status(404).json({ error: 'not-found' });
          return;
        }
        res.status(200).json({ date: q.date, state: JSON.parse(raw) });
        return;
      }
      res.status(200).json({
        days: (await days.list()).reverse(),
        keep: days.KEEP,
        drive: { configured: gas.configured(), last: (await redis(['GET', DRIVE_LAST])) || '' },
      });
      return;
    }
    if (req.method === 'POST') {
      const body = (await readJson(req, 4096)) || {};
      if (body.action !== 'drive') {
        res.status(400).json({ error: 'bad-action' });
        return;
      }
      if (!gas.configured()) {
        res.status(200).json({ ok: false, skipped: 'google-not-configured' });
        return;
      }
      const d = days.today();
      if ((await redis(['GET', DRIVE_LAST])) === d) {
        res.status(200).json({ ok: true, skipped: 'already-today', date: d });
        return;
      }
      const raw = await redis(['GET', 'uroki:state']);
      if (!raw) {
        res.status(200).json({ ok: false, skipped: 'empty' });
        return;
      }
      const r = await gas.call('backup', null, { date: d, data: raw });
      await redis(['SET', DRIVE_LAST, d]);
      res.status(200).json({ ok: true, date: d, name: r.name, folder: r.folder });
      return;
    }
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method-not-allowed' });
  } catch (e) {
    res.status(e.code ? 502 : 500).json({ error: e.code || String((e && e.message) || e), message: e.detail || '' });
  }
};
