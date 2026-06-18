import { chromium } from 'playwright';

const URL = process.env.PROBE_URL || 'http://localhost:3000/play';
const browser = await chromium.launch();
// First-time touch user — fresh storage, so onboarding shows.
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cc-card', { timeout: 15000 });
await page.tap('.cc-card');
await page.waitForFunction(() => window.__CC__?.phase === 'world', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1300); // let onboarding (650ms delay) appear

const pre = await page.evaluate(() => {
	const z = document.getElementById('cc-joystick');
	const r = z.getBoundingClientRect();
	const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
	const top = document.elementFromPoint(cx, cy);
	return {
		onboardingUp: !!document.getElementById('po-overlay'),
		topAtJoystick: top ? (top.id ? '#' + top.id : top.tagName + '.' + String(top.className).split(' ')[0]) : null,
		cx, cy,
	};
});

const before = await page.evaluate(() => ({ ...window.__CC__.localPos }));
await page.mouse.move(pre.cx, pre.cy);
await page.mouse.down();
await page.mouse.move(pre.cx, pre.cy - 55, { steps: 5 });
await page.waitForTimeout(450);
const joyVec = await page.evaluate(() => window.__CC__._joy);
const during = await page.evaluate(() => ({ ...window.__CC__.localPos }));
await page.mouse.up();

const moved = Math.abs(before.x - during.x) > 0.02 || Math.abs(before.z - during.z) > 0.02;
console.log('onboardingUp     :', pre.onboardingUp);
console.log('topAtJoystick    :', pre.topAtJoystick);
console.log('joyVec           :', JSON.stringify(joyVec));
console.log('MOVED (joystick) :', moved);

await browser.close();
