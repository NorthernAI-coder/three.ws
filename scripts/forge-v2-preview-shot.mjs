// One-off: screenshot the /forge-v2 design preview at desktop + mobile and
// dump console errors. Delete alongside pages/forge-v2.html when the preview
// is resolved either way.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3517';
const browser = await chromium.launch();
const errors = [];

async function shot(width, height, file) {
	const page = await browser.newPage({ viewport: { width, height } });
	page.on('console', (m) => {
		if (m.type() === 'error') errors.push(`[${width}px] ${m.text()}`);
	});
	page.on('pageerror', (e) => errors.push(`[${width}px] pageerror: ${e.message}`));
	await page.goto(`${BASE}/forge-v2`, { waitUntil: 'load', timeout: 60000 });
	// Let model-viewer fetch the GLB and the engine catalog populate.
	await page.waitForTimeout(9000);
	await page.screenshot({ path: file, fullPage: true });
	await page.close();
}

await shot(1440, 940, 'reports/forge-v2-desktop.png');
await shot(390, 844, 'reports/forge-v2-mobile.png');

await browser.close();
console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'no console errors');
