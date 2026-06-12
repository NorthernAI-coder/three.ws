// Visual proof on PROD: the demo account opens the shop and sees Crimson
// Threads as Owned, then previews it live on the avatar.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://three.ws/play', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.evaluate(() => {
  localStorage.setItem('cc-pid', 'g_threews_live_demo');
  localStorage.setItem('tws:onchain-primer:done', '1');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cc-shop-btn', { state: 'attached', timeout: 90_000 });
await page.evaluate(() => {
  document.querySelector('.cc-onboard, .cc-onboard-overlay')?.remove();
  document.querySelector('.cc-shop-btn').click();
});
await page.waitForFunction(() => !!document.querySelector('.cc-shop-card'), { timeout: 30_000 });
const state = await page.evaluate(() => {
  const card = document.querySelector('.cc-shop-card[data-id="skin-crimson"]');
  // Preview the owned skin live on the avatar while we're here.
  card?.querySelector('.cc-shop-thumb-btn')?.click();
  return {
    ownedBadge: card?.querySelector('.cc-shop-action')?.textContent,
    cardClass: card?.className,
    status: document.querySelector('.cc-shop-status')?.textContent,
  };
});
console.log(JSON.stringify(state, null, 1));
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/prod-owned.png' });
console.log('screenshot: /tmp/prod-owned.png');
await browser.close();
