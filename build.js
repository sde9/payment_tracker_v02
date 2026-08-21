// Собирает автономную страницу из src/app.html.
// src/app.html - это фрагмент для артефакта claude.ai: там нет doctype,
// html, head и body, потому что claude.ai добавляет их сам при публикации.
//
// Результат пишется в два места:
//   index.html         в корне, чтобы страницу можно было открыть прямо с диска
//   public/index.html  каталог сборки для Vercel, в репозиторий не попадает
const fs = require('fs');
const path = require('path');

// Заголовок из фрагмента переезжает в head страницы, чтобы <title> не задваивался.
const raw = fs.readFileSync(path.join(__dirname, 'src', 'app.html'), 'utf8');
const titleMatch = raw.match(/<title>([\s\S]*?)<\/title>/);
const title = titleMatch ? titleMatch[1].trim() : 'Уроки и оплаты';
const body = raw.replace(/<title>[\s\S]*?<\/title>\s*/, '');
const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Учёт предоплаченных занятий: баланс уроков, оплаты, отмены и напоминания об оплате.">
<title>${title}</title>
</head>
<body>
${body}
</body>
</html>
`;

const targets = ['index.html', path.join('public', 'index.html')];
for (const target of targets) {
  const full = path.join(__dirname, target);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, page);
  console.log(target + ' собран, ' + page.length + ' байт');
}
