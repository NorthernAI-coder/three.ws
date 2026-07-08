import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3061';
const browser = await chromium.launch();
const results = [];

async function testOne(glbPath, dprCap, label) {
	const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
	await page.goto(`${BASE}/_perf-test/harness.html`, { waitUntil: 'load' });
	await page.waitForFunction(() => window.perfReady === true);
	const r = await page.evaluate(([url, dpr]) => window.runPerfTest(url, dpr), [glbPath, dprCap]);
	r.label = label;
	await page.close();
	return r;
}

results.push(await testOne(`${BASE}/_perf-test/brainstem-original.glb`, 2, 'brainstem ORIGINAL (3.05MB) @dpr2'));
results.push(await testOne(`${BASE}/_perf-test/brainstem-compressed.glb`, 2, 'brainstem COMPRESSED (766.7KB, draco+meshopt+webp) @dpr2'));
results.push(await testOne(`${BASE}/_perf-test/brainstem-compressed.glb`, 1, 'brainstem COMPRESSED @dpr1 (low-power auto-degrade path)'));

await browser.close();
console.log(JSON.stringify(results, null, 2));
writeFileSync('/workspaces/three.ws/prompts/roadmap/_generated/04/perf-harness-results.json', JSON.stringify(results, null, 2));
