// Drive the homepage mini Forge end-to-end and report what a user sees.
//
//   BASE_URL=https://three.ws node scripts/verify-home-forge.mjs   # against prod
//   node scripts/verify-home-forge.mjs                             # local dev,
//        proxying /api/forge to PROXY_API (default prod) so generation is real.
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5191';
const PROXY_API = process.env.PROXY_API || 'https://three.ws';
const PROXY = !/^https:\/\/three\.ws/.test(BASE_URL); // proxy only when local

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

const problems = [];
page.on('console', (m) => {
	if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

// When testing local UI, forward the API to a real deployment so the GLB is real.
if (PROXY) {
	await page.route('**/api/forge*', async (route) => {
		const req = route.request();
		const resp = await ctx.request.fetch(PROXY_API + new URL(req.url()).pathname + new URL(req.url()).search, {
			method: req.method(),
			headers: req.headers(),
			data: req.postData() || undefined,
		});
		route.fulfill({ status: resp.status(), headers: resp.headers(), body: await resp.body() });
	});
}

await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const section = page.locator('#home-forge');
await section.scrollIntoViewIfNeeded();
await page.waitForTimeout(3500);
console.log('section present:', await section.count(), '| prompt visible:', await page.locator('#hf-prompt-input').isVisible());

async function forge(prompt) {
	await page.locator('#hf-prompt-input').fill(prompt);
	await page.locator('[data-hf-generate]').click();
	const outcome = await Promise.race([
		page.locator('[data-hf-result]:not([hidden]) model-viewer').waitFor({ timeout: 150000 }).then(() => 'RESULT'),
		page.locator('[data-hf-error]:not([hidden])').waitFor({ timeout: 150000 }).then(() => 'ERROR'),
	]).catch(() => 'TIMEOUT');
	if (outcome !== 'RESULT') {
		console.log(`  forge("${prompt}") → ${outcome}:`, await page.locator('[data-hf-error-message]').textContent().catch(() => ''));
		return false;
	}
	await page.waitForFunction(() => { const mv = document.querySelector('#home-forge model-viewer'); return mv && mv.loaded; }, { timeout: 60000 }).catch(() => {});
	await page.waitForTimeout(2000); // let the thumbnail capture land
	console.log(`  forge("${prompt}") → RESULT`);
	return true;
}

console.log('\nForging two models…');
await forge('a glazed ceramic teapot, studio lighting');
await forge('a low-poly red fox, sitting');

// History rail should now hold both, with real thumbnails.
const thumbs = page.locator('#home-forge .hf-thumb');
const thumbCount = await thumbs.count();
const withImage = await page.locator('#home-forge .hf-thumb[style*="background-image"]').count();
console.log(`\nhistory thumbnails: ${thumbCount} (with captured image: ${withImage})`);

// Toolbar wiring.
console.log('Scene Studio href:', await page.locator('[data-hf-scene]').getAttribute('href'));
console.log('Download href:', (await page.locator('[data-hf-download]').getAttribute('href') || '').slice(0, 60) + '…');
console.log('AR attr on viewer:', await page.locator('#home-forge model-viewer').getAttribute('ar') !== null);

// Auto-rotate toggle.
const beforePressed = await page.locator('[data-hf-spin]').getAttribute('aria-pressed');
await page.locator('[data-hf-spin]').click();
const afterPressed = await page.locator('[data-hf-spin]').getAttribute('aria-pressed');
console.log(`auto-rotate toggle: ${beforePressed} → ${afterPressed}`);

// Copy share link → toast.
await page.locator('[data-hf-share]').click();
await page.waitForTimeout(400);
console.log('share toast:', (await page.locator('[data-hf-toast]').textContent().catch(() => '')) || '(none)');

// Reload from history: click the older (second) thumbnail.
if (thumbCount >= 2) {
	const targetGlb = await thumbs.nth(1).getAttribute('data-glb');
	await thumbs.nth(1).click();
	await page.waitForTimeout(1500);
	const liveSrc = await page.locator('#home-forge model-viewer').getAttribute('src');
	console.log('reload-from-history matched:', liveSrc === targetGlb);
	console.log('active thumb marked:', await thumbs.nth(1).getAttribute('aria-current'));
}

console.log('\nconsole errors/warnings:', problems.length);
problems.slice(0, 15).forEach((p) => console.log('  ', p));

await section.screenshot({ path: 'reports/home-forge-improved.png' });
await browser.close();
console.log('\nscreenshot → reports/home-forge-improved.png');
