// Headless smoke test for the notifications / activity center (public/notifications.js
// + the .notif-* styles in nav.css). Stubs window.fetch so we exercise every render
// state without a backend: signed-out (401), loading → populated, empty, error, and
// the mark-all-read flow. Asserts DOM (robust), checks XSS-inertness and deep-link
// hrefs, and saves one screenshot of the populated panel to /tmp.
//
//   node scripts/notif-widget-smoke.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const css = readFileSync(new URL('../public/nav.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/notifications.js', import.meta.url), 'utf8');

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const SAMPLE = [
	{ id: 'n1', type: 'payment_received', read_at: null, created_at: iso(5000),
		payload: { agent_id: 'agent-abc', agent_name: 'Oracle', skill: 'forecast', net_amount: '250000', currency_mint: USDC } },
	{ id: 'n2', type: 'skill_purchased', read_at: null, created_at: iso(120000),
		payload: { agent_id: 'agent-abc', skill: 'mocap', net_amount: '1500000', currency_mint: USDC } },
	{ id: 'n3', type: 'asset_purchase_confirmed', read_at: iso(3600000), created_at: iso(3600000),
		payload: { item_type: 'avatar', item_id: 'x9', amount: '5000000', currency_mint: USDC } },
	{ id: 'n4', type: 'withdrawal_completed', read_at: iso(90000000), created_at: iso(90000000),
		payload: { amount: '10000000', currency_mint: USDC, chain: 'solana', tx_signature: 'SoLsiG123' } },
	// XSS attempt in a server-supplied field — must render as inert text.
	{ id: 'n5', type: 'payment_received', read_at: null, created_at: iso(7200000),
		payload: { agent_id: 'agent-xss', agent_name: '<img src=x onerror=alert(1)>', net_amount: '1000', currency_mint: USDC } },
];

