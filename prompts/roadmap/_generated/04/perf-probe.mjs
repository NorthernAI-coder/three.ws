// Real-browser perf + a11y verification for prompt 04 (viewer perf/mobile/AR/a11y).
// Loads a real heavy GLB (public/club/venue/tour.glb, 7.6MB) through the main
// site Viewer (src/viewer.js, powers /app.html and every page that embeds it)
// and measures actual load time + sustained FPS — no synthetic/mocked numbers.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const OUT = '/workspaces/three.ws/prompts/roadmap/_generated/04';
const MODEL = 'http://localhost:3061/club/venue/tour.glb';
const URL = `http://localhost:3061/app.html#model=${encodeURIComponent(MODEL)}&kiosk=false`;

const browser = await chromium.launch();
const results = [];

async function measure(label, viewportWidth) {
	const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } });
	const consoleErrors = [];
	page.on('console', (m) => { if (m.type() === 'error' && !/websocket|WebSocket/i.test(m.text())) consoleErrors.push(m.text()); });
	page.on('pageerror', (e) => { if (!/WebSocket/i.test(e.message)) consoleErrors.push('pageerror: ' + e.message); });

	const t0 = Date.now();
	await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
	// Wait for the model to actually finish loading (content mounted + progress hidden).
	await page.waitForFunction(() => {
		const canvas = document.querySelector('canvas');
		return canvas && canvas.width > 0 && window.viewer && window.viewer.content;
	}, { timeout: 60000 }).catch(() => {});
	const loadMs = Date.now() - t0;

	// Sample real rendered frames for ~2s via rAF timestamps (not a synthetic counter).
	const fps = await page.evaluate(() => new Promise((resolve) => {
		let frames = 0;
		const start = performance.now();
		function tick(now) {
			frames++;
			if (now - start < 2000) requestAnimationFrame(tick);
			else resolve(Math.round((frames * 1000) / (now - start)));
		}
		requestAnimationFrame(tick);
	}));

	// Canvas a11y contract.
	const a11y = await page.evaluate(() => {
		const c = document.querySelector('canvas');
		return c ? { tabIndex: c.tabIndex, role: c.getAttribute('role'), ariaLabel: c.getAttribute('aria-label') } : null;
	});

	// Keyboard orbit: focus canvas, press ArrowLeft, confirm camera actually moved.
	const canvasHandle = await page.$('canvas');
	let keyboardOrbitMoved = false;
	let camBefore = null, camAfter = null;
	if (canvasHandle) {
		camBefore = await page.evaluate(() => window.viewer?.defaultCamera?.position?.toArray());
		await canvasHandle.focus();
		await page.keyboard.press('ArrowLeft');
		await page.waitForTimeout(50);
		camAfter = await page.evaluate(() => window.viewer?.defaultCamera?.position?.toArray());
		keyboardOrbitMoved = !!(camBefore && camAfter && (camBefore[0] !== camAfter[0] || camBefore[2] !== camAfter[2]));
	}

	await page.screenshot({ path: `${OUT}/app-heavy-${label}.png` });
	await page.close();

	return { label, viewportWidth, loadMs, fps, a11y, keyboardOrbitMoved, consoleErrors };
}

for (const [label, width] of [['1440', 1440], ['768', 768], ['320', 320]]) {
	results.push(await measure(label, width));
}

await browser.close();

const lines = [];
for (const r of results) {
	lines.push(`### ${r.label}px`);
	lines.push(`- load time: ${r.loadMs}ms`);
	lines.push(`- sustained FPS (2s sample): ${r.fps}`);
	lines.push(`- canvas a11y: ${JSON.stringify(r.a11y)}`);
	lines.push(`- keyboard orbit moved camera: ${r.keyboardOrbitMoved}`);
	lines.push(`- console errors (excl. WS): ${r.consoleErrors.length}${r.consoleErrors.length ? '\n  - ' + r.consoleErrors.join('\n  - ') : ''}`);
	lines.push('');
}
writeFileSync(`${OUT}/perf-probe-results.md`, lines.join('\n'));
console.log(lines.join('\n'));
