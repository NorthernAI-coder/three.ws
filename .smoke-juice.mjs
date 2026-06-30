import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3000';
const PAGES = [
	{ name: 'agi', url: `${BASE}/agi`, waitMs: 6000 },
	{ name: 'alpha-copilot', url: `${BASE}/alpha-copilot`, waitMs: 9000 },
	{ name: 'reasoning-ledger', url: `${BASE}/reasoning-ledger`, waitMs: 5000 },
];

// Console messages we expect when /api is proxied to prod from a logged-out dev
// session (auth-gated endpoints, missing favicons, etc). These are NOT defects in
// the presentation work; real JS exceptions are what we hunt.
const IGNORE = [
	/Failed to load resource/i,
	/the server responded with a status/i,
	/net::ERR/i,
	/401|403|404|429|500|502|503/,
	/favicon|apple-touch|og-image|\.png|\.svg|\.webmanifest/i,
	/Download the React|Lighthouse/i,
	/agent-3d|element\.js|GLB|gltf|three\b/i, // 3D body is an enhancement, not in scope
];
const ignored = (t) => IGNORE.some((re) => re.test(t));

const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: 'new' });
let hardFail = 0;

for (const p of PAGES) {
	const page = await browser.newPage();
	const errors = [];
	page.on('console', (m) => { if (m.type() === 'error' && !ignored(m.text())) errors.push(`console: ${m.text()}`); });
	page.on('pageerror', (e) => { if (!ignored(String(e))) errors.push(`pageerror: ${e.message || e}`); });
	for (const motion of ['no-preference', 'reduce']) {
		await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: motion }]);
		await page.goto(p.url, { waitUntil: 'domcontentloaded' });
		await new Promise((r) => setTimeout(r, p.waitMs));
	}
	// Report a few signals of the juice actually mounting against real data.
	const probe = await page.evaluate(() => ({
		juiceEnter: document.querySelectorAll('.juice-enter').length,
		live: document.querySelector('.juice-live')?.dataset.state || null,
		spark: document.querySelectorAll('.juice-spark').length,
		thoughts: document.querySelectorAll('.agi-thought').length,
		launches: document.querySelectorAll('.ac-launch').length,
		entries: document.querySelectorAll('.rl-entry').length,
		ring: document.querySelectorAll('.agi-ring-val, .rl-score-arc').length,
		bodyLen: document.body.innerText.trim().length,
	}));
	console.log(`\n=== ${p.name} ===`);
	console.log('probe:', JSON.stringify(probe));
	if (errors.length) { hardFail++; console.log('ERRORS:'); errors.slice(0, 8).forEach((e) => console.log('  -', e)); }
	else console.log('no JS errors');
	await page.close();
}

await browser.close();
console.log(`\n${hardFail ? 'FAIL' : 'PASS'}: ${hardFail} page(s) with JS errors`);
process.exit(hardFail ? 1 : 0);
