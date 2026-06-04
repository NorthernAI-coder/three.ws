// Headless smoke test for the live activity ticker (public/feed.js + feed.css).
// Stubs window.fetch so we exercise every render state without a backend:
// loading → populated, empty, and error. Asserts DOM (robust) and saves one
// screenshot of the populated panel to /tmp for a visual gut-check.
//
//   node scripts/feed-widget-smoke.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const css = readFileSync(new URL('../public/feed.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/feed.js', import.meta.url), 'utf8');

const SAMPLE = [
	{ id: 'a1', type: 'coin-buy', ts: Date.now() - 4000, actor: '7xKq…9aP2', mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump', sol: 0.42, network: 'mainnet' },
	{ id: 'a2', type: 'agent-deploy', ts: Date.now() - 60000, actor: 'Nova Scout', agentId: 'abc-123', name: 'Nova Scout' },
	{ id: 'a3', type: 'level-up', ts: Date.now() - 600000, actor: 'pixelpilot', skill: 'fishing', level: 50 },
	{ id: 'a4', type: 'world-join', ts: Date.now() - 3600000, actor: 'gm_frog', coin: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump', coinName: '$THREE home town' },
	// An XSS attempt in a user-controlled field — must render as inert text.
	{ id: 'a5', type: 'world-join', ts: Date.now() - 7200000, actor: '<img src=x onerror=alert(1)>', coin: '', coinName: 'Mainland' },
];

function harness(payloadMode) {
	return `<!doctype html><html><head><meta charset="utf8"><style>body{background:#0b0c10;margin:0;height:100vh}${css}</style></head>
<body>
<script>
window.__FEED_MODE = ${JSON.stringify(payloadMode)};
window.fetch = function(){
  if (window.__FEED_MODE === 'error') return Promise.reject(new Error('network down'));
  var events = window.__FEED_MODE === 'empty' ? [] : ${JSON.stringify(SAMPLE)};
  return Promise.resolve({ ok:true, status:200, json:function(){ return Promise.resolve({ events:events, count:events.length }); } });
};
<\/script>
<script>${js}<\/script>
</body></html>`;
}

async function scenario(browser, mode) {
	const page = await browser.newPage();
	await page.setViewport({ width: 900, height: 700 });
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('dialog', async (d) => { errors.push('DIALOG(xss?):' + d.message()); await d.dismiss(); });
	await page.setContent(harness(mode), { waitUntil: 'load' });
	await page.waitForSelector('.tws-feed', { timeout: 5000 });
	// Let poll() resolve so the collapsed pill summary fills in.
	await new Promise((r) => setTimeout(r, 300));
	const pillText = await page.$eval('.tws-feed-pill-text', (n) => n.textContent.trim());
	// Drive the real expand path (the harness origin has no localStorage).
	await page.evaluate(() => window.__twsFeed.open());
	await new Promise((r) => setTimeout(r, 200));

	const out = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('.tws-feed-item')];
		const msg = document.querySelector('.tws-feed-msg');
		return {
			panelOpen: !document.querySelector('.tws-feed-panel').hidden,
			rowCount: rows.length,
			firstRowText: rows[0] ? rows[0].querySelector('.tws-feed-text').textContent : null,
			firstRowHref: rows[0] ? rows[0].getAttribute('href') : null,
			message: msg ? msg.querySelector('strong').textContent : null,
			hasInjectedImg: !!document.querySelector('.tws-feed-list img'),
			listRole: document.querySelector('.tws-feed-list').getAttribute('role'),
		};
	});
	out.pillText = pillText;

	let shot = null;
	if (mode === 'full') {
		shot = '/tmp/feed-populated.png';
		await page.screenshot({ path: shot });
	}
	await page.close();
	return { mode, out, errors, shot };
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
let pass = true;
for (const mode of ['full', 'empty', 'error']) {
	const { out, errors, shot } = await scenario(browser, mode);
	const checks = [];
	if (mode === 'full') {
		checks.push(['5 rows render', out.rowCount === 5]);
		checks.push(['collapsed pill summarizes latest', /aped 0\.42 SOL/.test(out.pillText || '')]);
		checks.push(['coin-buy text', /aped 0\.42 SOL into/.test(out.firstRowText || '')]);
		checks.push(['row links to /play?coin=', /\/play\?coin=/.test(out.firstRowHref || '')]);
		checks.push(['XSS rendered inert (no <img>)', out.hasInjectedImg === false]);
		checks.push(['no alert dialog fired', !errors.some((e) => e.includes('DIALOG'))]);
	}
	if (mode === 'empty') checks.push(['empty state shown', out.message === "It's quiet right now"]);
	if (mode === 'error') checks.push(['error state shown', out.message === 'Activity paused']);
	checks.push(['log role for a11y', out.listRole === 'log']);
	checks.push(['no page errors', errors.filter((e) => !e.includes('DIALOG')).length === 0]);

	console.log(`\n[${mode}]` + (shot ? ` (screenshot: ${shot})` : ''));
	for (const [name, ok] of checks) {
		console.log(`  ${ok ? '✓' : '✗'} ${name}`);
		if (!ok) pass = false;
	}
	if (errors.length) console.log('  errors:', errors);
}
await browser.close();
console.log(pass ? '\nPASS — all widget states verified' : '\nFAIL');
process.exit(pass ? 0 : 1);
