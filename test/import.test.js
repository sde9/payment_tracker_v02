// Импорт: файл, вставка текста и терпимость к разным формам JSON.
const path=require('path');
const {chromium}=require('playwright');
(async()=>{
  const page='file://'+path.resolve(__dirname,'..','index.html');
  const b=await chromium.launch();
  const p=await b.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(String(e.message)));
  let failed=0;
  const ok=(n,got,exp)=>{const q=got===exp;if(!q)failed++;console.log((q?'PASS':'FAIL')+'  '+n+'  got='+JSON.stringify(got)+(q?'':' exp='+JSON.stringify(exp)));};

  async function paste(json){
    await p.evaluate(()=>{try{localStorage.clear()}catch(e){}});
    await p.reload(); await p.waitForTimeout(400);
    await p.click('.settings > summary');
    await p.click('[data-act="paste"]');
    await p.waitForTimeout(120);
    await p.fill('#pasteBox', json);
    await p.click('[data-act="paste-ok"]');
    await p.waitForTimeout(350);
  }

  await p.goto(page); await p.waitForTimeout(500);

  // 1. Полный снимок в формате резервной копии
  const mk=(id,name,rate,bal)=>({id,arch:'0',name,rate,contact:'',note:'',bal,
    h:[{d:'2026-08-20',t:'init',delta:bal,amt:0,label:'Стартовый остаток',note:''}]});
  const seed=JSON.stringify({v:1,ts:1787216400000,thr:'2',defRate:'2000',
    tplLow:'Привет, {имя}! Осталось {остаток}.',tplDebt:'Привет, {имя}! Долг {долг}.',
    students:[mk('s1','Анна Петрова',2000,6),mk('s2','Борис Ковалёв',2000,4),
      mk('s3','Дарья Ильина',2000,0),mk('s4','Марк Соловьёв',950,0),mk('s5','Нина Захарова',2000,-5)]});
  await paste(seed);
  ok('снимок: учеников', await p.$$eval('#rows .row',n=>n.length), 5);
  ok('снимок: имя', await p.$eval('#rows .row:first-child .name',e=>e.textContent), 'Анна Петрова');
  ok('снимок: баланс', await p.$eval('#rows .row:first-child .bal-n',e=>e.textContent), '6');
  ok('снимок: своя ставка', await p.$eval('#rows .row:nth-child(4) .rate',e=>e.textContent), '950');
  ok('снимок: минус', await p.$eval('#rows .row:nth-child(5) .bal-n',e=>e.textContent), '−5');
  ok('снимок: сумма минуса', await p.$eval('#rows .row:nth-child(5) .bal-m',e=>e.textContent.replace(/[  ]/g,' ')), '−10 000 ₽');

  // 2. Голый массив без истории
  await paste('[{"name":"Пётр","rate":1900,"bal":3},{"name":"Ольга","bal":-2}]');
  ok('массив: учеников', await p.$$eval('#rows .row',n=>n.length), 2);
  ok('массив: ставка', await p.$eval('#rows .row:first-child .rate',e=>e.textContent), '1900');
  ok('массив: сумма', await p.$eval('#rows .row:first-child .bal-m',e=>e.textContent.replace(/[  ]/g,' ')), '5 700 ₽');
  ok('массив: ставка по умолчанию', await p.$eval('#rows .row:nth-child(2) .rate',e=>e.textContent), '2000');
  ok('массив: история достроена', await p.$$eval('#rows .row:first-child .h',n=>n.length), 1);
  ok('массив: состояние долга', await p.$eval('#rows .row:nth-child(2)',e=>e.dataset.state), 'debt');

  // 3. Русские ключи и строковые числа
  await paste('{"students":[{"имя":"Тимур","ставка":"2500","остаток":"7"}]}');
  ok('русские ключи: имя', await p.$eval('#rows .row .name',e=>e.textContent), 'Тимур');
  ok('русские ключи: сумма', await p.$eval('#rows .row .bal-m',e=>e.textContent.replace(/[  ]/g,' ')), '17 500 ₽');

  // 4. Мусор не проходит и ничего не ломает
  await paste('{"students":[{"name":"Живой","bal":1}]}');
  await p.click('[data-act="paste"]'); await p.waitForTimeout(120);
  await p.fill('#pasteBox','это не json');
  await p.click('[data-act="paste-ok"]'); await p.waitForTimeout(250);
  ok('мусор: ошибка показана', await p.$eval('#pasteErr',e=>e.hidden), false);
  ok('мусор: окно открыто', await p.$eval('#dlgPaste',e=>e.open), true);
  await p.click('#dlgPaste [data-act="close"]'); await p.waitForTimeout(150);
  ok('мусор: данные целы', await p.$$eval('#rows .row',n=>n.length), 1);

  // 5. Откат: прежнее состояние отложено
  ok('копия перед импортом есть', await p.evaluate(()=>!!localStorage.getItem('uroki.beforeImport')), true);

  console.log('ошибки страницы:', errs.length?errs:'нет');
  if(errs.length)failed+=errs.length;
  await b.close();
  console.log(failed?('\nПРОВАЛЕНО: '+failed):'\nВсе проверки прошли');
  process.exit(failed?1:0);
})();
