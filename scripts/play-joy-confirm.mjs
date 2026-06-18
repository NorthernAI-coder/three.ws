import { chromium } from 'playwright';

const URL = process.env.PROBE_URL || 'http://localhost:3000/play';
const browser = await chromium.launch();

// Returning user: onboarding already dismissed (cc-onboarded-v1 set).
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { try { localStorage.setItem('cc-onboarded-v1', '1'); } catch {} });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cc-card', { timeout: 15000 });
await page.tap('.cc-card');
await page.waitForFunction(() => window.__CC__?.phase === 'world', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);

const onboardingPresent = await page.evaluate(() => !!document.getElementById('po-overlay'));

// Try to move with the joystick via touch drag.
const before = await page.evaluate(() => ({ ...window.__CC__.localPos }));
const box = await page.evaluate(() => {
	const z = document.getElementById('cc-joystick');
	const r = z.getBoundingClientRect();
	return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
// Touchscreen drag up
await page.touchscreen.tap(box.cx, box.cy); // ensure touch supported
// Use raw pointer for hold-drag
await page.mouse.move(box.cx, box.cy);
await page.mouse.down();
await page.mouse.move(box.cx, box.cy - 55, { steps: 5 });
await page.waitForTimeout(500);
const joyVec = await page.evaluate(() => window.__CC__._joy);
const during = await page.evaluate(() => ({ ...window.__CC__.localPos }));
await page.mouse.up();

const moved = Math.abs(before.x - during.x) > 0.02 || Math.abs(before.z - during.z) > 0.02;
console.log('onboardingPresent:', onboardingPresent);
console.log('joyVec:', JSON.stringify(joyVec));
console.log('before:', JSON.stringify(before), 'during:', JSON.stringify(during));
console.log('MOVED:', moved);

await browser.close();
