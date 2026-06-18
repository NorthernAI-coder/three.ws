import { chromium } from 'playwright';
const URL = process.env.PROBE_URL || 'http://localhost:3100/play';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
page.on('console', (m) => {
	const txt = m.text();
	if (/GL Driver|ReadPixels|GPU stall|\[vite\]|favicon/.test(txt)) return;
	if (/avatar|meshopt|manifest|loadAll|stand-in|connect|net|onboard|world|phase|gate|access|pass/i.test(txt))
		console.log(`${stamp()}s [${m.type()}] ${txt.slice(0, 110)}`);
});
page.on('pageerror', (e) => console.log(`${stamp()}s PAGEERROR ${e.message.slice(0, 110)}`));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cc-card', { timeout: 20000 });
await page.tap('.cc-card');
console.log(`${stamp()}s clicked card`);
for (let i = 0; i < 40; i++) {
	await page.waitForTimeout(2000);
	const s = await page.evaluate(() => ({ phase: window.__CC__?.phase, net: window.__CC__?.net?.status }));
	if (s.phase === 'world') { console.log(`${stamp()}s REACHED world (net=${s.net})`); break; }
	if (i % 3 === 0) console.log(`${stamp()}s phase=${s.phase} net=${s.net}`);
}
await browser.close();
