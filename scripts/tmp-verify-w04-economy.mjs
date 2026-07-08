// Real end-to-end verification for W04 (economy & money): a real Chromium
// browser against a real Vite dev server (localhost:3011) and a real,
// freshly-started Colyseus WalkRoom (localhost:2591) — no mocked physics, no
// mocked network, no mocked economy. A player fishes (real gather loop) to
// earn a sellable item from nothing (the starter kit has zero cash and zero
// sellable goods — nothing here is seeded), walks to the general store,
// sells the catch for real cash, buys a tool with it, then walks to the
// bank/ATM and deposits + withdraws cash — proving the whole off-schema cash
// economy end to end against the real WalkRoom message handlers added in
// this change. This box runs many concurrent agent build/dev/test processes
// (CLAUDE.md "known traps" — load average routinely far exceeds core count),
// which starves headless Chromium's frame rate well below a normal machine's;
// every wall-clock budget below is widened accordingly (mirrors
// scripts/tmp-verify-w02-vehicles.mjs). That affects wall-clock only, never
// the pass/fail economy assertions.

import { chromium } from 'playwright';

const BASE = 'http://localhost:3011';
const WS = 'ws://localhost:2591';
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const URL = `${BASE}/play?coin=${THREE_MINT}&name=three.ws&symbol=three`;

function fail(msg) { console.error('FAIL:', msg); process.exitCode = 1; }
function ok(msg) { console.log('OK:', msg); }

async function waitFor(page, fn, { timeout = 20000, interval = 200, label = 'condition', arg } = {}) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const v = await page.evaluate(fn, arg).catch(() => undefined);
		if (v) return v;
		await page.waitForTimeout(interval);
	}
	throw new Error(`timed out waiting for ${label}`);
}

function isBenignSandboxNoise(text) {
	return /favicon|WebGL.*SwiftShader|Autoplay|r2\.dev|\[vite\]|502 \(Bad Gateway\)|401 \(Unauthorized\)|402 \(Payment Required\)|GPU stall|GL Driver Message|app\.github\.dev|WebSocket closed without opened|deprecated parameters for the initialization function|AnimationManager.*failed to load|npc-zauth|429 \(Too Many Requests\)|ERR_CONNECTION_REFUSED|ERR_FAILED|agents\?limit/i.test(text);
}

const SCRATCH = '/tmp/claude-1000/-workspaces-three-ws/3af649c2-981d-4e27-bcc7-a1b386bdb681/scratchpad';

