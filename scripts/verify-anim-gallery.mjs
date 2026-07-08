// One-off verification script for roadmap prompt 03 — NOT committed to the
// permanent scripts/ surface (deleted at the end of the run per CLAUDE.md
// repo-hygiene: no throwaway scripts in the root, and this one has no lasting
// product purpose beyond this verification pass).
import { chromium } from 'playwright';

const NEW_CLIPS = ['nod', 'shrug', 'point', 'think', 'turn', 'jog', 'sitloop', 'sitidle'];

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (msg) => {
	if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));
const failedRequests = [];
page.on('requestfailed', (req) => failedRequests.push(`FAILED ${req.url()} (${req.failure()?.errorText})`));
page.on('response', (res) => { if (res.status() === 404) failedRequests.push(`404 ${res.url()}`); });

await page.goto('http://localhost:3050/animations', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);

const manifestClips = await page.evaluate(async () => {
	const res = await fetch('/animations/manifest.json');
	const json = await res.json();
	return json.map((c) => c.name);
});

console.log('Manifest clip count:', manifestClips.length);
for (const name of NEW_CLIPS) {
	console.log(`  ${manifestClips.includes(name) ? 'OK  ' : 'MISS'} ${name}`);
}

const cardCount = await page.locator('.ag-card').count();
console.log('Gallery cards found (unfiltered):', cardCount);

const LABELS = { nod: 'Nod', shrug: 'Shrug', point: 'Point', think: 'Think', turn: 'Turn', jog: 'Jog', sitloop: 'Sitting Idle', sitidle: 'Sit Idle' };
const searchSel = '[data-role="search"]';
for (const name of NEW_CLIPS) {
	await page.fill(searchSel, LABELS[name]);
	await page.waitForTimeout(500);
	const titles = await page.locator('.ag-card-title').allTextContents();
	console.log(`  search "${LABELS[name]}":`, titles.includes(LABELS[name]) ? 'FOUND + rendered' : `NOT FOUND (got: ${titles.slice(0, 5).join(', ')})`);
}
await page.fill(searchSel, '');

console.log('\nFailed/404 requests:', failedRequests.length);
for (const f of failedRequests.slice(0, 20)) console.log('  ', f);

console.log('\nConsole errors:', consoleErrors.length);
for (const e of consoleErrors.slice(0, 20)) console.log('  ERR:', e);
console.log('Page errors:', pageErrors.length);
for (const e of pageErrors.slice(0, 20)) console.log('  PAGEERR:', e);

await page.screenshot({ path: 'prompts/roadmap/_generated/03/animations-gallery.png', fullPage: false });

await browser.close();
process.exit(consoleErrors.length || pageErrors.length ? 1 : 0);
