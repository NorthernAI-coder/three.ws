import { chromium } from 'playwright';

const URL = process.env.PROBE_URL || 'http://localhost:3000/play';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cc-card', { timeout: 15000 });
await page.tap('.cc-card');
const phase = await page.waitForFunction(() => window.__CC__?.phase === 'world', { timeout: 60000 }).then(() => 'world').catch(() => 'TIMEOUT');

// Force the onboarding overlay visible immediately (deterministic — bypasses the
// 650ms timer + flaky connect timing). _showOverlay is idempotent.
const forced = await page.evaluate(() => {
	const ob = window.__CC__?._onboard;
	if (!ob) return 'no-onboard';
	ob._showOverlay();
	const ov = document.getElementById('po-overlay');
	if (ov) ov.classList.add('po-show');
	return ov ? 'shown' : 'failed';
});
await page.waitForTimeout(150);

const r = await page.evaluate(() => {
	const ov = document.getElementById('po-overlay');
	const card = document.querySelector('.po-card');
	const joy = document.getElementById('cc-joystick');
	const cs = (e) => e ? getComputedStyle(e) : null;
	const hit = (el) => {
		const b = el.getBoundingClientRect();
		const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
		return t ? (t.id ? '#' + t.id : t.tagName + '.' + String(t.className).split(' ').filter(Boolean)[0]) : null;
	};
	const primaryBtn = document.querySelector('#po-overlay .po-btn-primary') || document.querySelector('#po-overlay .po-close');
	return {
		bodyOnboarding: document.body.classList.contains('po-onboarding'),
		overlayPE: cs(ov)?.pointerEvents,
		cardPE: cs(card)?.pointerEvents,
		joyZ: cs(joy)?.zIndex,
		hitAtJoystick: hit(joy),
		primaryBtnInCard: primaryBtn ? !!primaryBtn.closest('.po-card') : false,
	};
});

console.log('phase                 :', phase);
console.log('forced overlay        :', forced);
console.log('body.po-onboarding    :', r.bodyOnboarding);
console.log('#po-overlay pointerEv :', r.overlayPE, '(want none)');
console.log('.po-card  pointerEv   :', r.cardPE, '(want auto)');
console.log('#cc-joystick z-index  :', r.joyZ, '(want 60 while onboarding)');
console.log('hit @ joystick centre :', r.hitAtJoystick, '(want #cc-joystick)');
console.log('primary btn in card   :', r.primaryBtnInCard);

const pass = r.overlayPE === 'none' && r.cardPE === 'auto' && r.joyZ === '60' && r.hitAtJoystick === '#cc-joystick' && r.primaryBtnInCard;
console.log('\nRESULT:', pass ? 'PASS' : 'FAIL');
await browser.close();
