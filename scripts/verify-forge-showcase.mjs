// One-off browser verification for the /forge community showcase + dropzone.
// Usage: BASE_URL=http://localhost:4174 node scripts/verify-forge-showcase.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4174';
const SHOWCASE_ROWS = [
	{
		id: 'c-1',
		prompt: 'a glazed ceramic teapot with a bamboo handle',
		glb_url: 'https://example.com/teapot.glb',
		preview_image_url:
			'data:image/svg+xml,' +
			encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#334"/></svg>'),
		views_used: null,
		backend: 'trellis',
		tier: 'standard',
		path: 'image',
		created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
	},
	{
		id: 'c-2',
		prompt: 'a low-poly red fox, sitting',
		glb_url: 'https://example.com/fox.glb',
		preview_image_url: null,
		views_used: 3,
		backend: 'nvidia',
		tier: 'draft',
		path: 'image',
		created_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
	},
];

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
// Local-harness noise that does not exist in production: vite's HMR socket,
// the absent Vercel functions (404s), and the stub's synthetic example.com GLB.
const ENV_NOISE = /websocket|_vercel|favicon|Failed to load resource|Failed to fetch|example\.com/i;
page.on('console', (m) => {
	if (m.type() === 'error' && !ENV_NOISE.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => {
	if (!ENV_NOISE.test(String(e))) errors.push(String(e));
});

// ── Pass 1: live API (vite proxies /api/* to production) — the section must
// settle into one of its two designed states: rendered cards, or hidden. ─────
await page.goto(`${BASE}/forge.html`, { waitUntil: 'load' });
await page.waitForFunction(
	() => {
		const s = document.getElementById('showcase');
		return s && (s.classList.contains('is-hidden') || s.querySelector('.showcase-card'));
	},
	{ timeout: 15000 },
);
const livePass = await page.$eval('#showcase', (el) =>
	el.classList.contains('is-hidden') ? 'hidden (feed empty/disabled)' : `rendered ${el.querySelectorAll('.showcase-card').length} live cards`,
);
console.log('live API pass:', livePass);

// ── Pass 2: stub the community endpoint with the real response shape ─────────
// A duplicate-prompt row is included on purpose: the module must dedupe it.
await page.route('**/api/forge-gallery?scope=community*', (route) =>
	route.fulfill({
		json: {
			enabled: true,
			creations: [...SHOWCASE_ROWS, { ...SHOWCASE_ROWS[0], id: 'c-dupe' }],
		},
	}),
);
await page.goto(`${BASE}/forge.html`, { waitUntil: 'load' });
await page.waitForSelector('#showcase:not(.is-hidden) .showcase-card', { timeout: 5000 });
const cards = await page.$$eval('#showcase-grid .showcase-card', (els) => els.length);
const count = await page.$eval('#showcase-count', (el) => el.textContent);
const whens = await page.$$eval('.showcase-when', (els) => els.map((e) => e.textContent));
const badge = await page.$eval('#showcase-grid .showcase-card .badge', (el) => el.textContent);
console.log('showcase rendered (3 rows in, dupe dropped):', { cards, count, whens, badge });

// Hover-to-spin: dwell on a card → a mini model-viewer with its GLB appears.
await page.hover('#showcase-grid .showcase-card');
await page.waitForSelector('#showcase-grid .showcase-card .showcase-preview', { timeout: 3000 });
const previewSrc = await page.$eval('#showcase-grid .showcase-card .showcase-preview', (el) =>
	el.getAttribute('src'),
);
await page.mouse.move(0, 0); // leave → teardown
await page.waitForTimeout(150);
const previewGone = await page.$('#showcase-grid .showcase-preview');
console.log('hover preview:', { previewSrc, tornDown: previewGone === null });

// Remix: fills the composer prompt + focuses it.
await page.click('.showcase-card .showcase-remix');
const promptVal = await page.$eval('#prompt', (el) => el.value);
const promptFocused = await page.$eval('#prompt', (el) => el === document.activeElement);
console.log('remix:', { promptVal, promptFocused });

// Card click: dispatches forge:open-creation → forge.js loads it in the viewer.
await page.click('.showcase-card');
await page.waitForTimeout(400);
const viewerSrc = await page.$eval('#viewer', (el) => el.getAttribute('src'));
const resultShown = await page.$eval('#state-result', (el) => !el.classList.contains('is-hidden'));
console.log('open in viewer:', { viewerSrc, resultShown });

// ── Dropzone: overlay on dragenter (text mode), hides on drop ────────────────
await page.evaluate(() => {
	document.querySelector('#mode-switch [data-mode="text"]').click();
	const dt = new DataTransfer();
	dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
	document.body.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
});
const overlayActive = await page.$eval('.forge-drop-overlay', (el) => el.dataset.active === 'true');
await page.evaluate(() => {
	document.body.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
});
const overlayGone = await page.$eval('.forge-drop-overlay', (el) => el.dataset.active !== 'true');
console.log('drop overlay:', { overlayActive, overlayGone });

// Paste: image on clipboard → mode switches to photos + toast appears.
await page.evaluate(() => {
	const dt = new DataTransfer();
	dt.items.add(new File(['x'], 'paste.png', { type: 'image/png' }));
	const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
	Object.defineProperty(ev, 'clipboardData', { value: dt });
	document.dispatchEvent(ev);
});
await page.waitForTimeout(300);
const modeAfterPaste = await page.$eval('#mode-switch [aria-selected="true"]', (el) => el.dataset.mode);
const toastText = await page.$eval('.forge-toast', (el) => el.textContent).catch(() => null);
console.log('paste:', { modeAfterPaste, toastText });

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
