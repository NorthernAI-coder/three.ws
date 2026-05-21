import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
});

await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle', timeout: 30000 });

// wait for nav to be injected
await page.waitForSelector('.home-nav .nav-root', { timeout: 5000 });
await page.waitForTimeout(800);

// full header screenshot
await page.screenshot({ path: '/tmp/marketplace-nav.png', clip: { x: 0, y: 0, width: 1440, height: 80 } });

// open the Build dropdown
const buildBtn = await page.locator('.home-nav .nav-trigger', { hasText: 'Build' }).first();
await buildBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/marketplace-nav-build-open.png', clip: { x: 0, y: 0, width: 1440, height: 400 } });

// Hover on Marketplace link
await page.locator('.home-nav a', { hasText: 'Marketplace' }).first().hover();
await page.waitForTimeout(250);
await page.screenshot({ path: '/tmp/marketplace-nav-hover.png', clip: { x: 0, y: 0, width: 1440, height: 80 } });

// mobile
await page.setViewportSize({ width: 390, height: 800 });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/marketplace-nav-mobile.png', clip: { x: 0, y: 0, width: 390, height: 80 } });
const burger = await page.locator('.home-nav .nav-burger').first();
await burger.click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/marketplace-nav-mobile-open.png', clip: { x: 0, y: 0, width: 390, height: 800 } });

console.log('errors:', JSON.stringify(errors, null, 2));
await browser.close();
