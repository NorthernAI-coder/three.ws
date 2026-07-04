import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hero-chip--fireworks', { timeout: 8000 });
await page.waitForTimeout(3500);
const dir = '/tmp/claude-1000/-workspaces-three-ws/3d96eb7b-ea54-4817-8530-12f878b01e6b/scratchpad/';
await page.click('.hero-chip--fireworks');
// fuse 1600 + ~2s climb → bursts around 3.6-4.5s; sample a few fixed points
for (const t of [3800, 4300, 4800]) { await page.waitForTimeout(t - (t===3800?0:t===4300?3800:4300)); }
await page.waitForTimeout(0);
await page.screenshot({ path: dir + 'torch-final.png' });
console.log('done');
await browser.close();
