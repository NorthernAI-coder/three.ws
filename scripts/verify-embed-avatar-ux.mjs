// Verify the embedded-avatar UX (Task 5): loading skeleton, error fallback,
// reduced-motion static pose, loop-honoring playback, portrait/full framing,
// and offscreen render pause — all driven by the LOCAL <agent-3d> component
// (src/element.js), not the deployed CDN bundle.
//
//   BASE_URL=http://localhost:5191 node scripts/verify-embed-avatar-ux.mjs
//
// Writes a throwaway page under public/, exercises it, and deletes it.
import { chromium } from 'playwright';
import { writeFileSync, rmSync, mkdirSync } from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:5191';
const TMP = 'public/_tmp-avatar-ux.html';
const CZ = '/avatars/cz.glb';
const MICHELLE = '/avatars/michelle.glb';
const BAD = '/avatars/__does_not_exist__.glb';

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin:0; background:#0b0d10; font-family:system-ui; }
  .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; padding:16px; }
  .card { position:relative; aspect-ratio:16/9; border:1px solid #222; border-radius:8px; overflow:hidden; background:#111; }
  .card agent-3d { position:absolute; inset:0; width:100%; height:100%; }
  .spacer { height:3000px; }
  #offscreen { position:relative; height:240px; border:1px solid #222; margin:16px; }
  #offscreen agent-3d { position:absolute; inset:0; width:100%; height:100%; }
</style></head><body>
<div class="grid">
  <div class="card"><agent-3d id="loopAv"   body="${CZ}"       framing="portrait" clip="rumba" kiosk avatar-chat="off" background="transparent" eager></agent-3d></div>
  <div class="card"><agent-3d id="oneshotAv" body="${MICHELLE}" framing="portrait" clip="wave"  kiosk avatar-chat="off" background="transparent" eager></agent-3d></div>
  <div class="card"><agent-3d id="fullAv"    body="${CZ}"       framing="full"     clip="idle"  kiosk avatar-chat="off" background="transparent" eager></agent-3d></div>
  <div class="card"><agent-3d id="badAv"     body="${BAD}"      framing="portrait"              kiosk avatar-chat="off" background="transparent" eager></agent-3d></div>
</div>
<div class="spacer"></div>
<div id="offscreen"><agent-3d id="bottomAv" body="${CZ}" framing="portrait" clip="idle" kiosk avatar-chat="off" background="transparent" eager></agent-3d></div>
<script type="module">
  window.__ready = {};
  window.__error = {};
  import('/src/element.js').then(() => {
    for (const el of document.querySelectorAll('agent-3d')) {
      el.addEventListener('agent:ready', () => { window.__ready[el.id] = true; });
      el.addEventListener('agent:error', (e) => { window.__error[el.id] = (e.detail?.error?.message || String(e.detail?.error) || 'error'); });
    }
  });
</script>
</body></html>`;

mkdirSync('reports', { recursive: true });
writeFileSync(TMP, PAGE);

const out = [];
const log = (...a) => { out.push(a.join(' ')); console.log(...a); };
let failures = 0;
const assert = (cond, label, extra = '') => {
	log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
	if (!cond) failures++;
};

const browser = await chromium.launch();

async function inspect(page, id) {
	return page.evaluate((id) => {
		const el = document.getElementById(id);
		if (!el || !el.shadowRoot) return null;
		const sr = el.shadowRoot;
		const am = el._viewer?.animationManager;
		return {
			hasSkeleton: !!sr.querySelector('.skeleton'),
			loadingHidden: !!sr.querySelector('.loading')?.hidden,
			hasFallback: !!sr.querySelector('.fallback'),
			framing: el._viewer?.options?.framing ?? null,
			currentClip: am?.currentName ?? null,
			currentActionNull: am ? am.currentAction === null : null,
			visible: el._viewer?._visible ?? null,
			rafNull: el._viewer ? el._viewer._rafId === null : null,
			ready: !!window.__ready[id],
			error: window.__error[id] || null,
		};
	}, id);
}

// ── 1. Normal motion context: framing, loading, error, loop-honoring ──────────
{
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await ctx.newPage();
	const problems = [];
	page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
	page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

	await page.goto(`${BASE}/_tmp-avatar-ux.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
	// Skeleton should be visible immediately while the GLB streams.
	await page.waitForTimeout(150);
	const earlyLoop = await inspect(page, 'loopAv');
	assert(earlyLoop?.hasSkeleton, 'loading skeleton present in shadow DOM');

	// Wait for the good avatars to be ready and the bad one to error.
	await page.waitForFunction(() => window.__ready.loopAv && window.__ready.fullAv && (window.__error.badAv || window.__ready.badAv), null, { timeout: 30000 }).catch(() => {});
	await page.waitForTimeout(2500);

	const loop = await inspect(page, 'loopAv');
	const full = await inspect(page, 'fullAv');
	const bad = await inspect(page, 'badAv');
	const oneshot = await inspect(page, 'oneshotAv');

	assert(loop?.framing === 'portrait', 'portrait framing applied (loopAv)', `framing=${loop?.framing}`);
	assert(full?.framing === 'full', 'full framing applied (fullAv)', `framing=${full?.framing}`);
	assert(loop?.loadingHidden === true, 'skeleton hidden after ready (loopAv)');
	assert(loop?.currentClip === 'rumba', 'loop clip honored — rumba is current (loopAv)', `current=${loop?.currentClip}`);
	assert(full?.currentClip === 'idle', 'idle loop current (fullAv)', `current=${full?.currentClip}`);
	assert(!!bad?.hasFallback, 'error → decoration fallback silhouette shown (badAv)', `error=${bad?.error}`);
	assert(!!bad?.error, 'agent:error dispatched for bad GLB (badAv)');
	log(`info  oneshot current clip after settle window: ${oneshot?.currentClip}`);

	// Responsive screenshots.
	for (const w of [320, 768, 1440]) {
		await page.setViewportSize({ width: w, height: Math.round(w * 1.4) });
		await page.waitForTimeout(700);
		await page.screenshot({ path: `reports/avatar-ux-${w}.png` });
		log(`screenshot → reports/avatar-ux-${w}.png (${w}px)`);
	}

	// Offscreen pause: bottomAv is far below the fold at the top scroll position.
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(900);
	const bottom = await inspect(page, 'bottomAv');
	assert(bottom?.visible === false, 'offscreen avatar marked not-visible (bottomAv)', `visible=${bottom?.visible}`);
	assert(bottom?.rafNull === true, 'offscreen avatar paused its render loop (rafId null)', `rafNull=${bottom?.rafNull}`);
	// Scroll it into view → resumes.
	await page.locator('#bottomAv').scrollIntoViewIfNeeded();
	await page.waitForTimeout(700);
	const bottomAfter = await inspect(page, 'bottomAv');
	assert(bottomAfter?.visible === true, 'avatar resumes rendering when scrolled back in (bottomAv)', `visible=${bottomAfter?.visible}`);

	const realProblems = problems.filter((p) => !/WebSocket|\[vite\]|favicon|404 \(Not Found\)|__does_not_exist__|ReadPixels|GL Driver|Failed to load resource/.test(p));
	log(`\nconsole errors/warnings (filtered): ${realProblems.length}`);
	realProblems.slice(0, 12).forEach((p) => log('  ' + p));
	await ctx.close();
}

// ── 2. Reduced-motion context: avatar holds a static pose, no looping ─────────
{
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/_tmp-avatar-ux.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForFunction(() => window.__ready.loopAv, null, { timeout: 30000 }).catch(() => {});
	await page.waitForTimeout(2500);
	const loop = await inspect(page, 'loopAv');
	// Under reduced motion the decoration freezes: the active action is released
	// (currentAction === null) so the render loop can settle — no looping motion.
	assert(loop?.currentActionNull === true, 'reduced-motion: avatar holds a static pose (no active looping action)', `currentActionNull=${loop?.currentActionNull}`);
	await ctx.close();
}

await browser.close();
rmSync(TMP, { force: true });

log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
