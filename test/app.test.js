const fs=require('fs');
const {chromium}=require('playwright');
(async()=>{
  const page='file://'+require('path').resolve(__dirname,'..','index.html');
  const b=await chromium.launch();
  const p=await b.newPage();
  const errs=[];
  p.on('console',m=>{ if(m.type()==='error' && !/fonts\.(googleapis|gstatic)|ERR_TUNNEL/.test(m.text())) errs.push(m.text()); });
  p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await p.goto(page);
  await p.evaluate(()=>{try{localStorage.clear();}catch(e){}});
  await p.reload();
  await p.waitForTimeout(700);

  const bal=async id=>p.$eval('.row[data-id="'+id+'"] .bal-n',e=>e.textContent);
  const money=async id=>p.$eval('.row[data-id="'+id+'"] .bal-m',e=>e.textContent);
  const state=async id=>p.$eval('.row[data-id="'+id+'"]',e=>e.dataset.state);
  let failed=0;
  // Intl вставляет неразрывный пробел как разделитель разрядов, в ожиданиях
  // стоит обычный: сравниваем по нормализованным пробелам.
  const norm=v=>typeof v==='string'?v.replace(/[\u00a0\u202f]/g,' '):v;
  const ok=(n,got,exp)=>{const p=norm(got)===norm(exp);if(!p)failed++;
    console.log((p?'PASS':'FAIL')+'  '+n+'  got='+JSON.stringify(got)+(p?'':' exp='+JSON.stringify(exp)));};

  ok('start Светлана bal',await bal('s1'),'6');
  ok('start Светлана ₽',await money('s1'),'12 000 ₽');
  ok('start Светлана state',await state('s1'),'ok');
  ok('start Иван state',await state('s2'),'ok');
  ok('start Алёна ₽',await money('s4'),'0 ₽');
  ok('start Геннадий bal',await bal('s5'),'−5');
  ok('start Геннадий ₽',await money('s5'),'−10 000 ₽');
  ok('start Геннадий state',await state('s5'),'debt');

  // due block: Елена, Алёна, Геннадий (bal<=2)
  ok('due count',await p.$$eval('#due li',n=>n.length),3);

  // Провёл x4 on Светлана: 6 -> 2 -> low
  for(let i=0;i<4;i++){ await p.click('.row[data-id="s1"] button[data-act="lesson"]'); await p.waitForTimeout(60); }
  ok('Светлана after 4 lessons',await bal('s1'),'2');
  ok('Светлана state low',await state('s1'),'low');
  ok('Светлана ₽',await money('s1'),'4 000 ₽');
  ok('due now 4',await p.$$eval('#due li',n=>n.length),4);
  ok('history rows Светлана',await p.$$eval('.row[data-id="s1"] .h',n=>n.length),5);

  // Отмена без списания на Иване
  await p.click('.row[data-id="s2"] button[data-act="cancel"]');
  await p.waitForTimeout(150);
  await p.click('#dlgCancel button[data-act="cx-free"]');
  await p.waitForTimeout(150);
  ok('Иван free cancel keeps 4',await bal('s2'),'4');
  // Отмена со списанием
  await p.click('.row[data-id="s2"] button[data-act="cancel"]');
  await p.waitForTimeout(150);
  await p.click('#dlgCancel button[data-act="cx-charge"]');
  await p.waitForTimeout(150);
  ok('Иван charged cancel -> 3',await bal('s2'),'3');

  // Оплата 10 уроков Геннадию: -5 -> 5, сумма 20000
  await p.click('.row[data-id="s5"] button[data-act="pay"]');
  await p.waitForTimeout(150);
  await p.click('#packs button[data-n="10"]');
  await p.waitForTimeout(60);
  ok('pay sum autofill 10x2000',await p.$eval('#payS',e=>e.value),'20000');
  await p.click('#dlgPay button[data-act="pay-ok"]');
  await p.waitForTimeout(200);
  ok('Геннадий after pay 10',await bal('s5'),'5');
  ok('Геннадий state ok',await state('s5'),'ok');
  ok('Геннадий ₽',await money('s5'),'10 000 ₽');

  // Алёна: ставка 950, оплата 4
  await p.click('.row[data-id="s4"] button[data-act="pay"]');
  await p.waitForTimeout(150);
  await p.click('#packs button[data-n="4"]');
  await p.waitForTimeout(60);
  ok('Алёна pay sum 4x950',await p.$eval('#payS',e=>e.value),'3800');
  await p.click('#dlgPay button[data-act="pay-ok"]');
  await p.waitForTimeout(200);
  ok('Алёна bal 4',await bal('s4'),'4');
  ok('Алёна ₽',await money('s4'),'3 800 ₽');

  // месяц: получено 20000+3800, уроков 4, отмен 1/1
  const mstats=await p.$$eval('#month .mstat b',n=>n.map(x=>x.textContent));
  ok('месяц получено',mstats[0],'23 800 ₽');
  ok('месяц уроков',mstats[1],'4');
  ok('месяц отмен со списанием',mstats[2],'1');
  ok('месяц отмен без списания',mstats[3],'1');

  // undo (double click needed)
  await p.click('.row[data-id="s4"] .hist summary'); await p.waitForTimeout(80);
  await p.click('.row[data-id="s4"] button[data-act="undo"]'); await p.waitForTimeout(80);
  await p.click('.row[data-id="s4"] button[data-act="undo"]'); await p.waitForTimeout(200);
  ok('Алёна after undo pay',await bal('s4'),'0');

  // rate edit: Иван 2000 -> 1900
  await p.$eval('.row[data-id="s2"] .rate',e=>{e.textContent='1900';});
  await p.$eval('.row[data-id="s2"] .rate',e=>e.dispatchEvent(new FocusEvent('focusout',{bubbles:true})));
  await p.waitForTimeout(200);
  ok('Иван new ₽ 3x1900',await money('s2'),'5 700 ₽');

  // threshold 3
  await p.$eval('#thr',e=>{e.value='3';e.dispatchEvent(new Event('change',{bubbles:true}));});
  await p.waitForTimeout(200);
  ok('Иван bal 3 -> low',await state('s2'),'low');

  // add student
  await p.click('button[data-act="add"]'); await p.waitForTimeout(250);
  ok('rows after add',await p.$$eval('#rows .row',n=>n.length),6);

  // day mode
  await p.click('button[data-act="day"]'); await p.waitForTimeout(200);
  ok('day list rows',await p.$$eval('#dayList .dayrow',n=>n.length),6);
  await p.click('#dayList .dayrow[data-sid="s1"] button[data-act="d-lesson"]'); await p.waitForTimeout(200);
  ok('Светлана via day mode 2->1',await bal('s1'),'1');
  await p.click('#dlgDay button[data-act="close"]'); await p.waitForTimeout(120);

  // reminder text
  const txt=await p.evaluate(()=>{
    const r=document.querySelector('.row[data-id="s5"]');
    r.querySelector('.bal-n').textContent='2';
    return null;
  });
  await p.waitForTimeout(50);

  // backup roundtrip
  const snap=await p.evaluate(()=>JSON.parse(localStorage.getItem('uroki.backup')));
  ok('backup students',snap.students.length,6);

  // dark theme render check
  await p.emulateMedia({colorScheme:'dark'});
  await p.waitForTimeout(200);
  const dark=await p.evaluate(()=>{const s=getComputedStyle(document.body);return s.backgroundColor+' / '+s.color;});
  console.log('dark body:',dark);
  await p.emulateMedia({colorScheme:'light'});
  await p.waitForTimeout(200);
  const light=await p.evaluate(()=>{const s=getComputedStyle(document.body);return s.backgroundColor+' / '+s.color;});
  console.log('light body:',light);

  console.log('console errors:',errs.length?errs:'none');
  await p.setViewportSize({width:390,height:900});
  await p.waitForTimeout(300);
  const oflow=await p.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
  console.log('mobile horizontal overflow:',oflow);
  await b.close();
  console.log(failed?('\nПРОВАЛЕНО проверок: '+failed):'\nВсе проверки прошли');
  process.exit(failed?1:0);
})();
