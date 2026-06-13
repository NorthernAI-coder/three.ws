// Verify the homepage mini Forge embed sheet end-to-end. Seeds a real GLB into
// session history (no API spend), reloads it, then drives the embed flow.
//   node scripts/verify-home-embed.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5191';
const GLB = 'https://three.ws/cdn/forge/1106b3b06fd6/9eef456f-80a8-4b20-8481-8322354753c0.glb';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

await page.addInitScript((g) => {
	localStorage.setItem('forge:home:history', JSON.stringify([
		{ glbUrl: g, prompt: 'a low-poly red fox, sitting', thumb: null, ts: 2 },
	]));
}, GLB);

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const section = page.locator('#home-forge');
await section.scrollIntoViewIfNeeded();
await page.waitForTimeout(2800);

// Bring the model on stage from history (no API).
await page.locator('#home-forge .hf-thumb').first().click({ force: true });
await page.locator('[data-hf-result]:not([hidden]) model-viewer').waitFor({ timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);

// Open the embed sheet.
await page.locator('[data-hf-embed-open]').click();
const sheetOpen = await page.locator('[data-hf-embed]:not([hidden])').count();
console.log('embed sheet open:', sheetOpen === 1);

const codeIframe = await page.locator('[data-hf-embed-code]').inputValue();
console.log('default code is iframe →', codeIframe.startsWith('<iframe') && codeIframe.includes('/forge/embed?src='));
console.log('preview frame src →', (await page.locator('[data-hf-embed-frame]').getAttribute('src') || '').slice(0, 64) + '…');
console.log('standalone href →', (await page.locator('[data-hf-embed-standalone]').getAttribute('href') || '').slice(0, 64) + '…');

// Switch to web component.
await page.locator('[data-hf-embed-tab="component"]').click();
const codeComp = await page.locator('[data-hf-embed-code]').inputValue();
console.log('web-component code →', codeComp.includes('<model-viewer') && codeComp.includes('camera-controls auto-rotate ar'));

// Switch size to square, back to iframe, check dimensions flow through.
await page.locator('[data-hf-embed-tab="iframe"]').click();
await page.locator('[data-hf-embed-size="square"]').click();
const codeSquare = await page.locator('[data-hf-embed-code]').inputValue();
console.log('square size applied →', codeSquare.includes('width="480" height="480"'));
console.log('preview aspect-ratio →', await page.locator('[data-hf-embed-preview]').evaluate((el) => getComputedStyle(el).aspectRatio));

// Copy.
await page.locator('[data-hf-embed-copy]').click();
await page.waitForTimeout(300);
console.log('copy label →', await page.locator('[data-hf-embed-copy-label]').textContent());

await section.screenshot({ path: 'reports/home-embed-sheet.png' });

// Close (Escape) restores focus and hides the sheet.
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
console.log('closed via Escape →', (await page.locator('[data-hf-embed]:not([hidden])').count()) === 0);

console.log('\nconsole errors/warnings:', problems.filter((p) => !/WebSocket|\[vite\]|404|ReadPixels|GL Driver/.test(p)).length);
problems.filter((p) => !/WebSocket|\[vite\]|404|ReadPixels|GL Driver/.test(p)).slice(0, 10).forEach((p) => console.log('  ', p));

await browser.close();
console.log('\nscreenshot → reports/home-embed-sheet.png');
