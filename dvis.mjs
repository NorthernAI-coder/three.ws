import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
await page.goto('http://localhost:3000/marketplace', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.waitForSelector('.home-nav .nav-root', { state: 'attached', timeout: 10000 });
await page.waitForTimeout(500);

const positions = await page.evaluate(() => {
  const rect = (el) => el?.getBoundingClientRect();
  return {
    homeNav: rect(document.querySelector('.home-nav')),
    burger: rect(document.querySelector('.home-nav .nav-burger')),
    navContainer: rect(document.getElementById('nav-container')),
    h1: rect(document.querySelector('.site-header-brand')),
    header: rect(document.querySelector('.site-header')),
  };
});
console.log('Positions:', JSON.stringify(positions, null, 2));

const burger = await page.locator('.home-nav .nav-burger').first();
await burger.click();
await page.waitForTimeout(400);
const rootBox = await page.locator('.home-nav .nav-root').first().boundingBox();
console.log('Nav root open:', JSON.stringify(rootBox));
await browser.close();
