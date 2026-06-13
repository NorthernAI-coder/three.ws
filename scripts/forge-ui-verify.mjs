// Focused browser verification of the /forge engine picker + BYOK flow against a
// live deployment. Confirms: page loads clean, every catalog engine renders as a
// button, BYOK engines reveal a key row with the right provider label + mint
// link, and the estimate line populates. Read-only — never submits a generation.
//
//   BASE_URL=https://three.ws node scripts/forge-ui-verify.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://three.ws';
const out = [];
const log = (...a) => { out.push(a.join(' ')); console.log(...a); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(`${BASE}/forge`, { waitUntil: 'domcontentloaded' });
// Catalog is fetched on load and builds the engine buttons; wait for them.
await page.waitForSelector('#engine button', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);

// 1. Engine buttons present.
const engines = await page.$$eval('#engine button', (btns) =>
	btns.map((b) => ({
		id: b.dataset.engine,
		label: b.textContent.trim(),
		byok: b.dataset.byok || '',
		path: b.dataset.path,
		disabled: b.disabled,
		title: b.title,
	})),
);
log(`\n=== /forge engine picker (${engines.length} engines) ===`);
for (const e of engines) log(`  ${e.label.padEnd(12)} id=${e.id.padEnd(14)} byok=${(e.byok||'-').padEnd(10)} path=${e.path}`);

// 2. For each BYOK engine, click it and confirm the key row + provider link.
log(`\n=== BYOK key-row flow ===`);
const byokEngines = engines.filter((e) => e.byok);
for (const e of byokEngines) {
	await page.click(`#engine button[data-engine="${e.id}"]`).catch(() => {});
	await page.waitForTimeout(300);
	const row = await page.evaluate(() => {
		const r = document.getElementById('byok-row');
		const hidden = r?.classList.contains('is-hidden');
		const label = document.getElementById('byok-label')?.textContent || '';
		const link = document.querySelector('#byok-hint a')?.getAttribute('href') || '';
		const estimate = document.getElementById('estimate')?.textContent || '';
		return { hidden, label, link, estimate };
	});
	log(`  ${e.label.padEnd(12)} keyRowVisible=${!row.hidden}  label="${row.label}"  link=${row.link}`);
	log(`               estimate: ${row.estimate}`);
}

// 3. Tier buttons.
const tiers = await page.$$eval('#tier button', (b) => b.map((x) => x.dataset.tier));
log(`\n=== tiers: ${tiers.join(', ')} ===`);

// 4. Console / page errors.
log(`\n=== console errors/warnings (${consoleErrors.length}) ===`);
consoleErrors.slice(0, 20).forEach((e) => log('  ' + e));
log(`\n=== uncaught page errors (${pageErrors.length}) ===`);
pageErrors.slice(0, 10).forEach((e) => log('  ' + e));

await page.screenshot({ path: 'reports/forge-ui-verify.png', fullPage: false });
// Close-up of the quality/engine block so the BYOK key glyphs are legible.
const fq = await page.$('#forge-quality');
if (fq) await fq.screenshot({ path: 'reports/forge-engine-picker.png' });
log('\nscreenshots → reports/forge-ui-verify.png, reports/forge-engine-picker.png');

await browser.close();
