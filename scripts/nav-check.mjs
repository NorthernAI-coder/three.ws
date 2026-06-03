import puppeteer from 'puppeteer';
const base = 'http://localhost:3000';
const routes = ['/three-live','/pricing','/widgets','/marketplace','/walk','/community','/profile','/avatar-sdk','/mocap-studio','/pump-live','/pump-visualizer','/features','/home-v2','/tutorials','/pump-dashboard'];
const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox'] });
const out = {};
for (const path of routes) {
  const page = await browser.newPage();
  try { await page.goto(base+path, { waitUntil:'domcontentloaded', timeout:25000 }); } catch(e){ out[path]='NAV_ERR '+e.message.slice(0,40); await page.close(); continue; }
  const ok = await page.waitForSelector('header.nav .nav-main', { timeout:8000 }).then(()=>true).catch(()=>false);
  if (!ok) { out[path]='NO_NAV_INJECTED'; await page.close(); continue; }
  const r = await page.evaluate(() => {
    const navBrands = document.querySelectorAll('header.nav .brand').length;
    const headerBrands = document.querySelectorAll('header .brand, header h1').length; // total brands in any header
    const navPos = getComputedStyle(document.querySelector('header.nav')).position;
    const trig = document.querySelector('header.nav .nav-grp:first-child .nav-trigger');
    trig && trig.click();
    const opened = trig ? trig.closest('.nav-grp').classList.contains('open') : false;
    return { totalHeaderBrands: headerBrands, navBrand: navBrands, navPos, dropdown: opened };
  });
  out[path] = r;
  await page.close();
}
console.log(JSON.stringify(out,null,2));
await browser.close();
