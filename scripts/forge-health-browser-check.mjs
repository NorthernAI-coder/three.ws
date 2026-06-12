// One-off verification: load /forge in a real browser, confirm the engine
// selector renders, the ?health fetch fires, and no console errors come from
// our code. Run: node scripts/forge-health-browser-check.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173';
const browser = await chromium.launch({
	args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
});
const page = await browser.newPage();
// The model-viewer WebGL component crashes headless Chromium in this sandbox
// and is irrelevant to the engine-selector check — block it.
await page.route('**/model-viewer*', (route) => route.abort());

const consoleErrors = [];
page.on('console', (msg) => {
	if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

let healthRequest = null;
let healthStatus = null;
page.on('request', (req) => {
	if (req.url().includes('forge?health')) healthRequest = req.url();
});
page.on('response', (res) => {
	if (res.url().includes('forge?health')) healthStatus = res.status();
});

await page.goto(`${BASE}/forge`, { waitUntil: 'domcontentloaded' });
// Engine buttons render after the catalog fetch resolves.
await page.waitForSelector('#engine button', { timeout: 20_000 });
await page.waitForTimeout(3_000); // let the health fetch land

const engines = await page.$$eval('#engine button', (btns) =>
	btns.map((b) => ({
		backend: b.dataset.backend,
		label: b.textContent.trim(),
		disabled: b.disabled,
		health: b.dataset.health || null,
		title: b.title,
	})),
);

console.log('health fetch:', healthRequest, '→', healthStatus);
console.log('engine buttons:');
for (const e of engines) {
	console.log(
		` ${e.disabled ? '✗' : '✓'} ${e.backend} (${e.label}) health=${e.health ?? '–'} title="${e.title}"`,
	);
}
console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');

await page.screenshot({ path: '/tmp/forge-engine-check.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });
await browser.close();
process.exit(consoleErrors.length ? 1 : 0);
