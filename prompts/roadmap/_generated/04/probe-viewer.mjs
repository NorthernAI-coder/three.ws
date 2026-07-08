// Ad-hoc verification script for prompt 04 (viewer + Scene Studio perf/a11y/AR).
// Drives a real Chromium against the local dev server, checks console errors,
// keyboard interaction, and responsive layout at 320/768/1440.
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = '/workspaces/three.ws/prompts/roadmap/_generated/04';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

const results = [];
function log(...args) {
	console.log(...args);
	results.push(args.map(String).join(' '));
}

const browser = await chromium.launch();

async function withPage(name, fn) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(msg.text());
	});
	page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
	try {
		await fn(page, context);
	} finally {
		log(`[${name}] console errors: ${errors.length}`);
		for (const e of errors) log(`  - ${e}`);
		await context.close();
	}
	return errors;
}

// ── 1. Dedicated harness page: mount <three-ws-viewer ar> and exercise it ──
// (pages/_qa-probe-viewer.html — temporary, deleted after this verification run)
await withPage('three-ws-viewer harness', async (page) => {
	await page.goto(`${BASE}/pages/_qa-probe-viewer.html`, { waitUntil: 'networkidle' });
	const loaded = await page
		.waitForFunction(
			() => !!document.getElementById('host')?.querySelector('three-ws-viewer'),
			{ timeout: 15000 },
		)
		.then(() => true)
		.catch(() => false);
	log('viewer element mounted:', loaded);

	// Wait for the GLB `load` event (or error) to confirm real rendering.
	const loadState = await page.evaluate(
		() =>
			new Promise((resolve) => {
				const el = window.__viewerEl;
				if (!el) return resolve('no-element');
				el.addEventListener('load', () => resolve('load'), { once: true });
				el.addEventListener('error', (e) => resolve('error:' + e.detail?.error?.message), { once: true });
				setTimeout(() => resolve('timeout'), 12000);
			}),
	);
	log('viewer GLB load result:', loadState);

	// AR button present + accessible name.
	const arBtnLabel = await page.evaluate(() => {
		const el = window.__viewerEl;
		const btn = el?.shadowRoot?.querySelector('.ar-btn');
		return btn ? btn.getAttribute('aria-label') : null;
	});
	log('AR button aria-label:', arBtnLabel);

	// Canvas keyboard focus + ARIA.
	const canvasInfo = await page.evaluate(() => {
		const el = window.__viewerEl;
		const c = el?.shadowRoot?.querySelector('canvas');
		return c
			? { tabIndex: c.tabIndex, role: c.getAttribute('role'), ariaLabel: c.getAttribute('aria-label') }
			: null;
	});
	log('canvas a11y:', JSON.stringify(canvasInfo));

	// Keyboard orbit: focus canvas, press ArrowLeft, confirm camera moved.
	const before = await page.evaluate(() => {
		const el = window.__viewerEl;
		return el?._camera?.position.toArray();
	});
	const canvasHandle = await page.evaluateHandle(() => window.__viewerEl.shadowRoot.querySelector('canvas'));
	await canvasHandle.asElement().focus();
	await page.keyboard.press('ArrowLeft');
	await page.waitForTimeout(50);
	const after = await page.evaluate(() => {
		const el = window.__viewerEl;
		return el?._camera?.position.toArray();
	});
	log('camera before ArrowLeft:', JSON.stringify(before));
	log('camera after ArrowLeft:', JSON.stringify(after));
	log('keyboard orbit moved camera:', JSON.stringify(before) !== JSON.stringify(after));

	// AR launch opens a new tab pointed at /api/ar.
	const [popup] = await Promise.all([
		context_popupWait(page),
		page.evaluate(() => window.__viewerEl.shadowRoot.querySelector('.ar-btn').click()),
	]);
	if (popup) {
		await popup.waitForLoadState('domcontentloaded').catch(() => {});
		log('AR popup URL:', popup.url());
		log('AR popup status ok:', popup.url().includes('/api/ar'));
	} else {
		log('AR popup: none opened');
	}
});

async function context_popupWait(page) {
	try {
		return await page.waitForEvent('popup', { timeout: 5000 });
	} catch {
		return null;
	}
}

// ── 2. Responsive check: /viewer with a real GLB at 320/768/1440 ──
for (const [label, viewport] of [
	['320', { width: 320, height: 640 }],
	['768', { width: 768, height: 1024 }],
	['1440', { width: 1440, height: 900 }],
]) {
	await withPage(`/scene @ ${label}px`, async (page) => {
		await page.setViewportSize(viewport);
		await page.goto(`${BASE}/scene`, { waitUntil: 'load', timeout: 60000 });
		await page.waitForTimeout(2500);
		await page.screenshot({ path: `${OUT}/scene-${label}.png` });
		const hasActionBar = await page.evaluate(() => !!document.querySelector('.tws-sa-bar'));
		log(`scene studio action bar present @${label}:`, hasActionBar);
	});
}

writeFileSync(`${OUT}/playwright-probe.log`, results.join('\n') + '\n');
await browser.close();
console.log('DONE');
