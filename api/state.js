// Хранилище состояния приложения: один ключ в Redis, в нём весь снимок.
// Учеников до нескольких десятков, история операций растёт медленно,
// поэтому дробить на таблицы нет смысла: читаем и пишем целиком.
//
// Redis подключается через Vercel Marketplace (Upstash). Интеграция сама
// кладёт в проект переменные окружения; имена у разных версий отличаются,
// поэтому проверяем несколько вариантов.

const KEY = 'uroki:state';
const KEY_PREV = 'uroki:state:prev';
const MAX_BYTES = 2 * 1024 * 1024;

function creds() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

async function redis(command) {
  const c = creds();
  const r = await fetch(c.url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + c.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const text = await r.text();
  if (!r.ok) throw new Error('redis ' + r.status + ': ' + text.slice(0, 200));
  return JSON.parse(text).result;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BYTES) reject(new Error('too-large'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : null); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!creds()) {
    res.status(503).json({
      error: 'storage-not-configured',
      hint: 'Подключите Upstash Redis через Vercel Marketplace и передеплойте проект.',
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      const raw = await redis(['GET', KEY]);
      res.status(200).json({ state: raw ? JSON.parse(raw) : null });
      return;
    }

    if (req.method === 'POST') {
      const state = await readBody(req);
      // Пустой или битый снимок затёр бы реальные данные, поэтому не принимаем.
      if (!state || !Array.isArray(state.students)) {
        res.status(400).json({ error: 'bad-state' });
        return;
      }
      const prev = await redis(['GET', KEY]);
      if (prev) await redis(['SET', KEY_PREV, prev]);
      await redis(['SET', KEY, JSON.stringify(state)]);
      res.status(200).json({ ok: true, savedAt: Date.now() });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method-not-allowed' });
  } catch (e) {
    const msg = String((e && e.message) || e);
    res.status(msg === 'too-large' ? 413 : 500).json({ error: msg });
  }
};
