import puppeteer from 'puppeteer';
const b = await puppeteer.launch({headless:'new', args:['--no-sandbox','--use-gl=swiftshader']});
const p = await b.newPage();
await p.setViewport({width:1400,height:800});
const errs=[];
p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
await p.goto('http://localhost:3000/tutorials',{waitUntil:'networkidle2',timeout:30000}).catch(e=>console.log('goto',e.message));
await new Promise(r=>setTimeout(r,1500));
const info = await p.evaluate(()=>{
  const nav=document.querySelector('.nav');
  const header=document.querySelector('.tut-page header')||document.querySelector('header');
  const r=el=>el?el.getBoundingClientRect():null;
  const cs=el=>el?getComputedStyle(el):{};
  return {
    navRect:r(nav), navInnerRect:r(document.querySelector('.nav-inner')),
    headerRect:r(header),
    navPos:cs(nav).position, navTop:cs(nav).top,
    headerPos:cs(header).position, headerTop:cs(header).top, headerOverflow:cs(header).overflow,
    bodyClass:document.body.className,
    bodyOverflow:getComputedStyle(document.body).overflow,
    htmlOverflow:getComputedStyle(document.documentElement).overflow,
    scrollY:window.scrollY
  };
});
console.log(JSON.stringify(info,null,2));
console.log('ERRORS:',errs.slice(0,15));
await p.screenshot({path:'/tmp/tut.png'});
await b.close();
