// Копия состояния за каждый день: ключ uroki:day:ГГГГ-ММ-ДД, список дней в uroki:days.
// Хранится последний снимок каждого дня, дни старше KEEP удаляются.
const { redis } = require('./store.js');

const KEEP = 35;
const LIST = 'uroki:days';
const dayKey = (d) => 'uroki:day:' + d;

function today(ts) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TZ || 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ts ? new Date(ts) : new Date());
}

async function list() {
  const raw = await redis(['GET', LIST]);
  try {
    const l = JSON.parse(raw || '[]');
    return Array.isArray(l) ? l.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
  } catch (e) {
    return [];
  }
}

async function remember(json) {
  const d = today();
  await redis(['SET', dayKey(d), json]);
  const days = await list();
  if (days.indexOf(d) > -1) return;
  days.push(d);
  days.sort();
  while (days.length > KEEP) {
    const old = days.shift();
    await redis(['DEL', dayKey(old)]);
  }
  await redis(['SET', LIST, JSON.stringify(days)]);
}

async function get(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return null;
  return redis(['GET', dayKey(d)]);
}

module.exports = { KEEP, today, list, remember, get };
