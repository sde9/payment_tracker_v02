// Обращение к веб-приложению Apps Script (google/Code.gs).
// Адрес и токен задаются переменными окружения на Vercel:
//   GOOGLE_SCRIPT_URL    адрес веб-приложения, оканчивается на /exec
//   GOOGLE_SCRIPT_TOKEN  токен, который напечатала функция setup()
// Токен остаётся на сервере: страница его никогда не видит.

function cfg() {
  const url = (process.env.GOOGLE_SCRIPT_URL || '').trim();
  const token = (process.env.GOOGLE_SCRIPT_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

function configured() {
  return cfg() !== null;
}

function fail(code, detail) {
  const e = new Error(code);
  e.code = code;
  e.detail = detail || '';
  return e;
}

async function call(action, params, body) {
  const c = cfg();
  if (!c) throw fail('google-not-configured');
  const u = new URL(c.url);
  u.searchParams.set('action', action);
  const opts = { redirect: 'follow' };
  if (body) {
    // Apps Script не видит заголовков, поэтому токен едет в теле запроса.
    opts.method = 'POST';
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(Object.assign({}, body, { action, token: c.token }));
  } else {
    u.searchParams.set('token', c.token);
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v != null && v !== '') u.searchParams.set(k, String(v));
    });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  opts.signal = ctrl.signal;
  let r;
  try {
    r = await fetch(u.toString(), opts);
  } catch (e) {
    throw fail(e && e.name === 'AbortError' ? 'google-timeout' : 'google-unreachable');
  } finally {
    clearTimeout(timer);
  }
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    // Обычно это страница входа Google: веб-приложение развёрнуто без доступа «Все».
    throw fail('google-bad-response');
  }
  if (j && j.error) throw fail('google-' + j.error, j.message);
  return j;
}

module.exports = { configured, call };
