import { chromium } from 'playwright';

const URL = process.env.PROBE_URL || 'http://localhost:3000/play';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cc-card', { timeout: 15000 });
await page.tap('.cc-card');
await page.waitForFunction(() => window.__CC__?.phase === 'world', { timeout: 20000 }).catch(() => {});
// Wait for the onboarding overlay to actually appear (650ms delay after build).
const onboardUp = await page.waitForFunction(() => document.getElementById('po-overlay')?.classList.contains('po-show'), { timeout: 6000 }).then(() => true).catch(() => false);

const pre = await page.evaluate(() => {
	const z = document.getElementById('cc-joystick');
	const r = z.getBoundingClientRect();
	const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
	const top = document.elementFromPoint(cx, cy);
	return { onboardUp: !!document.getElementById('po-overlay'), topAtJoystick: top ? (top.id ? '#' + top.id : top.tagName + '.' + String(top.className).split(' ')[0]) : null, cx, cy };
});

// Drag the joystick up WHILE the onboarding card is still showing.
const before = await page.evaluate(() => ({ ...window.__CC__.localPos }));
await page.mouse.move(pre.cx, pre.cy);
await page.mouse.down();
await page.mouse.move(pre.cx, pre.cy - 55, { steps: 6 });
await page.waitForTimeout(500);
const joyVec = await page.evaluate(() => window.__CC__._joy);
const during = await page.evaluate(() => ({ ...window.__CC__.localPos }));
await page.mouse.up();
const movedDuringOnboarding = Math.abs(before.x - during.x) > 0.02 || Math.abs(before.z - during.z) > 0.02;

// The card must still be interactive: tap "Enter the world"/close to dismiss.
const cardWorks = await page.evaluate(() => {
	const btn = document.querySelector('#po-overlay .po-close') || document.querySelector('#po-overlay .po-btn-primary');
	if (!btn) return 'no-button';
	btn.click();
	return 'clicked';
});
await page.waitForTimeout(400);
const dismissed = await page.evaluate(() => !document.getElementById('po-overlay'));

console.log('onboarding shown      :', onboardUp);
console.log('topAtJoystick         :', pre.topAtJoystick, '(want #cc-joystick — backdrop no longer eats input)');
console.log('joyVec during onboard :', JSON.stringify(joyVec));
console.log('MOVED during onboarding:', movedDuringOnboarding);
console.log('card button           :', cardWorks, '=> dismissed:', dismissed);

await browser.close();