async function main() {
	const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
	const consoleIssues = [];
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	const page = await ctx.newPage();
	page.on('console', (msg) => {
		if (msg.type() === 'error' || msg.type() === 'warning') {
			const text = msg.text();
			if (isBenignSandboxNoise(text)) return;
			consoleIssues.push(`[${msg.type()}] ${text}`);
		}
	});
	page.on('pageerror', (err) => {
		if (isBenignSandboxNoise(err.message)) return;
		consoleIssues.push(`[pageerror] ${err.message}`);
	});
	await page.addInitScript((ws) => { window.GAME_SERVER_URL = ws; }, WS);

	console.log('--- navigating to', URL);
	await page.goto(URL, { waitUntil: 'domcontentloaded' });

	await waitFor(page, () => window.__CC__?.phase === 'world' && !!window.__CC__?.net?.sessionId, { timeout: 150000, label: 'joined world' });
	ok('Player joined the world (phase=world, connected)');

	const profile0 = await waitFor(page, () => window.__CC__?.playSystems?.profile, { timeout: 20000, label: 'initial profile' });
	ok(`Initial profile: gold=${profile0.gold}, inv slots filled=${profile0.inv.filter((s) => s.item).length} — starter kit has zero cash and nothing sellable, so any cash below came from real gameplay`);
	if (profile0.gold !== 0) fail(`expected a fresh guest to start with 0 gold, got ${profile0.gold}`);

	const npcSummary = await waitFor(page, () => {
		const npcs = window.__CC__?.worldLife?.npcs || [];
		return { count: npcs.length, store: npcs.filter((n) => n.id.startsWith('npc-store-')).length, bank: npcs.filter((n) => n.id.startsWith('npc-bank-')).length };
	}, { timeout: 15000, label: 'npc roster' });
	if (npcSummary.store < 1) fail('no general-store NPC found in the roster');
	else ok(`General store NPC(s) present: ${npcSummary.store}`);
	if (npcSummary.bank < 1) fail('no bank/ATM NPC found in the roster');
	else ok(`Bank/ATM NPC present: ${npcSummary.bank}`);

	async function walkTo(target, { rangeM = 3.5, timeoutMs = 480000 } = {}) {
		await page.evaluate((t) => {
			const cc = window.__CC__;
			const dx = t.x - cc.localPos.x, dz = t.z - cc.localPos.z;
			cc.camYaw = Math.atan2(dx, dz);
		}, target);
		await page.keyboard.down('Shift');
		await page.keyboard.down('w');
		const start = Date.now();
		let reached = false;
		let lastLog = 0;
		while (Date.now() - start < timeoutMs) {
			const d = await page.evaluate((t) => {
				const cc = window.__CC__;
				return Math.hypot(cc.localPos.x - t.x, cc.localPos.z - t.z);
			}, target);
			if (Date.now() - lastLog > 8000) { console.log(`   … ${d.toFixed(1)}m from target`); lastLog = Date.now(); }
			if (d <= rangeM) { reached = true; break; }
			await page.evaluate((t) => {
				const cc = window.__CC__;
				const dx = t.x - cc.localPos.x, dz = t.z - cc.localPos.z;
				cc.camYaw = Math.atan2(dx, dz);
			}, target);
			await page.waitForTimeout(300);
		}
		await page.keyboard.up('w');
		await page.keyboard.up('Shift');
		return reached;
	}

	// --- Earn real cash from nothing: fish at the nearest pond ----------------
	const pond = { x: 30, z: 8 }; // pond-east, multiplayer/src/world-features.js
	if (!(await walkTo(pond, { rangeM: 7 }))) fail('never reached the fishing pond');
	else ok('Walked to the fishing pond (real Rapier-driven on-foot movement)');

	await page.screenshot({ path: `${SCRATCH}/w04-01-at-pond.png` });

	let fishQty = 0;
	for (let i = 0; i < 40 && fishQty < 6; i++) {
		await page.evaluate(() => window.__CC__.net.fish());
		await page.waitForTimeout(1700);
		fishQty = await page.evaluate(() => {
			const inv = window.__CC__?.playSystems?.profile?.inv || [];
			const slot = inv.find((s) => s.item === 'fish');
			return slot ? slot.qty : 0;
		});
	}
	if (fishQty < 1) fail('never caught a single fish after 40 casts — fishing loop looks broken');
	else ok(`Caught ${fishQty} raw fish by casting at the pond (real server-rolled catches, real inventory)`);

	// --- General store: sell the real catch, buy a real tool ------------------
	const store = { x: 44, z: -44 }; // vendor-ne
	if (!(await walkTo(store))) fail('never reached the general store NPC');
	else ok('Walked to the general store NPC');

	await page.keyboard.press('e');
	const storeOpen = await waitFor(page, () => !!document.querySelector('.ec-overlay .ec-title')?.textContent?.includes('General Store'), { timeout: 10000, label: 'store panel open' });
	if (!storeOpen) fail('store panel did not open on E');
	else ok('Store panel opened (walk-up + E works)');
	await page.screenshot({ path: `${SCRATCH}/w04-02-store-open.png` });

	await page.click('.ec-tab:has-text("Sell")');
	await waitFor(page, () => document.querySelectorAll('.ec-row').length > 0, { timeout: 10000, label: 'sell rows populated' });
	const sellRowText = await page.evaluate(() => document.querySelector('.ec-row-name')?.textContent || '');
	ok(`Sell tab shows the real catch: "${sellRowText}"`);
	await page.screenshot({ path: `${SCRATCH}/w04-03-sell-tab.png` });

	const goldBeforeSell = await page.evaluate(() => window.__CC__.playSystems.profile.gold);
	await page.click('.ec-row .ec-row-btn:has-text("Sell all")');
	const goldAfterSell = await waitFor(page, (before) => {
		const g = window.__CC__?.playSystems?.profile?.gold;
		return Number.isFinite(g) && g > before ? g : null;
	}, { timeout: 10000, label: 'gold to increase after selling', arg: goldBeforeSell });
	if (!(goldAfterSell > goldBeforeSell)) fail(`gold did not increase after selling (before=${goldBeforeSell}, after=${goldAfterSell})`);
	else ok(`Sold the catch for real cash: gold ${goldBeforeSell} -> ${goldAfterSell}`);

	await page.click('.ec-tab:has-text("Buy")');
	await waitFor(page, () => document.querySelectorAll('.ec-row').length > 0, { timeout: 10000, label: 'buy rows populated' });
	// Buy whichever catalog row is affordable with the real cash just earned —
	// price-gated by the server (a client can't move it), so we read the live
	// DOM rather than assuming a fixed item is affordable.
	const affordableName = await page.evaluate(() => {
		const rows = [...document.querySelectorAll('.ec-row')];
		const row = rows.find((r) => !r.querySelector('.ec-row-btn')?.disabled);
		return row?.querySelector('.ec-row-name')?.textContent || null;
	});
	if (!affordableName) fail(`nothing affordable in the buy catalog with ${goldAfterSell} cash — widen the fishing loop`);
	else {
		ok(`Buying the cheapest affordable item: "${affordableName}"`);
		await page.click('.ec-row:not(:has(.ec-row-btn[disabled])) .ec-row-btn');
		const goldAfterBuy = await waitFor(page, (before) => {
			const g = window.__CC__?.playSystems?.profile?.gold;
			return Number.isFinite(g) && g < before ? g : null;
		}, { timeout: 10000, label: 'gold to decrease after buying', arg: goldAfterSell });
		if (!(goldAfterBuy < goldAfterSell)) fail(`gold did not decrease after buying (before=${goldAfterSell}, after=${goldAfterBuy})`);
		else ok(`Bought "${affordableName}" with real cash: gold ${goldAfterSell} -> ${goldAfterBuy}`);
	}

	await page.click('.ec-x');
	await page.waitForTimeout(400);
	const storeClosed = await page.evaluate(() => !document.querySelector('.ec-overlay.ec-on'));
	if (!storeClosed) fail('store panel did not close');
	else ok('Store panel closed');

	// --- Bank/ATM: deposit + withdraw the remaining real cash ------------------
	const atm = { x: 0, z: -30 };
	if (!(await walkTo(atm))) fail('never reached the bank/ATM NPC');
	else ok('Walked to the bank/ATM NPC');

	await page.keyboard.press('e');
	const bankOpen = await waitFor(page, () => !!document.querySelector('.ec-overlay .ec-title')?.textContent?.includes('Bank'), { timeout: 10000, label: 'bank panel open' });
	if (!bankOpen) fail('bank panel did not open on E');
	else ok('Bank panel opened');
	await page.screenshot({ path: `${SCRATCH}/w04-04-bank-open.png` });

	await waitFor(page, () => document.querySelectorAll('.ec-purse b').length >= 2, { timeout: 10000, label: 'bank purse/bank lines rendered' });
	const cashNow = await page.evaluate(() => Number(document.querySelectorAll('.ec-purse b')[0].textContent.replace(/,/g, '')));
	ok(`Bank panel shows real cash on hand: ${cashNow}`);
	if (cashNow < 1) { fail('no cash on hand to deposit — the store leg must have spent it all'); }
	else {
		await page.fill('.ec-bank-input', String(cashNow));
		await page.click('.ec-bank-amount .ec-row-btn:has-text("Deposit")');
		const afterDeposit = await waitFor(page, () => {
			const lines = document.querySelectorAll('.ec-purse b');
			if (lines.length < 2) return null;
			const bank = Number(lines[1].textContent.replace(/,/g, ''));
			return bank > 0 ? { cash: Number(lines[0].textContent.replace(/,/g, '')), bank } : null;
		}, { timeout: 10000, label: 'bank balance to update after deposit' });
		if (!afterDeposit) fail('bank balance did not increase after deposit');
		else ok(`Deposited ${cashNow} real cash — bank balance now ${afterDeposit.bank}, purse now ${afterDeposit.cash} (server-authoritative bankTransfer)`);

		await page.screenshot({ path: `${SCRATCH}/w04-05-bank-deposited.png` });

		const withdrawInputs = page.locator('.ec-bank-input');
		await withdrawInputs.nth(1).fill(String(afterDeposit.bank));
		await page.click('.ec-bank-amount:has(button:has-text("Withdraw")) .ec-row-btn');
		const afterWithdraw = await waitFor(page, (prevBank) => {
			const lines = document.querySelectorAll('.ec-purse b');
			if (lines.length < 2) return null;
			const bank = Number(lines[1].textContent.replace(/,/g, ''));
			return bank < prevBank ? { cash: Number(lines[0].textContent.replace(/,/g, '')), bank } : null;
		}, { timeout: 10000, label: 'bank balance to update after withdraw', arg: afterDeposit.bank });
		if (!afterWithdraw) fail('bank balance did not decrease after withdraw');
		else ok(`Withdrew the cash back — bank balance now ${afterWithdraw.bank}, purse now ${afterWithdraw.cash}`);
		await page.screenshot({ path: `${SCRATCH}/w04-06-bank-withdrawn.png` });
	}

	console.log('\n--- console issues:', consoleIssues.length);
	for (const l of consoleIssues) console.log('   ', l);
	if (consoleIssues.length) fail('console errors/warnings were logged during the run');

	await browser.close();
}

main().catch((err) => { console.error('SCRIPT ERROR:', err); process.exitCode = 1; });
