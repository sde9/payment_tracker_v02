// Тело запроса как JSON: Vercel иногда разбирает его сам, локальный сервер тестов нет.
function readJson(req, limit) {
  const max = limit || 2 * 1024 * 1024;
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); }
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > max) reject(new Error('too-large'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : null); } catch (e) { resolve(null); }
    });
    req.on('error', reject);
  });
}

function query(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  const out = {};
  new URL(req.url, 'http://local').searchParams.forEach((v, k) => { out[k] = v; });
  return out;
}

module.exports = { readJson, query };
