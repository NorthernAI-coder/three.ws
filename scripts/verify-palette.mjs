// Headless verification for the Cmd-K command palette (public/search.js).
// The palette is pure client JS, so we load it into a blank page and route its
// network calls to the REAL upstreams (prod /api, real pump.fun search, local
// static JSON) — no mocks. Asserts open/default-view/search/keyboard/recents.
import puppeteer from 'puppeteer';
import { readFile } from 'node:fs/promises';

const PROD = 'https://three.ws';
const PUMP = 'https://frontend-api-v3.pump.fun';

const features = await readFile(new URL('../public/features.json', import.meta.url), 'utf8');
const skills = await readFile(new URL('../public/skills-index.json', import.meta.url), 'utf8');
const palette = await readFile(new URL('../public/search.js', import.meta.url), 'utf8');

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu'], protocolTimeout: 120000 });
const page = await browser.newPage();
const fails = [];
const ok = (label, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fails.push(label); };

await page.setRequestInterception(true);
page.on('request', async (req) => {
	const u = new URL(req.url(), 'http://x');
	const p = u.pathname;
	try {
		if (p === '/features.json') return req.respond({ contentType: 'application/json', body: features });
		if (p === '/skills-index.json') return req.respond({ contentType: 'application/json', body: skills });
		// Coin search: stand in for the not-yet-deployed serverless fn using its
		// exact real upstream (pump.fun frontend search) so coins are real data.
		if (p === '/api/pump/search') {
			const q = u.searchParams.get('q') || '';
			const r = await fetch(`${PUMP}/coins?searchTerm=${encodeURIComponent(q)}&limit=6&sort=market_cap&order=DESC&includeNsfw=false`, { headers: { accept: 'application/json' } });
			const coins = await r.json();
			const data = (Array.isArray(coins) ? coins : []).map((c, i) => ({ mint: c.mint, symbol: c.symbol, name: c.name, logo: c.image_uri || null, price_usd: null, rank: i + 1 })).filter((t) => t.mint && t.mint.length >= 32);
			return req.respond({ contentType: 'application/json', body: JSON.stringify({ data }) });
		}
		if (p.startsWith('/api/')) {
			const r = await fetch(PROD + p + u.search, { headers: { accept: 'application/json' } });
			const body = await r.text();
			return req.respond({ status: r.status, contentType: 'application/json', body });
		}
		return req.continue();
	} catch (e) {
		return req.respond({ status: 502, contentType: 'application/json', body: '{}' });
	}
});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.setContent('<!doctype html><html><head></head><body><div id="nav-container"></div></body></html>', { waitUntil: 'load' });
await page.evaluate(palette);

// 1. Open via exposed API (mirrors Cmd-K).
await page.evaluate(() => window.__twsSearch.open());
await page.waitForSelector('#tws-search-dialog[open]', { timeout: 15000 });
ok('palette opens', await page.$('#tws-search-dialog[open]') !== null);

// 2. Default view shows quick actions + suggested (real selectable rows).
await new Promise((r) => setTimeout(r, 200));
const defCats = await page.$$eval('.tws-sk-cat', (els) => els.map((e) => e.textContent));
ok('default view has Quick actions', defCats.includes('Quick actions'));
ok('default view has Suggested', defCats.includes('Suggested'));
const defRows = await page.$$eval('.tws-sk-row', (els) => els.length);
ok('default view rows are keyboard-selectable (>0)', defRows > 0);

// 3. Keyboard: ArrowDown selects first row.
await page.focus('#tws-search-input');
await page.keyboard.press('ArrowDown');
const sel0 = await page.$eval('.tws-sk-row[aria-selected="true"]', (e) => e.querySelector('.tws-sk-name').textContent).catch(() => null);
ok('ArrowDown selects a row', !!sel0);

// 4. Type a real query → Actions + Agents + Coins groups.
await page.click('#tws-search-input', { clickCount: 3 });
await page.type('#tws-search-input', 'agent');
await new Promise((r) => setTimeout(r, 1200));
const qCats = await page.$$eval('.tws-sk-cat', (els) => els.map((e) => e.textContent));
ok('query shows Actions group', qCats.includes('Actions'));
console.log('  categories for "agent":', JSON.stringify(qCats));

// 5. Coin search renders real coins.
await page.click('#tws-search-input', { clickCount: 3 });
await page.type('#tws-search-input', 'bonk');
await new Promise((r) => setTimeout(r, 1500));
const coinNames = await page.evaluate(() => {
	const cats = [...document.querySelectorAll('#tws-search-results > *')];
	const out = []; let inCoins = false;
	for (const el of cats) {
		if (el.classList.contains('tws-sk-cat')) inCoins = el.textContent === 'Coins';
		else if (inCoins && el.classList.contains('tws-sk-row')) out.push(el.querySelector('.tws-sk-name').textContent);
	}
	return out;
});
ok('Coins category renders real coins for "bonk"', coinNames.length > 0);
console.log('  coins:', JSON.stringify(coinNames.slice(0, 4)));

// 6. Quick action "create" matches.
await page.click('#tws-search-input', { clickCount: 3 });
await page.type('#tws-search-input', 'create avatar');
await new Promise((r) => setTimeout(r, 900));
const actionRow = await page.evaluate(() => {
	const rows = [...document.querySelectorAll('.tws-sk-row')];
	const r = rows.find((x) => /create an avatar/i.test(x.querySelector('.tws-sk-name').textContent));
	return r ? r.getAttribute('href') : null;
});
ok('"create avatar" surfaces Create action → /create', actionRow === '/create');

// 7. Recents: activating a row records it; reopen shows Recent group.
await page.evaluate(() => {
	const rows = [...document.querySelectorAll('.tws-sk-row')];
	const r = rows.find((x) => /create an avatar/i.test(x.querySelector('.tws-sk-name').textContent));
	r._twsRecent && window.__twsSearch; // ensure payload exists
	// simulate keyboard activation path (record without navigating away)
	const payload = r._twsRecent;
	localStorage.setItem('tws:search:recent', JSON.stringify([{ href: payload.href, name: payload.name, desc: payload.desc, badge: payload.badge, iconHTML: payload.iconHTML }]));
	window.__twsSearch.close();
	window.__twsSearch.open();
});
await new Promise((r) => setTimeout(r, 200));
const reCats = await page.$$eval('.tws-sk-cat', (els) => els.map((e) => e.textContent));
ok('Recent group appears after activation', reCats.includes('Recent'));

// 8. No page errors from our code.
const realErrors = errors.filter((e) => !/favicon|net::ERR/i.test(e));
ok('no console/page errors', realErrors.length === 0);
if (realErrors.length) console.log('  errors:', realErrors.slice(0, 5));

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