function harness(mode) {
	return `<!doctype html><html><head><meta charset="utf8"><style>
:root{--text-md:13px;--text-sm:12px;--text-2xs:10px;--text-xs:9px;--text-ui:13px;--nv-bg:#050505;--nv-text:#fff;--nv-text-2:rgba(255,255,255,.6);}
body{background:#0b0c10;margin:0;height:100vh}
.host{position:fixed;top:14px;right:20px}
${css}</style></head>
<body>
<div class="host">
  <button type="button" class="nav-notif-btn" id="nav-notifications-btn" aria-label="Notifications" aria-expanded="false" aria-haspopup="dialog" title="Notifications">
    <svg class="nav-notif-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" width="18" height="18"><path d="M15 9A5 5 0 0 0 5 9c0 4-2 5-2 5h14s-2-1-2-5"/></svg>
    <span class="nav-notif-badge" hidden aria-live="polite"></span>
  </button>
</div>
<script>
try { localStorage.setItem('3dagent:auth-hint', JSON.stringify({ authed: ${mode === 'signedout' ? 'false' : 'true'}, name: 'me' })); } catch(e){}
window.__MODE = ${JSON.stringify(mode)};
window.__posted = [];
window.fetch = function(url, opts){
  url = String(url);
  if (url.indexOf('/api/notifications') === 0 && (!opts || (opts.method||'GET')==='GET')) {
    if (window.__MODE === 'signedout') return Promise.resolve({ ok:false, status:401, json:function(){return Promise.resolve({});} });
    if (window.__MODE === 'error') return Promise.reject(new Error('network down'));
    var list = window.__MODE === 'empty' ? [] : ${JSON.stringify(SAMPLE)};
    var unread = list.filter(function(n){return !n.read_at;}).length;
    return Promise.resolve({ ok:true, status:200, json:function(){ return Promise.resolve({ notifications:list, unread_count:unread }); } });
  }
  // POST read / read-all
  window.__posted.push({ url:url, method:(opts&&opts.method)||'GET' });
  return Promise.resolve({ ok:true, status:200, json:function(){return Promise.resolve({});} });
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
	await page.waitForSelector('#nav-notifications-btn', { timeout: 5000 });
	await new Promise((r) => setTimeout(r, 250)); // let the boot fetch resolve

	const badgeBefore = await page.$eval('.nav-notif-badge', (n) => ({ hidden: n.hidden, text: n.textContent }));

	await page.evaluate(() => window.__twsNotif.open());
	await new Promise((r) => setTimeout(r, 200));

	const out = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('.notif-row')].filter((r) => r.querySelector('.notif-row-msg'));
		const empty = document.querySelector('.notif-empty');
		return {
			panelOpen: !!document.querySelector('.notif-panel') && !document.querySelector('.notif-panel').hidden,
			rowCount: rows.length,
			firstRowText: rows[0] ? rows[0].querySelector('.notif-row-msg').textContent : null,
			firstRowHref: rows[0] ? rows[0].getAttribute('href') : null,
			unreadDots: document.querySelectorAll('.notif-unread-dot').length,
			emptyTitle: empty ? (empty.querySelector('.notif-empty-title') || {}).textContent : null,
			signinHref: empty && empty.querySelector('.notif-signin-btn') ? empty.querySelector('.notif-signin-btn').getAttribute('href') : null,
			hasInjectedImg: !!document.querySelector('.notif-panel img'),
			dialogRole: document.querySelector('.notif-panel') ? document.querySelector('.notif-panel').getAttribute('role') : null,
			markAllDisabled: document.querySelector('.notif-mark-all') ? document.querySelector('.notif-mark-all').disabled : null,
		};
	});
	out.badgeBefore = badgeBefore;

	let shot = null;
	if (mode === 'full') {
		shot = '/tmp/notif-populated.png';
		await page.screenshot({ path: shot });

		// Exercise mark-all-read.
		await page.evaluate(() => document.querySelector('.notif-mark-all').click());
		await new Promise((r) => setTimeout(r, 100));
		out.afterMarkAll = await page.evaluate(() => ({
			badgeHidden: document.querySelector('.nav-notif-badge').hidden,
			unreadDots: document.querySelectorAll('.notif-unread-dot').length,
			markAllDisabled: document.querySelector('.notif-mark-all').disabled,
			postedReadAll: window.__posted.some((p) => /\/read-all$/.test(p.url) && p.method === 'POST'),
		}));
	}

	await page.close();
	return { mode, out, errors, shot };
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
let pass = true;
for (const mode of ['full', 'empty', 'error', 'signedout']) {
	const { out, errors, shot } = await scenario(browser, mode);
	const checks = [];
	checks.push(['panel opens', out.panelOpen === true]);
	checks.push(['dialog role for a11y', out.dialogRole === 'dialog']);
	if (mode === 'full') {
		checks.push(['all rows render', out.rowCount === SAMPLE.length]);
		checks.push(['badge shows unread count', out.badgeBefore.hidden === false && out.badgeBefore.text === '3']);
		checks.push(['payment row text', /Oracle earned 0\.25 USDC for forecast/.test(out.firstRowText || '')]);
		checks.push(['payment row deep-links to /agent/', out.firstRowHref === '/agent/agent-abc']);
		checks.push(['unread rows get a dot', out.unreadDots === 3]);
		checks.push(['XSS rendered inert (no <img>)', out.hasInjectedImg === false]);
		checks.push(['no alert dialog fired', !errors.some((e) => e.includes('DIALOG'))]);
		checks.push(['mark-all clears badge', out.afterMarkAll && out.afterMarkAll.badgeHidden === true]);
		checks.push(['mark-all clears unread dots', out.afterMarkAll && out.afterMarkAll.unreadDots === 0]);
		checks.push(['mark-all disables button', out.afterMarkAll && out.afterMarkAll.markAllDisabled === true]);
		checks.push(['mark-all POSTs read-all', out.afterMarkAll && out.afterMarkAll.postedReadAll === true]);
	}
	if (mode === 'empty') checks.push(['empty state shown', out.emptyTitle === "You're all caught up"]);
	if (mode === 'error') checks.push(['error state shown', out.emptyTitle === "Couldn't load notifications"]);
	if (mode === 'signedout') {
		checks.push(['signed-out state shown', out.emptyTitle === 'Sign in to see your activity']);
		checks.push(['sign-in links to /login', out.signinHref === '/login']);
		checks.push(['no badge for anon', out.badgeBefore.hidden === true]);
	}
	checks.push(['no page errors', errors.filter((e) => !e.includes('DIALOG')).length === 0]);

	console.log(`\n[${mode}]` + (shot ? ` (screenshot: ${shot})` : ''));
	for (const [name, ok] of checks) {
		console.log(`  ${ok ? '✓' : '✗'} ${name}`);
		if (!ok) pass = false;
	}
	if (errors.length) console.log('  errors:', errors);
}
await browser.close();
console.log(pass ? '\nPASS — all notification states verified' : '\nFAIL');
process.exit(pass ? 0 : 1);
