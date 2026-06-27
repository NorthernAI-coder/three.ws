// Temporary browser verification for /capture — drives the point-cloud renderer
// client-side (sample cloud + real .ply upload), checks states + console health.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const PLY = process.env.PLY_PATH;
const SHOT = process.env.SHOT || '/tmp/capture.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[error] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e}`));

await page.goto(`${BASE}/capture`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#pc-stage', { timeout: 15000 });

const h1 = (await page.textContent('.pc-head h1'))?.trim();
console.log('h1:', JSON.stringify(h1));
console.log('idle overlay visible:', await page.isVisible('#pc-idle'));

// 1) Sample cloud render.
await page.click('#pc-sample');
await page.waitForSelector('#pc-host canvas', { timeout: 15000 });
await page.waitForFunctionTimeout?.(() => {}, 0).catch(() => {});
await page.waitForFunction(() => !document.getElementById('pc-hud').hidden, { timeout: 15000 });
const sampleLabel = (await page.textContent('#pc-hud-label'))?.trim();
const canvasBox = await page.$eval('#pc-host canvas', (c) => ({ w: c.width, h: c.height }));
console.log('SAMPLE → hud label:', JSON.stringify(sampleLabel), 'canvas:', canvasBox);
console.log('point-size slider enabled:', await page.isEnabled('#pc-size'));

// Verify the canvas actually painted non-black pixels (the cloud is visible).
const painted = await page.$eval('#pc-host canvas', (c) => {
	const gl = c.getContext('webgl2') || c.getContext('webgl');
	const px = new Uint8Array(4 * 64);
	// sample a small strip near the centre
	const x = Math.floor(c.width / 2), y = Math.floor(c.height / 2);
	gl.readPixels(x, y, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, px);
	let lit = 0;
	for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
	return lit;
});
console.log('lit centre pixels (of 64):', painted);

// 2) Interactions: point size + recenter (must not throw).
await page.fill('#pc-size', '2.4').catch(async () => { await page.$eval('#pc-size', (e) => { e.value = '2.4'; e.dispatchEvent(new Event('input', { bubbles: true })); }); });
await page.click('#pc-recenter');
await page.waitForTimeout(400);

// 3) Real .ply upload (worker-format file) → exact point count in HUD.
if (PLY) {
	await page.setInputFiles('#pc-file', PLY);
	await page.waitForFunction(() => /\d+ points/.test(document.getElementById('pc-hud-label').textContent), { timeout: 15000 });
	const plyLabel = (await page.textContent('#pc-hud-label'))?.trim();
	console.log('PLY UPLOAD → hud label:', JSON.stringify(plyLabel));
	console.log('download button visible:', await page.isVisible('#pc-download'));
}

// 4) Responsive sanity at mobile width.
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(300);
const stageW = await page.$eval('#pc-stage', (e) => e.getBoundingClientRect().width);
console.log('mobile stage width:', Math.round(stageW));
await page.setViewportSize({ width: 1440, height: 900 });

await page.screenshot({ path: SHOT });
console.log('screenshot:', SHOT);
console.log('CONSOLE ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
