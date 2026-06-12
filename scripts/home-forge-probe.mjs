// One-off browser probe for the homepage mini Forge section.
// Usage: node scripts/home-forge-probe.mjs [--generate]
//   --generate runs a real text→3D job against the proxied production API.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3171';
const doGenerate = process.argv.includes('--generate');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

const consoleErrors = [];
page.on('console', (msg) => {
	if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#home-forge').scrollIntoViewIfNeeded();
await page.waitForTimeout(1500); // let the lazy module import + boot

const section = page.locator('#home-forge');
console.log('section visible:', await section.isVisible());
console.log('idle state visible:', await section.locator('[data-hf-idle]').isVisible());
console.log('chips:', await section.locator('.hf-chip').count());
console.log('full-forge CTA href:', await section.locator('a[href="/forge"]').first().getAttribute('href'));

await page.screenshot({ path: 'reports/home-forge-idle.png', clip: (await section.boundingBox()) || undefined });

if (doGenerate) {
	await section.locator('[data-hf-prompt]').fill('a glazed ceramic teapot, studio lighting');
	await section.locator('[data-hf-generate]').click();
	console.log('generating state visible:', await section.locator('[data-hf-generating]').isVisible());
	await page.screenshot({ path: 'reports/home-forge-generating.png', clip: (await section.boundingBox()) || undefined });

	// Wait up to 4 minutes for a result or error.
	const outcome = await Promise.race([
		section.locator('[data-hf-result]:not([hidden])').waitFor({ timeout: 240000 }).then(() => 'result'),
		section.locator('[data-hf-error]:not([hidden])').waitFor({ timeout: 240000 }).then(() => 'error'),
	]).catch(() => 'timeout');
	console.log('outcome:', outcome);
	if (outcome === 'result') {
		await page.waitForTimeout(4000); // let model-viewer render the GLB
		console.log('download href:', await section.locator('[data-hf-download]').getAttribute('href'));
		console.log('meta:', await section.locator('[data-hf-result-meta]').textContent());
	}
	if (outcome === 'error') {
		console.log('error message:', await section.locator('[data-hf-error-message]').textContent());
	}
	await page.screenshot({ path: 'reports/home-forge-final.png', clip: (await section.boundingBox()) || undefined });
}

console.log('console errors:', JSON.stringify(consoleErrors.filter((e) => !/ajax\.googleapis|_vercel/.test(e)), null, 1));
await browser.close();
