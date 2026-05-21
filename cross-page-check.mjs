import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle' });
await page.waitForSelector('.home-nav .nav-root', { timeout: 5000 });
await page.waitForTimeout(700);

console.log('BEFORE:', await page.evaluate(() => {
  const h = document.querySelector('.site-header');
  return {
    winScroll: { x: scrollX, y: scrollY },
    header: { scrollTop: h.scrollTop, scrollLeft: h.scrollLeft, scrollHeight: h.scrollHeight, scrollWidth: h.scrollWidth },
    nc: document.getElementById('nav-container').getBoundingClientRect(),
  };
}));

const build = await page.locator('.home-nav .nav-trigger:has-text("Build")').first();
await build.click();
await page.waitForTimeout(400);

console.log('AFTER:', await page.evaluate(() => {
  const h = document.querySelector('.site-header');
  return {
    winScroll: { x: scrollX, y: scrollY },
    header: { scrollTop: h.scrollTop, scrollLeft: h.scrollLeft, scrollHeight: h.scrollHeight, scrollWidth: h.scrollWidth },
    nc: document.getElementById('nav-container').getBoundingClientRect(),
  };
}));

await browser.close();
