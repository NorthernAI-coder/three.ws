import { chromium } from 'playwright';

const browser = await chromium.launch({
	args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2', '--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Stub the heavy Three.js viewer and model-viewer so the page paints layout
// without any WebGL (which crashes this Codespace's headless chromium).
await ctx.addInitScript(() => {
	class Stub {
		constructor() { this._manifest = []; this.model = { position: { x: 0 }, traverse: () => {} }; }
		async loadModel() { return this; }
		async playClip() { return this; }
		setOrbit() {} zoom() {}
	}
	Object.defineProperty(window, 'Act2Viewer', { configurable: true, get() { return Stub; }, set() {} });
	try { customElements.define('model-viewer', class extends HTMLElement {}); } catch (_) {}
});

await ctx.route('**/ajax.googleapis.com/**', (r) => r.fulfill({ status: 204, body: '', contentType: 'application/javascript' }));
await ctx.route('**/fluid-particles.js', (r) => r.fulfill({ status: 200, body: '', contentType: 'application/javascript' }));
await ctx.route('**/src/home-act2-viewer.js', (r) => r.fulfill({ status: 200, body: '', contentType: 'application/javascript' }));

const page = await ctx.newPage();
await page.goto('http://localhost:3000/home-v2', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

await page.screenshot({ path: '/tmp/home-v2-hero.png', fullPage: false });
console.log('wrote /tmp/home-v2-hero.png');

await browser.close();
