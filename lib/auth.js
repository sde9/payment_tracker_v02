// Вход по паролю. Пароль задаётся переменной окружения APP_PASSWORD.
// Пока она пуста, гейт выключен и всё работает как раньше: так проще
// поднимать проект локально и не остаться запертым при опечатке.
const crypto = require('crypto');

const COOKIE = 'uroki_auth';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function password() {
  return process.env.APP_PASSWORD || '';
}
function required() {
  return password().length > 0;
}

// Ключ подписи выводится из пароля, поэтому смена пароля разлогинивает всех.
function sign(exp) {
  return crypto.createHmac('sha256', 'uroki|' + password()).update('v1.' + exp).digest('base64url');
}
function makeToken() {
  const exp = Date.now() + TTL_MS;
  return exp + '.' + sign(exp);
}
function equal(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
function verifyToken(token) {
  if (!token) return false;
  const i = token.indexOf('.');
  if (i < 1) return false;
  const exp = token.slice(0, i);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return equal(token.slice(i + 1), sign(exp));
}
function checkPassword(candidate) {
  return typeof candidate === 'string' && equal(candidate, password());
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(eq + 1).trim()); } catch (e) { return null; }
  }
  return null;
}
function isAuthed(req) {
  if (!required()) return true;
  return verifyToken(readCookie(req, COOKIE));
}
function secureFlag(req) {
  const proto = req.headers['x-forwarded-proto'] || '';
  return proto === 'https' ? '; Secure' : '';
}
function issue(req, res) {
  res.setHeader('Set-Cookie',
    COOKIE + '=' + makeToken() + '; HttpOnly' + secureFlag(req) +
    '; SameSite=Lax; Path=/; Max-Age=' + Math.floor(TTL_MS / 1000));
}
function revoke(req, res) {
  res.setHeader('Set-Cookie',
    COOKIE + '=; HttpOnly' + secureFlag(req) +
    '; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
}

module.exports = { COOKIE, required, isAuthed, checkPassword, issue, revoke };
