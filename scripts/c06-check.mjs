import puppeteer from 'puppeteer';
const BASE='http://localhost:3003';
const browser=await puppeteer.launch({headless:'new',args:['--no-sandbox','--use-gl=swiftshader']});
async function check(path, fn, {wait=2500}={}){
  const page=await browser.newPage();
  const errs=[];
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  page.on('pageerror',e=>errs.push('PAGEERR: '+e.message));
  try{
    await page.goto(BASE+path,{waitUntil:'networkidle2',timeout:30000});
    await new Promise(r=>setTimeout(r,wait));
    const res=await page.evaluate(fn);
    const relevant=errs.filter(e=>/state-kit|emptyState|tws-es|Failed to fetch module|does not provide|Cannot|undefined is not/.test(e));
    console.log(`\n=== ${path} ===`);
    console.log('result:',JSON.stringify(res));
    console.log('module/relevant errors:',relevant.length?relevant.slice(0,5):'none');
  }catch(e){console.log(`\n=== ${path} === NAV FAIL`,e.message);}
  await page.close();
}
await check('/three-live',()=>{
  const li=document.getElementById('pl-ticker-empty');
  const es=li&&li.querySelector('.tws-es');
  const tip=document.querySelector('.tws-es-tip');
  const style=!!document.getElementById('tws-state-kit-styles');
  return {hasLi:!!li, hasEmptyState:!!es, hasTip:!!tip, styleInjected:style, title:es&&es.querySelector('.tws-es-title')?.textContent, body:es&&es.querySelector('.tws-es-body')?.textContent?.trim()};
});
await check('/club',()=>{
  const feed=document.getElementById('club-tip-feed');
  const es=feed&&feed.querySelector('.tws-es');
  return {hasFeed:!!feed, hasEmptyState:!!es, title:es&&es.querySelector('.tws-es-title')?.textContent, styleInjected:!!document.getElementById('tws-state-kit-styles')};
});
await check('/pump-dashboard',()=>{
  return {loaded:!!document.querySelector('.pd-shell, [class*=pd-], main'), stateKit:typeof window.twsStateKit};
});
await browser.close();
