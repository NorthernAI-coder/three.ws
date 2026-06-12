// One-off check: drive the homepage mini Forge end-to-end against a real
// deployment (BASE_URL, default https://three.ws) and report what the user
// would actually see. Usage: node scripts/verify-home-forge.mjs
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'https://three.ws';

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => {
	if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));
const forgeRequests = [];
page.on('response', async (res) => {
	if (res.url().includes('/api/forge')) {
		let body = '';
		try { body = (await res.text()).slice(0, 400); } catch {}
		forgeRequests.push(`${res.request().method()} ${res.url()} → ${res.status()} ${body}`);
	}
});

await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const section = page.locator('#home-forge');
console.log('section present:', await section.count());

await section.scrollIntoViewIfNeeded();
// Give the IntersectionObserver-gated module a moment to import and boot.
await page.waitForTimeout(4000);

const promptBox = page.locator('#hf-prompt-input');
console.log('prompt box visible:', await promptBox.isVisible().catch(() => false));

await promptBox.fill('a glazed ceramic teapot, studio lighting');
await page.locator('[data-hf-generate]').click();
console.log('clicked Forge, waiting for result/error…');

const outcome = await Promise.race([
	page.locator('[data-hf-result]:not([hidden]) model-viewer').waitFor({ timeout: 120000 }).then(() => 'RESULT'),
	page.locator('[data-hf-error]:not([hidden])').waitFor({ timeout: 120000 }).then(() => 'ERROR'),
]).catch(() => 'TIMEOUT');
console.log('outcome:', outcome);
if (outcome === 'ERROR') {
	console.log('error message:', await page.locator('[data-hf-error-message]').textContent());
}
if (outcome === 'RESULT') {
	console.log('glb src:', await page.locator('[data-hf-result] model-viewer').getAttribute('src'));
}
console.log('\n/api/forge traffic:');
forgeRequests.forEach((r) => console.log(' ', r));
console.log('\nconsole errors/warnings:');
consoleErrors.slice(0, 20).forEach((e) => console.log(' ', e));

await page.screenshot({ path: 'reports/home-forge-verify.png', clip: (await section.boundingBox()) || undefined });
await browser.close();
