// Уроки и оплаты: мост между приложением на Vercel и вашим Google.
//
// Скрипт живёт внутри таблицы «Уроки: конспекты и посты» (Расширения → Apps Script)
// и разворачивается как веб-приложение, которое выполняется от вашего имени.
// Поэтому он видит ваш календарь, эту таблицу и ваш Google Drive, а приложению
// на Vercel не нужны ни ключи Google, ни отдельный проект в Google Cloud.
//
// Каждый запрос обязан нести токен из свойств скрипта. Токен создаёт функция setup():
// запустите её один раз из редактора и скопируйте токен из журнала выполнения.
//
// Что умеет:
//   events       уроки из ваших календарей за период, по ключевым словам в названии
//   notes        конспекты уроков с листа «Конспекты»
//   posts        черновики постов с листа «Посты»
//   post-status  смена статуса поста
//   backup       ежедневная резервная копия приложения в папку на Google Drive
//
// Описание телефонов и прочие подробности из событий наружу не отдаются:
// только название, время и адреса участников.

var SHEET_NOTES = 'Конспекты';
var SHEET_POSTS = 'Посты';
var BACKUP_FOLDER = 'Уроки и оплаты: резервные копии';
var BACKUP_KEEP = 90;
var POST_STATUSES = ['черновик', 'опубликован', 'отклонён'];
var MAX_RANGE_DAYS = 400;

function doGet(e) {
  return handle_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return out_({ error: 'bad-json' });
  }
  var params = {};
  var q = (e && e.parameter) || {};
  Object.keys(q).forEach(function (k) { params[k] = q[k]; });
  Object.keys(body).forEach(function (k) { params[k] = body[k]; });
  return handle_(params);
}

function handle_(p) {
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token) return out_({ error: 'token-not-set' });
  if (!sameString_(String(p.token || ''), token)) return out_({ error: 'forbidden' });
  try {
    switch (p.action) {
      case 'ping': return out_({ ok: true, me: myEmail_(), sheet: sheetUrl_() });
      case 'events': return out_(events_(p));
      case 'notes': return out_(notes_(p));
      case 'posts': return out_(posts_());
      case 'post-status': return out_(postStatus_(p));
      case 'backup': return out_(backup_(p));
      default: return out_({ error: 'unknown-action' });
    }
  } catch (err) {
    return out_({ error: 'script-error', message: String((err && err.message) || err) });
  }
}

// ---------- календарь ----------

function events_(p) {
  var from = new Date(p.from);
  var to = new Date(p.to);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) throw new Error('bad-range');
  if ((to - from) / 864e5 > MAX_RANGE_DAYS) throw new Error('range-too-long');
  var words = String(p.q || '').split(',').map(function (w) { return w.trim().toLowerCase(); })
    .filter(function (w) { return w.length > 0; });
  if (!words.length) throw new Error('no-keywords');

  var me = myEmail_();
  var seen = {};
  var list = [];
  CalendarApp.getAllOwnedCalendars().forEach(function (cal) {
    words.forEach(function (word) {
      var found;
      try { found = cal.getEvents(from, to, { search: word }); } catch (err) { found = []; }
      found.forEach(function (ev) {
        if (ev.isAllDayEvent()) return;
        var title = ev.getTitle() || '';
        if (title.toLowerCase().indexOf(word) < 0) return;
        var start = ev.getStartTime();
        var key = ev.getId() + '|' + start.toISOString();
        if (seen[key]) return;
        seen[key] = true;
        list.push({
          key: key,
          title: title,
          start: start.toISOString(),
          end: ev.getEndTime().toISOString(),
          emails: guests_(ev, me)
        });
      });
    });
  });
  list.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  return { events: list, me: me };
}

