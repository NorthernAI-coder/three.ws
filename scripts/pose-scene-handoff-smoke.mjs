// Smoke test: /pose "Record in Scene →" hands a baked animation to /scene,
// which loads it as a recordable object with a play script. Run against a dev
// server: node scripts/pose-scene-handoff-smoke.mjs [baseUrl]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3199';
const errors = [];
let exitCode = 0;
const fail = (m) => { errors.push(m); exitCode = 1; console.error('✗', m); };
const ok = (m) => console.log('✓', m);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => fail('pageerror: ' + e.message));

try {
	await page.goto(`${BASE}/pose`, { waitUntil: 'networkidle' });

	const btn = page.locator('#tl-open-scene');
	await btn.waitFor({ state: 'attached', timeout: 15000 });
	await page.waitForTimeout(1500); // let the studio boot + wire handlers

	if (await btn.isDisabled()) ok('button disabled with no keyframes');
	else fail('button should be disabled before any keyframe');

	// Drop two keyframes at different times so the clip actually moves.
	await page.locator('#tl-add-key').click();
	await page.locator('#tl-end').click();      // jump playhead to the end
	// Nudge a bone so the end pose differs, then key it.
	await page.locator('#tl-add-key').click();

	if (await btn.isEnabled()) ok('button enabled after keyframes');
	else fail('button still disabled after adding keyframes');

	// Click → should bake, stash the handoff, and navigate to /scene?handoff=1.
	await Promise.all([
		page.waitForURL(/\/scene/, { timeout: 30000 }),
		btn.click(),
	]);
	ok('navigated to /scene after handoff');

	// Scene Studio boots and consumes the handoff: an object appears in the
	// outliner and the animation panel reveals its track.
	await page.waitForSelector('#studio-app', { timeout: 20000 });
	await page.waitForFunction(() => {
		const ed = window.editor;
		if (!ed || !ed.scene) return false;
		const obj = ed.scene.children.find((c) => c.animations && c.animations.length > 0);
		return !!obj;
	}, { timeout: 25000 });
	ok('scene loaded an object carrying an animation clip');

	const scriptAttached = await page.evaluate(() => {
		const ed = window.editor;
		const obj = ed.scene.children.find((c) => c.animations && c.animations.length > 0);
		const scripts = ed.scripts[obj.uuid] || [];
		return scripts.some((s) => /AnimationMixer/.test(s.source));
	});
	if (scriptAttached) ok('play script attached (recording will animate)');
	else fail('no play script attached — Render ▸ Video would record a static frame');

	// URL query was stripped so a reload does not re-import.
	const url = page.url();
	if (!/handoff=1/.test(url)) ok('handoff query stripped from URL');
	else fail('handoff query left in URL');
} catch (e) {
	fail('exception: ' + e.message);
} finally {
	const realErrors = errors.filter((e) => e.startsWith('console:') || e.startsWith('pageerror:'));
	if (realErrors.length) { console.error('\nPage errors:'); realErrors.forEach((e) => console.error('  ' + e)); }
	await browser.close();
	console.log(exitCode === 0 ? '\nPASS' : '\nFAIL');
	process.exit(exitCode);
}
