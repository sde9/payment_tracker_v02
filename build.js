// Собирает страницу из src/: app.html со стилями и разметкой, lib.js с логикой
// расчётов и app.js с интерфейсом. Скрипты встраиваются прямо в страницу, поэтому
// собранный index.html открывается и с диска, без сервера.
//
// Результат пишется в два места:
//   index.html         в корне, чтобы страницу можно было открыть прямо с диска
//   public/index.html  каталог сборки для Vercel, в репозиторий не попадает
const fs = require('fs');
const path = require('path');

const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let raw = src('app.html');
raw = raw.replace(/<!-- @inline ([\w.]+) -->/g, (_, file) => {
  const code = src(file);
  if (/<\/script/i.test(code)) throw new Error(file + ': внутри скрипта нельзя писать </script');
  return '<script>\n' + code + '\n</script>';
});

// Заголовок из фрагмента переезжает в head страницы, чтобы <title> не задваивался.
const titleMatch = raw.match(/<title>([\s\S]*?)<\/title>/);
const title = titleMatch ? titleMatch[1].trim() : 'Уроки и оплаты';
const body = raw.replace(/<title>[\s\S]*?<\/title>\s*/, '');
const page = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Учёт предоплаченных занятий: баланс уроков, оплаты, отмены, календарь, конспекты и напоминания об оплате.">
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
