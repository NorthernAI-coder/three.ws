import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('CORS')) errors.push('err: ' + msg.text().slice(0, 120));
});

await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('.home-nav .nav-root', { timeout: 5000 });
await page.waitForTimeout(800);

await page.screenshot({ path: '/tmp/v-header.png', clip: { x: 0, y: 0, width: 1440, height: 80 } });

const buildBtn = await page.locator('.home-nav .nav-trigger', { hasText: 'Build' }).first();
await buildBtn.click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/v-build.png', clip: { x: 0, y: 0, width: 600, height: 320 } });
await page.mouse.click(10, 600);
await page.waitForTimeout(200);

const labsBtn = await page.locator('.home-nav .nav-trigger', { hasText: 'Labs' }).first();
await labsBtn.click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/v-labs.png', clip: { x: 600, y: 0, width: 840, height: 720 } });
await page.mouse.click(10, 600);
await page.waitForTimeout(200);

await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/v-mobile.png', clip: { x: 0, y: 0, width: 390, height: 80 } });

const burger = await page.locator('.home-nav .nav-burger').first();
await burger.click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/v-mobile-open.png', clip: { x: 0, y: 0, width: 390, height: 600 } });

console.log('errors:', JSON.stringify(errors, null, 2));
await browser.close();
