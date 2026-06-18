import { chromium } from 'playwright';
const URL = process.env.PROBE_URL || 'http://localhost:3100/play';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cc-card', { timeout: 15000 });
const cardInfo = await page.evaluate(() => {
	const c = document.querySelector('.cc-card');
	return { count: document.querySelectorAll('.cc-card').length, firstText: c?.textContent?.slice(0, 60) };
});
await page.tap('.cc-card');
for (let i = 0; i < 16; i++) {
	await page.waitForTimeout(1500);
	const s = await page.evaluate(() => {
		const g = window.__CC__;
		return { phase: g?.phase, net: g?.net?.status, hasRig: !!g?.localRig };
	});
	console.log(`t+${((i + 1) * 1.5).toFixed(1)}s  phase=${s.phase}  net=${s.net}  rig=${s.hasRig}`);
	if (s.phase === 'world') break;
}
console.log('cards:', JSON.stringify(cardInfo));
console.log('errors:', errs.slice(0, 8).join(' | ') || 'none');
await browser.close();
