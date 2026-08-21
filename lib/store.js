// Доступ к Redis по REST. Интеграция Upstash из Vercel Marketplace кладёт
// переменные окружения сама, но имена у разных версий отличаются.
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

function hasRedis() {
  return creds() !== null;
}

async function redis(command) {
  const c = creds();
  if (!c) throw new Error('storage-not-configured');
  const r = await fetch(c.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const text = await r.text();
  if (!r.ok) throw new Error('redis ' + r.status + ': ' + text.slice(0, 200));
  return JSON.parse(text).result;
}

module.exports = { hasRedis, redis };
