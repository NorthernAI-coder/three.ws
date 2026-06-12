import { chromium } from 'playwright';
const base = 'http://localhost:3123';
const browser = await chromium.launch();

// Desktop 1440
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.nav-main a.nav-hot', { timeout: 10000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/shot-home-hero-1440.png', clip: { x: 0, y: 0, width: 1440, height: 760 } });

// Build dropdown open
await page.hover('.nav-grp:first-child .nav-trigger');
await page.click('.nav-grp:first-child .nav-trigger');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/shot-nav-build-menu.png', clip: { x: 0, y: 0, width: 900, height: 620 } });

// nav-hot hover state
await page.keyboard.press('Escape');
await page.hover('.nav-main a.nav-hot');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/shot-nav-hot-hover.png', clip: { x: 0, y: 0, width: 1440, height: 64 } });

// /create featured card
await page.goto(base + '/create', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#card-prompt', { timeout: 10000 });
await page.waitForTimeout(1000);
const ex1 = await page.locator('#card-prompt-example').innerText();
await page.locator('#card-prompt').scrollIntoViewIfNeeded();
await page.screenshot({ path: '/tmp/shot-create-card.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });
await page.waitForTimeout(7000);
const ex2 = await page.locator('#card-prompt-example').innerText();
console.log('typewriter cycling:', JSON.stringify(ex1), '->', JSON.stringify(ex2), ex1 !== ex2 ? 'OK' : 'NOT CYCLING (may be mid-hold)');

// hover the featured card
await page.hover('#card-prompt');
await page.waitForTimeout(300);
const card = await page.locator('#card-prompt').boundingBox();
await page.screenshot({ path: '/tmp/shot-create-card-hover.png', clip: { x: Math.max(0, card.x - 20), y: Math.max(0, card.y - 20), width: 560, height: 380 } });

// Light theme nav
await page.evaluate(() => { localStorage.setItem('twx_theme', 'light'); });
await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.nav-main a.nav-hot', { timeout: 10000 });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/shot-nav-light.png', clip: { x: 0, y: 0, width: 1440, height: 64 } });
await page.evaluate(() => { localStorage.setItem('twx_theme', 'auto'); });

// Mobile 375 drawer
const m = await browser.newPage({ viewport: { width: 375, height: 720 } });
await m.goto(base + '/', { waitUntil: 'domcontentloaded' });
await m.waitForSelector('.nav-toggle', { timeout: 10000 });
await m.click('.nav-toggle');
await m.waitForTimeout(500);
await m.screenshot({ path: '/tmp/shot-drawer-375.png' });
// drawer hot link present?
const drawerHot = await m.locator('.nav-drawer a.nav-hot').count();
console.log('drawer hot link:', drawerHot);

// Mobile hero
await m.click('.nav-toggle');
await m.waitForTimeout(300);
await m.screenshot({ path: '/tmp/shot-home-375.png' });

await browser.close();
console.log('done');
