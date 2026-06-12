import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://three.ws/play', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.evaluate(() => localStorage.setItem('tws:onchain-primer:done', '1'));
await page.waitForSelector('.cc-shop-btn', { state: 'attached', timeout: 90_000 });
await page.evaluate(() => document.querySelector('.cc-shop-btn').click());
await page.waitForSelector('#cc-shop:not([hidden])', { timeout: 30_000 });
await page.waitForTimeout(3000);
const state = await page.evaluate(() => {
  const buy = document.querySelector('.cc-shop-buy');
  const card = buy?.closest('.cc-shop-card');
  const r = buy?.getBoundingClientRect();
  const cs = buy ? getComputedStyle(buy) : null;
  return {
    buys: document.querySelectorAll('.cc-shop-buy').length,
    rect: r ? { w: r.width, h: r.height, x: r.x, y: r.y } : null,
    display: cs?.display, visibility: cs?.visibility,
    panelClass: document.querySelector('.cc-shop')?.className,
    bodyScroll: document.querySelector('.cc-shop-body')?.scrollHeight,
  };
});
console.log(JSON.stringify(state, null, 1));
await page.screenshot({ path: '/tmp/prod-shop.png' });
await browser.close();
