import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const failed = [];
page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
await page.goto('http://localhost:3010/pages/scene.html', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3000);
console.log('failed requests:', failed);
const navInfo = await page.evaluate(() => ({
  navScript: !!document.querySelector('script[src="/nav.js"]'),
  headerEl: !!document.querySelector('header, .site-nav, nav'),
  bodyFirstChildren: [...document.body.children].slice(0, 5).map((e) => e.tagName + (e.id ? '#' + e.id : '')),
}));
console.log(JSON.stringify(navInfo, null, 1));
await browser.close();
