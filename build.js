// Собирает автономную страницу index.html из src/app.html.
// src/app.html - это фрагмент для артефакта claude.ai: там нет doctype,
// html, head и body, потому что claude.ai добавляет их сам при публикации.
const fs = require('fs');
const path = require('path');

const body = fs.readFileSync(path.join(__dirname, 'src', 'app.html'), 'utf8');
const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Учёт предоплаченных занятий: баланс уроков, оплаты, отмены и напоминания об оплате.">
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, 'index.html'), page);
console.log('index.html собран, ' + page.length + ' байт');
