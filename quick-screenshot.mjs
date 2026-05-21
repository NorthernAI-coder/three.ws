import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/marketplace', { waitUntil: 'networkidle' });
await page.waitForSelector('.home-nav .nav-root', { timeout: 5000 });
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/full-top.png', clip: { x: 0, y: 0, width: 1440, height: 200 } });
await browser.close();
