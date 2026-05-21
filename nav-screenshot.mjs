import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForSelector('.home-nav .nav-root', { timeout: 5000 });
await page.waitForTimeout(800);

// 1) Full header (clean state)
await page.screenshot({ path: '/tmp/marketplace-nav.png', clip: { x: 0, y: 0, width: 1440, height: 80 } });

// 2) Build dropdown open
const buildBtn = await page.locator('.home-nav .nav-trigger', { hasText: 'Build' }).first();
await buildBtn.click();
await page.waitForTimeout(400);
const menu = await page.locator('.home-nav .nav-trigger[aria-expanded="true"] + .nav-menu').first();
const mb = await menu.boundingBox();
if (mb) {
  await page.screenshot({
    path: '/tmp/marketplace-nav-build-open.png',
    clip: { x: 0, y: 0, width: 1440, height: Math.ceil(mb.y + mb.height + 16) },
  });
}
await page.mouse.click(10, 600);
await page.waitForTimeout(200);

// 3) Labs dropdown
const labsBtn = await page.locator('.home-nav .nav-trigger', { hasText: 'Labs' }).first();
await labsBtn.click();
await page.waitForTimeout(400);
const labsMenu = await page.locator('.home-nav .nav-trigger[aria-expanded="true"] + .nav-menu').first();
const lb = await labsMenu.boundingBox();
if (lb) {
  await page.screenshot({
    path: '/tmp/marketplace-nav-labs-open.png',
    clip: { x: 0, y: 0, width: 1440, height: Math.ceil(lb.y + lb.height + 16) },
  });
}
await page.mouse.click(10, 600);
await page.waitForTimeout(200);

// 4) Mobile closed
await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/marketplace-nav-mobile.png', clip: { x: 0, y: 0, width: 390, height: 80 } });

// 5) Mobile open
const burger = await page.locator('.home-nav .nav-burger').first();
await burger.click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/marketplace-nav-mobile-open.png', clip: { x: 0, y: 0, width: 390, height: 700 } });

await browser.close();
console.log('done');
