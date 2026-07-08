// Verification-only: intercepts the tokenized-launches response to confirm the
// renderMintedCreations() populated-card path renders without throwing. No
// mocked data ships anywhere — this script is deleted after verification; it
// only proves the DOM-construction code is correct, since production currently
// has zero tokenized_3d_assets rows (the feature just shipped this session).
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:45601';
const AGENT_ID = process.argv[2] || '42534db3-f8f8-48ae-a4cb-ad8b9b42b2d7';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.route('**/api/v1/tokenized/launches**', async (route) => {
	const url = new URL(route.request().url());
	if (url.searchParams.get('network') === 'devnet') return route.continue();
	await route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({
			data: {
				launches: [
					{
						mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpumpTEST1',
						network: 'mainnet',
						name: 'Test Chrome Rocket',
						glb_url: 'https://three.ws/cdn/test.glb',
						viewer_url: 'https://three.ws/viewer?src=test',
						royalty: { basis_points: 500, percent: 5, recipient: null },
						parent_mint: null,
						remix_royalty: null,
						created_at: new Date().toISOString(),
						agent: { id: AGENT_ID, name: 'Simply Sage', url: `/agents/${AGENT_ID}` },
					},
					{
						mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpumpTEST2',
						network: 'mainnet',
						name: 'Remixed Sneaker',
						glb_url: 'https://three.ws/cdn/test2.glb',
						viewer_url: 'https://three.ws/viewer?src=test2',
						royalty: { basis_points: 800, percent: 8, recipient: 'somewallet' },
						parent_mint: 'someParentMint',
						remix_royalty: { paid: true, creator_usd: 0.02 },
						created_at: new Date(Date.now() - 3600_000).toISOString(),
						agent: { id: AGENT_ID, name: 'Simply Sage', url: `/agents/${AGENT_ID}` },
					},
				],
				has_more: false,
				offset: 0,
				limit: 6,
				network: 'mainnet',
			},
		}),
	});
});

await page.goto(`${BASE}/agents/${AGENT_ID}`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);

const hidden = await page.$eval('#ad-creations-card', (el) => el.hidden);
const bodyText = await page.$eval('#ad-creations-body', (el) => el.innerText);
console.log('card hidden (should be false):', hidden);
console.log('body text:\n', bodyText);

await page.$eval('#ad-creations-card', (el) => el.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/claude-1000/-workspaces-three-ws/3af649c2-981d-4e27-bcc7-a1b386bdb681/scratchpad/agent-detail-populated.png', fullPage: false });

const appErrors = errors.filter((e) => !/websocket|WebSocket|CORS|401/i.test(e));
console.log('\n--- app-relevant console errors ---');
console.log(appErrors.length ? appErrors.join('\n') : '(none)');

await browser.close();
process.exit(hidden || appErrors.length ? 1 : 0);
