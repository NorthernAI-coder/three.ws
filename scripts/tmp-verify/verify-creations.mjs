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
// Wait for aria-busy to fully settle between each interaction so successive
// fetches never overlap (matches the app's own `state.loading` guard).
const settled = () => page.waitForFunction(() => document.getElementById('cr-feed')?.getAttribute('aria-busy') === 'false', { timeout: 15000 });

await page.fill('#cr-q', 'dragon');
await page.waitForTimeout(500); // debounce window
await settled();
await page.click('[data-sort="remixed"]');
await settled();
await page.selectOption('#cr-category', 'avatar');
await settled();
await page.click('[data-sort="recent"]');
await settled();
await page.fill('#cr-q', '');
await page.waitForTimeout(500);
await settled();
await page.selectOption('#cr-category', '');
await settled();

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

// Filter out known dev-environment noise unrelated to the app: Vite HMR's
// websocket auto-targets the Codespace's port-3000 forwarding domain
// regardless of which port this ad-hoc verification server actually runs on.
const appErrors = errors.filter((e) => !/websocket|WebSocket/i.test(e));

console.log('\n--- console errors (app-relevant) ---');
console.log(appErrors.length ? appErrors.join('\n') : '(none)');
console.log('\n--- console warnings ---');
console.log(warnings.length ? warnings.join('\n') : '(none)');
console.log('\n--- network failures ---');
console.log(networkFailures.length ? networkFailures.join('\n') : '(none)');

await browser.close();
process.exit(appErrors.length || networkFailures.length ? 1 : 0);
