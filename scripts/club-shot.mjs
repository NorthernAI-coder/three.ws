import { chromium } from 'playwright';

const URL = process.env.CLUB_URL || 'http://localhost:3001/club';
const OUT = process.env.OUT || '/tmp/club.png';
const SETTLE = Number(process.env.SETTLE || 9000);

const browser = await chromium.launch({
	args: [
		'--no-sandbox',
		'--disable-dev-shm-usage',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-swiftshader',
		'--use-gl=angle',
		'--use-angle=swiftshader',
	],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
	const future = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
	localStorage.setItem('club:pass:v1', JSON.stringify({
		passId: 'dev', tier: 'regular', visits: 1,
		expiresAt: future, wallet: 'devwallet', issuedAt: new Date().toISOString(),
	}));
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(SETTLE);
const state = await page.evaluate(() => (window.__clubStations || []).map((s) => ({
	idx: s.idx, id: s.id,
	curr: s.anim?.currentName ?? null,
	clips: s.anim ? [...(s.anim.clips?.keys?.() || [])] : null,
	actions: s.anim ? [...s.anim.actions.keys()] : null,
	fallen: s.anim?._fallen ? [...s.anim._fallen] : null,
	failed: s.anim?._failed ? [...s.anim._failed] : null,
	idleWeight: (() => { const a = s.anim?.actions?.get('idle'); return a ? +a.getEffectiveWeight().toFixed(2) : null; })(),
	mixerTime: s.anim?.mixer?.time ?? null,
})));
console.log('STATE', JSON.stringify(state));
await page.screenshot({ path: OUT, timeout: 90000, animations: 'disabled' });
console.log('saved', OUT);
console.log('--- console errors/warnings ---');
console.log(errors.slice(0, 40).join('\n'));
await browser.close();
