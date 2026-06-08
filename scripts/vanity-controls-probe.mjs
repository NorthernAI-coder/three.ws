// One-off probe: verify vanity-wallet core selector + pause/resume/stop.
// Usage: node scripts/vanity-controls-probe.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3002';
const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(`${base}/vanity-wallet.html`, { waitUntil: 'networkidle' });

const hwMax = await page.locator('#core-max').textContent();
const sliderMax = await page.locator('#core-count').getAttribute('max');
const startVal = await page.locator('#core-count-val').textContent();
console.log(`cores: default=${startVal} max=${hwMax} sliderMax=${sliderMax} presets=${await page.locator('#core-ticks button').count()}`);

// Pick a 1-char prefix so it resolves fast, force 2 cores via slider.
await page.fill('#prefix', 'A');
await page.locator('#core-count').fill('2');
console.log('after slider set 2 ->', await page.locator('#core-count-val').textContent());

await page.click('#grind');
await page.waitForSelector('#pause:not([hidden])');
await page.waitForFunction(() => Number(document.getElementById('attempts').textContent.replace(/,/g,'')) > 0, { timeout: 10000 });

// Pause and confirm attempts freeze.
await page.click('#pause');
await page.waitForSelector('#paused-tag:not([hidden])');
const a1 = await page.locator('#attempts').textContent();
await page.waitForTimeout(600);
const a2 = await page.locator('#attempts').textContent();
console.log(`paused: btn="${await page.locator('#pause').textContent()}" attempts ${a1} -> ${a2} (frozen=${a1 === a2})`);
console.log('cores slider disabled while running:', await page.locator('#core-count').isDisabled());

// Resume and confirm progress continues.
await page.click('#pause');
await page.waitForTimeout(500);
const a3 = await page.locator('#attempts').textContent();
console.log(`resumed: attempts -> ${a3} (advanced=${a3 !== a2})`);

// Wait for the 1-char result (near-instant), verify address + cores.
await page.waitForSelector('.result', { timeout: 15000 });
const addr = await page.locator('.result .addr').textContent();
const meta = await page.locator('.result .meta').textContent();
console.log('result addr:', addr.trim().slice(0, 12), '| meta:', meta.replace(/\s+/g,' ').trim());
console.log('cores re-enabled after result:', !(await page.locator('#core-count').isDisabled()));

// Stop path: start again, stop mid-grind with a 3-char prefix.
await page.fill('#prefix', 'zzz');
await page.click('#grind');
await page.waitForSelector('#stop:not([hidden])');
await page.waitForFunction(() => Number(document.getElementById('attempts').textContent.replace(/,/g,'')) > 0, { timeout: 10000 });
await page.click('#stop');
await page.waitForTimeout(400);
console.log('after stop: progress hidden =', await page.locator('#progress').isHidden(), '| grind visible =', await page.locator('#grind').isVisible());

console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
