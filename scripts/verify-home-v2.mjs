import { chromium } from 'playwright';

/**
 * Verifies the v2 hero markup, click wiring, and DOM state without booting any
 * real WebGL contexts. The hosted headless chromium in this Codespace cannot
 * sustain multiple Three.js + model-viewer canvases on this page (GPU stall →
 * page crash). The actual rendering is exercised by users in real browsers;
 * here we just confirm the interactive surface behaves correctly:
 *
 *   - chip strip + TRY ME badge are in the DOM at the right spot
 *   - clicking a chip dispatches to viewer.playClip(name)
 *   - clicking dismisses the TRY ME badge
 *   - the click counter increments on every real interaction
 *
 * We do this by replacing window.Act2Viewer with a recording stub injected
 * before the page scripts run.
 */

const browser = await chromium.launch({
	args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2', '--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Stub Act2Viewer + neutralize model-viewer before any page script runs.
await ctx.addInitScript(() => {
	window.__playedClips = [];
	window.__viewerLoads = [];
	class StubViewer {
		constructor(canvas) {
			this.canvas = canvas;
			this._manifest = [
				{ name: 'idle', loop: true },
				{ name: 'dance', loop: true },
				{ name: 'wave', loop: false },
				{ name: 'capoeira', loop: true },
				{ name: 'jump', loop: false },
				{ name: 'thriller', loop: false },
				{ name: 'falling', loop: false },
				{ name: 'pray', loop: false },
			];
			this.currentAction = { getClip: () => ({ duration: 0.05 }) };
			this.mixer = { stopAllAction: () => {} };
			this.model = { position: { x: 0 }, traverse: () => {} };
			queueMicrotask(() => {
				if (typeof this.onClipsReady === 'function') {
					this.onClipsReady(this._manifest);
				}
			});
		}
		async loadModel(url) { window.__viewerLoads.push(url); return this; }
		async playClip(name) { window.__playedClips.push(name); return this; }
		setOrbit() {}
		zoom() {}
	}
	Object.defineProperty(window, 'Act2Viewer', {
		configurable: true,
		get() { return StubViewer; },
		set() { /* swallow the real module's assignment */ },
	});
	// Stub the model-viewer custom element so the depth-3 ghost canvas doesn't
	// fire a real WebGL context.
	try {
		customElements.define('model-viewer', class extends HTMLElement {});
	} catch (_) {}
});

// Block the third-party model-viewer module bundle entirely — even with a
// stubbed custom element it loads a heavy Three.js + draco worker that
// crashes the headless GPU. Also stub the heavy fluid-particles canvas.
await ctx.route('**/ajax.googleapis.com/**', (route) => route.fulfill({ status: 204, body: '', contentType: 'application/javascript' }));
await ctx.route('**/fluid-particles.js', (route) => route.fulfill({ status: 200, body: '/* stubbed */', contentType: 'application/javascript' }));
await ctx.route('**/src/home-act2-viewer.js', (route) => route.fulfill({
	status: 200,
	contentType: 'application/javascript',
	body: '/* stubbed — Act2Viewer is provided by addInitScript before this loads */',
}));

const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
	if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
});
page.on('framenavigated', (f) => {
	if (f === page.mainFrame()) console.log('NAV →', f.url());
});

await page.goto('http://localhost:3000/home-v2', { waitUntil: 'domcontentloaded' });

await page.locator('#hv2-chips .hv2-chip[data-anim="dance"]').waitFor({ state: 'attached', timeout: 8000 });
await page.locator('#hv2-tryme').waitFor({ state: 'attached', timeout: 8000 });

// Let the inline hero-avatar IIFE attach its handlers (it polls every 60ms for
// window.Act2Viewer, then loads + plays "falling" before wiring clicks).
await page.waitForFunction(
	() => Array.isArray(window.__viewerLoads) && window.__viewerLoads.length > 0,
	{ timeout: 8000 },
);
// One more tick so the post-loadModel `then` runs and the click handler binds.
await page.waitForTimeout(400);

const beforeCount = await page.locator('#hv2-counter-num').innerText();
const trymeHiddenBefore = await page.locator('#hv2-tryme').evaluate((el) => el.classList.contains('is-hidden'));

await page.locator('.hv2-chip[data-anim="dance"]').click();
await page.waitForTimeout(100);

const afterClipsDance = await page.evaluate(() => window.__playedClips.slice());
const afterCount = await page.locator('#hv2-counter-num').innerText();
const trymeHiddenAfter = await page.locator('#hv2-tryme').evaluate((el) => el.classList.contains('is-hidden'));
const danceActive = await page.locator('.hv2-chip[data-anim="dance"]').evaluate((el) => el.dataset.active === 'true');

await page.locator('.hv2-chip[data-anim="wave"]').click();
await page.waitForTimeout(100);
const afterClipsWave = await page.evaluate(() => window.__playedClips.slice());
const after2Count = await page.locator('#hv2-counter-num').innerText();

await page.locator('.hv2-chip[data-anim="__random"]').click();
await page.waitForTimeout(100);
const afterClipsRandom = await page.evaluate(() => window.__playedClips.slice());
const after3Count = await page.locator('#hv2-counter-num').innerText();

const result = {
	heroLoad: await page.evaluate(() => window.__viewerLoads[0] || null),
	beforeCount,
	afterCount,
	after2Count,
	after3Count,
	trymeHiddenBefore,
	trymeHiddenAfter,
	danceActive,
	clipsAfterDance: afterClipsDance,
	clipsAfterWave: afterClipsWave,
	clipsAfterRandom: afterClipsRandom,
	errors,
};

// Pass/fail assertions
const failures = [];
if (result.heroLoad !== '/avatars/cz.glb') failures.push(`expected hero to loadModel('/avatars/cz.glb'), got ${result.heroLoad}`);
if (result.beforeCount !== '0') failures.push(`counter should start at 0, was ${result.beforeCount}`);
if (result.afterCount !== '1') failures.push(`counter after 1 click should be 1, was ${result.afterCount}`);
if (result.after2Count !== '2') failures.push(`counter after 2 clicks should be 2, was ${result.after2Count}`);
if (result.after3Count !== '3') failures.push(`counter after 3 clicks should be 3, was ${result.after3Count}`);
if (result.trymeHiddenBefore) failures.push('tryme should be visible on first load');
if (!result.trymeHiddenAfter) failures.push('tryme should be hidden after first click');
if (!result.danceActive) failures.push('dance chip should be data-active=true after click');
if (!result.clipsAfterDance.includes('dance')) failures.push(`expected 'dance' clip to play, got ${JSON.stringify(result.clipsAfterDance)}`);
if (!result.clipsAfterWave.includes('wave')) failures.push(`expected 'wave' clip to play, got ${JSON.stringify(result.clipsAfterWave)}`);
if (result.clipsAfterRandom.length <= result.clipsAfterWave.length) failures.push('random chip did not trigger a new clip');
// Real errors only — ignore the GL driver perf warnings that aren't errors anyway.
const realErrors = result.errors.filter((e) => !/GL Driver|GL_CLOSE_PATH_NV|model-viewer/.test(e));
if (realErrors.length) failures.push(`console errors: ${realErrors.join(' | ')}`);

await page.screenshot({ path: '/tmp/home-v2-hero.png', fullPage: false });

console.log(JSON.stringify(result, null, 2));
if (failures.length) {
	console.error('\nFAILURES:');
	failures.forEach((f) => console.error('  -', f));
	await browser.close();
	process.exit(1);
}
console.log('\nOK: hero v2 chips + tryme + counter wiring verified.');

await browser.close();
