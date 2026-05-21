import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const data = await page.evaluate(() => {
  const rect = (el) => el?.getBoundingClientRect();
  return {
    homeNav: rect(document.querySelector('.home-nav')),
    burger: rect(document.querySelector('.home-nav .nav-burger')),
    navContainer: rect(document.getElementById('nav-container')),
    h1: rect(document.querySelector('.site-header-brand, header h1')),
    header: rect(document.querySelector('.site-header, header')),
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
