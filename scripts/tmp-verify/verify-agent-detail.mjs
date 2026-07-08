import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:45601';
const AGENT_ID = process.argv[2] || '42534db3-f8f8-48ae-a4cb-ad8b9b42b2d7';
const errors = [];
const warnings = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });

page.on('console', (msg) => {
	if (msg.type() === 'error') errors.push(msg.text());
	if (msg.type() === 'warning') warnings.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

console.log(`→ navigating to /agents/${AGENT_ID}`);
await page.goto(`${BASE}/agents/${AGENT_ID}`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(3000); // let fire-and-forget renders (launch history, creations) settle

const title = await page.title();
console.log('title:', title);

const creationsCardHidden = await page.$eval('#ad-creations-card', (el) => el.hidden).catch(() => 'not found');
console.log('ad-creations-card hidden:', creationsCardHidden);

const appErrors = errors.filter((e) => !/websocket|WebSocket/i.test(e));
console.log('\n--- console errors (app-relevant) ---');
console.log(appErrors.length ? appErrors.join('\n') : '(none)');

await page.screenshot({ path: '/tmp/claude-1000/-workspaces-three-ws/3af649c2-981d-4e27-bcc7-a1b386bdb681/scratchpad/agent-detail.png', fullPage: false });

await browser.close();
process.exit(appErrors.length ? 1 : 0);