function guests_(ev, me) {
  var out = [];
  function add(x) {
    var v = String(x || '').trim().toLowerCase();
    if (!v || v === me || v.indexOf('@group.calendar.google.com') > -1 || v.indexOf('@resource.calendar.google.com') > -1) return;
    if (out.indexOf(v) < 0) out.push(v);
  }
  try { ev.getGuestList(true).forEach(function (g) { add(g.getEmail()); }); } catch (err) { /* без гостей */ }
  // Записи через страницу бронирования кладут адрес в описание после «Booked by».
  var desc = '';
  try { desc = ev.getDescription() || ''; } catch (err) { desc = ''; }
  var m = desc.match(/Booked by[\s\S]{0,200}?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (m) add(m[1]);
  return out;
}

// ---------- конспекты ----------
// Колонки листа «Конспекты»: id Granola · Начало (ISO) · Дата · Название · Email ученика ·
// Ученик · Конспект · Ссылка Granola · Добавлено. Порядок колонок не меняйте.

function notes_(p) {
  var since = p.since ? String(p.since) : '';
  var rows = rows_(SHEET_NOTES, 9);
  var list = [];
  rows.forEach(function (r) {
    var id = String(r[0] || '').trim();
    if (!id) return;
    var start = iso_(r[1]);
    var date = dateStr_(r[2]) || (start ? start.slice(0, 10) : '');
    if (since && date && date < since) return;
    list.push({
      id: id,
      start: start,
      date: date,
      title: String(r[3] || ''),
      emails: String(r[4] || '').split(/[,;\s]+/).map(function (x) { return x.trim().toLowerCase(); })
        .filter(function (x) { return x.indexOf('@') > 0; }),
      student: String(r[5] || ''),
      summary: String(r[6] || ''),
      url: String(r[7] || ''),
      added: iso_(r[8])
    });
  });
  return { notes: list };
}

// ---------- посты ----------
// Колонки листа «Посты»: id · Создан · Неделя · Заголовок · Слайды · Подпись · Хэштеги ·
// Статус · Даты уроков.

function posts_() {
  var rows = rows_(SHEET_POSTS, 9);
  var list = [];
  rows.forEach(function (r) {
    var id = String(r[0] || '').trim();
    if (!id) return;
    list.push({
      id: id,
      created: iso_(r[1]),
      week: String(r[2] || ''),
      title: String(r[3] || ''),
      slides: String(r[4] || ''),
      caption: String(r[5] || ''),
      hashtags: String(r[6] || ''),
      status: String(r[7] || 'черновик'),
      dates: String(r[8] || '')
    });
  });
  list.reverse();
  return { posts: list };
}

function postStatus_(p) {
  var id = String(p.id || '').trim();
  var status = String(p.status || '').trim();
  if (!id) throw new Error('no-id');
  if (POST_STATUSES.indexOf(status) < 0) throw new Error('bad-status');
  var sh = sheet_(SHEET_POSTS);
  var last = sh.getLastRow();
  if (last < 2) throw new Error('not-found');
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) {
      sh.getRange(i + 2, 8).setValue(status);
      return { ok: true, id: id, status: status };
    }
  }
  throw new Error('not-found');
}

// ---------- резервные копии ----------

function backup_(p) {
  var date = String(p.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad-date');
  var data = typeof p.data === 'string' ? p.data : JSON.stringify(p.data || null);
  var parsed;
  try { parsed = JSON.parse(data); } catch (err) { throw new Error('bad-data'); }
  if (!parsed || !Array.isArray(parsed.students)) throw new Error('bad-data');

  var folder = backupFolder_();
  var name = 'uroki-' + date + '.json';
  var files = folder.getFilesByName(name);
  var file;
  if (files.hasNext()) {
    file = files.next();
    file.setContent(data);
  } else {
    file = folder.createFile(name, data, 'application/json');
  }
  prune_(folder);
  return { ok: true, name: name, folder: folder.getUrl() };
}

function backupFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* папку удалили, создадим заново */ }
  }
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

function prune_(folder) {
  var all = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^uroki-\d{4}-\d{2}-\d{2}\.json$/.test(f.getName())) all.push(f);
  }
  all.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  all.slice(BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
}

// ---------- служебное ----------

function rows_(name, width) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, width).getValues();
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) throw new Error('no-spreadsheet');
    ss = SpreadsheetApp.openById(id);
  }
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('no-sheet:' + name);
  return sh;
}

function sheetUrl_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss ? ss.getUrl() : '';
}

function myEmail_() {
  return String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
}

function iso_(v) {
  if (v instanceof Date) return v.toISOString();
  var s = String(v || '').trim();
  if (!s) return '';
  var d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString();
}

function dateStr_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone() || 'Pacific/Auckland', 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function sameString_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- запускаются вручную из редактора ----------

// Шаг 1. Создаёт токен и заодно спрашивает разрешения на календарь, таблицу и Drive.
// Токен появится в журнале выполнения: скопируйте его в GOOGLE_SCRIPT_TOKEN на Vercel.
function setup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) props.setProperty('SHEET_ID', ss.getId());
  backupFolder_();
  Logger.log('Токен для GOOGLE_SCRIPT_TOKEN: ' + token);
  Logger.log('Календарей найдено: ' + CalendarApp.getAllOwnedCalendars().length);
}

// Шаг 2, по желанию. Показывает уроки на две недели вперёд: так видно, что календарь читается.
function checkCalendar() {
  var now = new Date();
  var res = events_({ from: now.toISOString(), to: new Date(now.getTime() + 14 * 864e5).toISOString(), q: 'по английскому, Silver Fern' });
  res.events.forEach(function (e) { Logger.log(e.start + '  ' + e.title + '  ' + e.emails.join(', ')); });
  Logger.log('Всего: ' + res.events.length);
}

// Новый токен, если старый куда-то утёк. После смены обновите GOOGLE_SCRIPT_TOKEN на Vercel.
function rotateToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  setup();
}
