import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle' });
await page.waitForSelector('.home-nav .nav-root', { timeout: 5000 });
await page.waitForTimeout(700);

// Hover then click the Build trigger
const build = await page.locator('.home-nav .nav-trigger:has-text("Build")').first();
await build.click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/dropdown-build.png', clip: { x: 0, y: 0, width: 800, height: 280 } });

// Close, then open Labs
await page.mouse.click(5, 700);
await page.waitForTimeout(200);
const labs = await page.locator('.home-nav .nav-trigger:has-text("Labs")').first();
await labs.click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/dropdown-labs.png', clip: { x: 500, y: 0, width: 940, height: 700 } });

await browser.close();
