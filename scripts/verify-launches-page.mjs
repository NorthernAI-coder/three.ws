// One-off verification harness for the /launches feed page + agent-detail
// launch history. Stubs only the not-yet-deployed /api/pump/launches action
// (dev proxies /api to prod); everything else hits the real proxy.
// Run: node scripts/verify-launches-page.mjs   (expects vite on :4187)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4187';

const SYNTH = (n) => `THREEsynthetic${String(n).repeat(28)}`.slice(0, 40);

const STUB_LAUNCHES = {
	data: {
		launches: [
			{
				mint: SYNTH(1),
				network: 'mainnet',
				name: 'Test Coin One',
				symbol: 'TC1',
				buyback_bps: 250,
				metadata_uri: null,
				quote_mint: null,
				created_at: new Date(Date.now() - 3600e3).toISOString(),
				agent: {
					id: '11111111-2222-4333-8444-555555555555',
					name: 'Verifier Agent',
					url: '/agents/11111111-2222-4333-8444-555555555555',
					avatar_thumbnail_url: null,
				},
			},
			{
				mint: SYNTH(2),
				network: 'mainnet',
				name: 'Long Coin Name That Should Ellipsize Gracefully In The Card',
				symbol: 'LONGNAME',
				buyback_bps: 0,
				metadata_uri: null,
				quote_mint: null,
				created_at: new Date(Date.now() - 86400e3 * 3).toISOString(),
				agent: null,
			},
		],
		has_more: true,
		offset: 0,
		limit: 24,
		network: 'mainnet',
	},
};

const results = [];
const check = (name, ok, extra = '') =>
	results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => {
	if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// ── 1. populated feed (stubbed registry, real everything else) ──────────────
await page.route('**/api/pump/launches*', (route) =>
	route.fulfill({ json: STUB_LAUNCHES }),
);
await page.goto(`${BASE}/launches`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.lx-card', { timeout: 10000 });
check('feed renders cards', (await page.locator('.lx-card').count()) === 2);
check('coin name shown', await page.locator('.lx-coin-name').first().textContent() === 'Test Coin One');
check('buyback badge', (await page.locator('.lx-badge-buyback').count()) === 1);
check('agent chip links to agent page',
	(await page.locator('.lx-agent-row[href="/agents/11111111-2222-4333-8444-555555555555"]').count()) === 1);
check('unknown agent fallback', (await page.locator('.lx-agent-row[aria-disabled]').count()) === 1);
check('load more button (has_more)', await page.locator('#lx-footer-state button').isVisible());
check('count label', /2\+ launches/.test(await page.locator('#lx-count').textContent()));
check('world link present', (await page.locator(`.lx-action[href="/communities/${SYNTH(1)}"]`).count()) === 1);
check('nav has Agent Launches link', (await page.locator('a[href="/launches"]').count()) >= 1);

// hover/focus states exist (computed style changes are CSS-driven; just assert focusability)
await page.locator('.lx-agent-row').first().focus();
check('agent row focusable', await page.evaluate(() => document.activeElement?.classList.contains('lx-agent-row')));

// ── 2. empty state ───────────────────────────────────────────────────────────
await page.unroute('**/api/pump/launches*');
await page.route('**/api/pump/launches*', (route) =>
	route.fulfill({ json: { data: { launches: [], has_more: false, offset: 0, limit: 24, network: 'mainnet' } } }),
);
await page.goto(`${BASE}/launches`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.lx-state', { timeout: 10000 });
check('empty state has CTA', await page.locator('.lx-state a[href="/create-agent"]').isVisible());

// ── 3. error state (real proxy → prod, where action 404s until deploy) ──────
await page.unroute('**/api/pump/launches*');
await page.goto(`${BASE}/launches`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.lx-state[role="alert"], .lx-card', { timeout: 15000 });
const errVisible = (await page.locator('.lx-state[role="alert"]').count()) === 1;
const liveCards = await page.locator('.lx-card').count();
check('error state OR live data from prod', errVisible || liveCards > 0,
	errVisible ? 'error state w/ retry (endpoint not deployed yet)' : `${liveCards} live cards`);
if (errVisible) check('retry button present', await page.locator('.lx-state button').isVisible());

// ── 4. devnet toggle + url sync ──────────────────────────────────────────────
await page.route('**/api/pump/launches*', (route) => {
	const url = new URL(route.request().url());
	check('toggle requests devnet', url.searchParams.get('network') === 'devnet');
	route.fulfill({ json: { data: { launches: [], has_more: false, offset: 0, limit: 24, network: 'devnet' } } });
});
await page.locator('.lx-net-btn[data-network="devnet"]').click();
await page.waitForSelector('.lx-state', { timeout: 10000 });
check('url carries network=devnet', page.url().includes('network=devnet'));

// ── 5. agent-detail launch history (stub by-agent) ──────────────────────────
const AGENT_ID = '11111111-2222-4333-8444-555555555555';
await page.route('**/api/agents/**', (route) =>
	route.fulfill({
		json: { agent: { id: AGENT_ID, name: 'Verifier Agent', description: 'test', skills: [], meta: {}, onchain: null, token: null, payments: null, is_registered: false } },
	}),
);
await page.route('**/api/pump/by-agent*', (route) =>
	route.fulfill({
		json: {
			data: { mint: SYNTH(3), network: 'mainnet', name: 'History Coin', symbol: 'HC3', buyback_bps: 0, created_at: new Date().toISOString() },
			coins: [
				{ mint: SYNTH(3), network: 'mainnet', name: 'History Coin', symbol: 'HC3', buyback_bps: 0, created_at: new Date().toISOString() },
				{ mint: SYNTH(4), network: 'devnet', name: 'Old Coin', symbol: 'OLD4', buyback_bps: 100, created_at: new Date(Date.now() - 86400e3 * 10).toISOString() },
			],
		},
	}),
);
await page.goto(`${BASE}/agents/${AGENT_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.ad-launch-history', { timeout: 15000 });
check('agent page launch history renders', (await page.locator('.ad-launch-row').count()) === 2);
check('history head shows count', /Launched coins \(2\)/.test(await page.locator('.ad-launch-history-head').textContent()));
check('feed link on agent page',
	(await page.locator(`.ad-launch-feed-link[href="/launches?agent_id=${AGENT_ID}"]`).count()) === 1);
check('devnet row links to explorer',
	(await page.locator('.ad-launch-row[href*="explorer.solana.com"]').count()) === 1);

// ── report ───────────────────────────────────────────────────────────────────
const ownErrors = consoleErrors.filter(
	(e) => !/posthog|client-errors|favicon|x402|third-party|net::ERR|Failed to load resource/i.test(e),
);
check('no console errors from our code', ownErrors.length === 0, ownErrors.slice(0, 3).join(' | '));

console.log(results.join('\n'));
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
