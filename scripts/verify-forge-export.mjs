// Browser verification for src/forge-export.js — exercises the real /forge
// page in Chromium: opens the format menu, converts the live GLB to OBJ, STL,
// PLY and USDZ client-side, and asserts a real download lands for each.
// Usage: BASE_URL=http://localhost:3013 node scripts/verify-forge-export.mjs

import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3013';
const GLB_PATH = '/accessories/hat-baseball.glb';

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
	if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto(`${BASE_URL}/forge`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.export-split .export-caret', { state: 'attached', timeout: 15_000 });

// Stage a finished generation: point the download anchor at a real local GLB
// and reveal the result panel, exactly the state showResult() leaves behind.
await page.evaluate((glbPath) => {
	const download = document.getElementById('download');
	download.setAttribute('href', glbPath);
	download.setAttribute('download', 'verify-export.glb');
	for (const panel of document.querySelectorAll('.panel')) panel.classList.add('is-hidden');
	document.getElementById('state-result')?.classList.remove('is-hidden');
}, GLB_PATH);
await page.waitForSelector('.export-split .export-caret', { timeout: 5_000 });

const results = {};
for (const format of ['obj', 'stl', 'ply', 'usdz']) {
	await page.click('.export-caret');
	await page.waitForSelector('.export-menu.is-open', { timeout: 5_000 });
	const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
	await page.click(`.export-item[data-format="${format}"]`);
	const dl = await downloadPromise;
	const filename = dl.suggestedFilename();
	const stream = await dl.createReadStream();
	let bytes = 0;
	for await (const chunk of stream) bytes += chunk.length;
	results[format] = { filename, bytes };
	if (!filename.endsWith(`.${format}`) || bytes === 0) {
		console.error(`FAIL ${format}: filename=${filename} bytes=${bytes}`);
		process.exit(1);
	}
	console.log(`ok ${format}: ${filename} (${bytes} bytes)`);
	await page.keyboard.press('Escape');
}

// Keyboard accessibility: caret opens the menu and Escape closes it.
await page.focus('.export-caret');
await page.keyboard.press('Enter');
const opened = await page.$eval('.export-menu', (el) => el.classList.contains('is-open'));
await page.keyboard.press('Escape');
const closed = await page.$eval('.export-menu', (el) => !el.classList.contains('is-open'));
console.log(`keyboard: open=${opened} close=${closed}`);

await page.screenshot({ path: 'reports/forge-export-menu.png' });

const ownErrors = consoleErrors.filter((e) => e.includes('forge-export'));
if (ownErrors.length) {
	console.error('console errors from forge-export:', ownErrors);
	process.exit(1);
}
if (!opened || !closed) {
	console.error('FAIL keyboard interaction');
	process.exit(1);
}
console.log('forge-export verification passed');
await browser.close();
