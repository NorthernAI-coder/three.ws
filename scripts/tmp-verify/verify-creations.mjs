import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:45601';
const errors = [];
const warnings = [];
const networkFailures = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

page.on('console', (msg) => {
	if (msg.type() === 'error') errors.push(msg.text());
	if (msg.type() === 'warning') warnings.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('requestfailed', (req) => networkFailures.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));

console.log('→ navigating to /creations');
await page.goto(`${BASE}/creations`, { waitUntil: 'networkidle', timeout: 30000 });

// Wait for the feed + leaderboards to settle (aria-busy flips false).
await page.waitForFunction(() => document.getElementById('cr-feed')?.getAttribute('aria-busy') === 'false', { timeout: 15000 });
await page.waitForFunction(() => document.getElementById('cr-trending-list')?.getAttribute('aria-busy') === 'false', { timeout: 15000 });
await page.waitForFunction(() => document.getElementById('cr-creators-list')?.getAttribute('aria-busy') === 'false', { timeout: 15000 });

const title = await page.title();
console.log('title:', title);

const feedHTML = await page.$eval('#cr-feed', (el) => el.innerHTML.slice(0, 300));
console.log('feed (empty state check):', feedHTML.includes('cr-empty') ? 'EMPTY STATE RENDERED' : 'ITEMS RENDERED');

const trendingHTML = await page.$eval('#cr-trending-list', (el) => el.innerHTML.slice(0, 200));
console.log('trending list:', trendingHTML.includes('cr-lb-empty') ? 'EMPTY STATE RENDERED' : 'ROWS RENDERED');

const creatorsHTML = await page.$eval('#cr-creators-list', (el) => el.innerHTML.slice(0, 200));
console.log('creators list:', creatorsHTML.includes('cr-lb-empty') ? 'EMPTY STATE RENDERED' : 'ROWS RENDERED');

// Exercise search + sort + category controls for real (no mocked responses).
await page.fill('#cr-q', 'dragon');
await page.waitForTimeout(600); // debounce
await page.click('[data-sort="remixed"]');
await page.waitForTimeout(400);
await page.selectOption('#cr-category', 'avatar');
await page.waitForTimeout(400);
await page.click('[data-sort="recent"]');
await page.waitForTimeout(400);
await page.fill('#cr-q', '');
await page.selectOption('#cr-category', '');
await page.waitForTimeout(400);

// Publish form interactivity (no submit — just check it renders/updates).
await page.fill('#cr-pub-id', 'test-id-not-submitted');
await page.fill('#cr-pub-royalty', '15');
await page.evaluate(() => document.getElementById('cr-pub-royalty').dispatchEvent(new Event('input')));
const royaltyOut = await page.$eval('#cr-pub-royalty-out', (el) => el.textContent);
console.log('royalty output updates on drag:', royaltyOut);

await page.screenshot({ path: '/tmp/claude-1000/-workspaces-three-ws/3af649c2-981d-4e27-bcc7-a1b386bdb681/scratchpad/creations-empty.png', fullPage: true });

// Mobile viewport check
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/claude-1000/-workspaces-three-ws/3af649c2-981d-4e27-bcc7-a1b386bdb681/scratchpad/creations-mobile.png', fullPage: true });

console.log('\n--- console errors ---');
console.log(errors.length ? errors.join('\n') : '(none)');
console.log('\n--- console warnings ---');
console.log(warnings.length ? warnings.join('\n') : '(none)');
console.log('\n--- network failures ---');
console.log(networkFailures.length ? networkFailures.join('\n') : '(none)');

await browser.close();
process.exit(errors.length ? 1 : 0);
