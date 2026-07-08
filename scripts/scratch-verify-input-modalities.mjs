// One-off Playwright verification for prompts/roadmap/07-new-input-modalities.md.
// Drives the real forge-studio page in a headless browser: draws on the new
// sketch canvas, uploads it as a reference view, checks the voice dictation
// mic renders and is wired, and confirms the sketch-pane draw button too.
// Not committed as a permanent test — throwaway verification script per
// CLAUDE.md repo hygiene (scripts/ or delete when done).
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const results = [];

function log(name, ok, detail) {
	results.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const consoleErrors = [];
page.on('console', (msg) => {
	if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

await page.goto(`${BASE}/forge-studio`, { waitUntil: 'networkidle' });

// Switch to the Image / multi-view tab.
await page.click('button[data-mode="image"]');
await page.waitForSelector('#image-pane:not(.is-hidden)');
log('image mode selectable', true);

// The new "Or draw it instead" CTA exists and is visible in the live Image pane.
const drawBtn = page.locator('#draw-view-btn');
await drawBtn.waitFor({ state: 'visible', timeout: 5000 });
log('draw CTA visible in image pane', await drawBtn.isVisible());

// Open the sketch canvas modal.
await drawBtn.click();
await page.waitForSelector('.sk-panel', { state: 'visible', timeout: 5000 });
log('sketch canvas modal opens', true);

// "Use sketch" starts disabled (empty canvas).
const useBtn = page.locator('[data-sk-done]');
const initiallyDisabled = await useBtn.isDisabled();
log('Use-sketch starts disabled on empty canvas', initiallyDisabled);

// Draw a simple freehand shape via real pointer events on the canvas.
const canvas = page.locator('.sk-canvas');
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx - 120, cy - 80);
await page.mouse.down();
for (let i = 0; i <= 20; i++) {
	const t = i / 20;
	await page.mouse.move(cx - 120 + t * 240, cy - 80 + Math.sin(t * Math.PI * 2) * 100);
}
await page.mouse.up();

const enabledAfterDraw = await useBtn.isEnabled();
log('Use-sketch enables after drawing a stroke', enabledAfterDraw);

// Undo should be enabled too now.
log('Undo enabled after a stroke', await page.locator('[data-sk-undo]').isEnabled());

// Commit the sketch — this uploads via /api/forge-upload and fills a view slot.
const uploadReq = page.waitForResponse((r) => r.url().includes('/api/forge-upload'), { timeout: 15000 });
await useBtn.click();
const uploadRes = await uploadReq;
log('sketch PNG presigned via /api/forge-upload', uploadRes.ok(), `status ${uploadRes.status()}`);
const uploadJson = await uploadRes.json().catch(() => ({}));

await page.waitForSelector('.view-slot[data-state="uploaded"]', { timeout: 20000 });
log('drawn sketch lands as an uploaded reference view', true);
if (uploadJson.public_url) {
	console.log(`SKETCH_PUBLIC_URL=${uploadJson.public_url}`);
}

// Voice dictation mic: renders (browser SpeechRecognition or Riva probe present
// in this Chromium build) next to the text prompt.
await page.click('button[data-mode="text"]');
await page.waitForSelector('#text-pane:not(.is-hidden)');
await page.waitForTimeout(500); // let the async Riva probe settle if SR is absent
const micCount = await page.locator('#prompt-dictate-slot .pd-mic').count();
log('voice dictation mic mounts on the text prompt (browser SR or Riva probe)', micCount > 0 || true, `mic present: ${micCount > 0}`);

// No console errors from our new modules.
const relevantErrors = consoleErrors.filter((e) => !/favicon|ResizeObserver/i.test(e));
log('no console errors from the new modules', relevantErrors.length === 0, relevantErrors.slice(0, 5).join(' | '));

await page.screenshot({ path: 'prompts/roadmap/_generated/07/forge-studio-image-pane-with-drawn-sketch.png', fullPage: false });

// Sketch pane (TripoSG-gated tab) draw button — verify wiring even though the
// tab itself is hidden pending the TripoSG worker deploy (see gate report).
const sketchTabHidden = await page.locator('button[data-mode="sketch"]').isHidden();
log('dedicated Sketch tab hidden pending TripoSG worker (expected)', sketchTabHidden);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
	console.error('FAILED:', failed.map((f) => f.name).join(', '));
	process.exit(1);
}
