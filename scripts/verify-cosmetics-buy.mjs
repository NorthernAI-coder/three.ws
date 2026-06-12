// Browser check for the cosmetics shop x402 wiring: open /play, open the
// Cosmetics shop, click a premium item's Buy button, and assert the x402
// payment widget loads and mounts its modal (the link that was broken — /play
// never shipped /x402.js, so Buy died on "payment widget still loading").
// A real settlement needs a funded wallet; this verifies up to the wallet UI.
//
// Usage: node scripts/verify-cosmetics-buy.mjs [BASE_URL]   (default http://localhost:4173)

import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const x402Requests = [];
page.on('request', (r) => { if (r.url().includes('x402')) x402Requests.push(r.url()); });

await page.goto(`${BASE}/play`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

// Skip the first-buy wallet explainer so the flow goes straight to the payment
// widget — the link this check exists to exercise.
await page.evaluate(() => localStorage.setItem('tws:onchain-primer:done', '1'));

// The shop is lazy-built on the HUD Shop button — click it once the world's
// HUD mounts. Dismiss the first-join onboarding overlay if it's in the way.
await page.waitForSelector('.cc-shop-btn', { state: 'attached', timeout: 90_000 });
await page.evaluate(() => {
	document.querySelector('.cc-onboard, .cc-onboard-overlay')?.remove();
	// The HUD button may be display:none until the player formally joins a
	// world; the handler itself is wired at construction — invoke it directly.
	document.querySelector('.cc-shop-btn').click();
});
// Function-based waits — selector state checks proved flaky against the live
// site (resolved-but-"not visible" stalls on a plainly visible node).
await page.waitForFunction(() => {
	const n = document.getElementById('cc-shop');
	return n && !n.hidden;
}, { timeout: 30_000 });

// Wait for the real catalog to render, then click a premium Buy.
await page.waitForFunction(() => !!document.querySelector('.cc-shop-card .cc-shop-buy'), { timeout: 30_000 });
const buyLabel = await page.evaluate(() => {
	const b = document.querySelector('.cc-shop-buy');
	const label = b.getAttribute('aria-label');
	b.click();
	return label;
});
console.log('clicking:', buyLabel);

// Success = the x402 SDK was fetched and window.X402.pay mounted its modal.
await page.waitForFunction(() => window.X402 && typeof window.X402.pay === 'function', { timeout: 30_000 });
console.log('x402 SDK loaded: window.X402.pay is live');

// The widget mounts a dialog/overlay; give it a beat and look for it.
const modalSelector = '[class*="x402"], [id*="x402"], dialog';
await page.waitForSelector(modalSelector, { state: 'attached', timeout: 30_000 });
const modalInfo = await page.evaluate((sel) => {
	const n = document.querySelector(sel);
	return n ? `${n.tagName.toLowerCase()}.${n.className || n.id}` : null;
}, modalSelector);
console.log('payment UI mounted:', modalInfo);

const fetched402 = x402Requests.filter((u) => u.includes('/x402.js') || u.includes('cosmetic-purchase'));
console.log('x402 network activity:', fetched402.slice(0, 5));

await page.screenshot({ path: '/tmp/cosmetics-buy-check.png', fullPage: false });
console.log('screenshot: /tmp/cosmetics-buy-check.png');

const fatal = errors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
if (fatal.length) {
	console.error('console errors:', fatal.slice(0, 10));
	process.exitCode = 1;
}
await browser.close();
