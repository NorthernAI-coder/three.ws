#!/usr/bin/env node
/**
 * Seed api/_lib/oracle/known-wallets.json from kol-quest Solana wallet data.
 *
 * Sources (in order):
 *   1. nirholas/kol-quest — pre-built solwallets.json (smart_degen, kol, sniper, top_dev, pump_smart)
 *   2. GMGN API — live top wallets for Solana (supplements/overrides with fresher pnl data)
 *
 * Run locally and commit the result. The known-wallets.json is a static prior;
 * the cron at api/crons/kol-sync refreshes a DB table with live scores.
 *
 * Usage:
 *   node scripts/seed-known-wallets.mjs           # full refresh
 *   node scripts/seed-known-wallets.mjs --dry     # print stats only
 *   node scripts/seed-known-wallets.mjs --gmgn-only  # skip kol-quest, GMGN only
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../api/_lib/oracle/known-wallets.json');

const DRY = process.argv.includes('--dry');
const GMGN_ONLY = process.argv.includes('--gmgn-only');

// ── label mapping: kol-quest category → Oracle label ─────────────────────────
const CATEGORY_LABEL = {
	smart_degen: 'smart_money',
	pump_smart:  'smart_money',
	kol:         'kol',
	sniper:      'sniper',
	top_dev:     'top_dev',
	fresh_wallet: null,   // skip — not proven
};

// ── fetch helpers ─────────────────────────────────────────────────────────────
const GMGN_HEADERS = {
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	'Accept': 'application/json, */*',
	'Accept-Language': 'en-US,en;q=0.9',
	'Referer': 'https://gmgn.ai/',
	'Origin': 'https://gmgn.ai',
};

async function fetchJson(url, opts = {}) {
	const r = await fetch(url, { headers: GMGN_HEADERS, ...opts });
	if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);
	return r.json();
}

async function fetchWithRetry(url, retries = 3, delay = 2000) {
	for (let i = 0; i < retries; i++) {
		try {
			return await fetchJson(url);
		} catch (err) {
			if (i === retries - 1) throw err;
			console.warn(`  retry ${i + 1}/${retries} — ${err.message}`);
			await new Promise(r => setTimeout(r, delay * (i + 1)));
		}
	}
}

// ── source 1: kol-quest pre-built solwallets.json ─────────────────────────────
async function fetchKolQuest() {
	console.log('Fetching kol-quest solwallets.json ...');
	const url = 'https://raw.githubusercontent.com/nirholas/kol-quest/main/site/data/solwallets.json';
	let data;
	try {
		data = await fetchWithRetry(url);
	} catch (err) {
		console.warn(`  kol-quest fetch failed: ${err.message}. Skipping this source.`);
		return {};
	}

	const wallets = {};
	const smartMoney = data?.smartMoney?.wallets || {};
	const kolWallets = data?.kol?.wallets || [];

	// smart_degen, sniper, fresh_wallet, top_dev, pump_smart
	for (const [category, entries] of Object.entries(smartMoney)) {
		const label = CATEGORY_LABEL[category];
		if (!label || !Array.isArray(entries)) continue;
		for (const entry of entries) {
			const addr = entry.wallet_address || entry.address;
			if (!addr || addr.length < 30) continue;
			wallets[addr] = {
				label,
				tag: category,
				pnl_30d: entry.pnl_30d ?? null,
				profit_30d_usd: entry.realized_profit_30d ?? null,
				win_rate_30d: entry.winrate_30d ?? null,
			};
		}
	}
	// kol entries
	for (const entry of kolWallets) {
		const addr = entry.wallet_address || entry.address;
		if (!addr || addr.length < 30) continue;
		wallets[addr] = {
			label: 'kol',
			tag: 'kol',
			pnl_30d: entry.pnl_30d ?? null,
			profit_30d_usd: entry.realized_profit_30d ?? null,
			win_rate_30d: entry.winrate_30d ?? null,
			twitter_username: entry.twitter_username ?? null,
		};
	}

	console.log(`  kol-quest: ${Object.keys(wallets).length} Solana wallets`);
	return wallets;
}

// ── source 2: GMGN live rankings ─────────────────────────────────────────────
const GMGN_CATEGORIES = ['smart_degen', 'kol', 'sniper', 'top_dev', 'pump_smart'];
const GMGN_TF = '30d';
const GMGN_PAGES = 2; // 200 per category = 1000 total max

async function fetchGmgn() {
	console.log('Fetching GMGN live rankings ...');
	const wallets = {};
	let total = 0;

	for (const category of GMGN_CATEGORIES) {
		const label = CATEGORY_LABEL[category];
		if (!label) continue;
		let count = 0;
		for (let page = 1; page <= GMGN_PAGES; page++) {
			const url = `https://gmgn.ai/defi/quotation/v1/rank/sol/${category}/${GMGN_TF}?orderby=pnl_${GMGN_TF}&direction=desc&page=${page}&limit=100`;
			try {
				const data = await fetchWithRetry(url);
				const entries = data?.data?.rank || [];
				if (!entries.length) break;
				for (const entry of entries) {
					const addr = entry.wallet_address || entry.address;
					if (!addr || addr.length < 30) continue;
					// GMGN wins over kol-quest for fresher pnl data.
					wallets[addr] = {
						label,
						tag: category,
						pnl_30d: entry.pnl_30d ?? null,
						profit_30d_usd: entry.realized_profit_30d ?? null,
						win_rate_30d: entry.winrate_30d ?? null,
					};
					count++;
				}
				// Polite pause between pages
				await new Promise(r => setTimeout(r, 800));
			} catch (err) {
				console.warn(`  GMGN ${category} page ${page}: ${err.message}`);
				break;
			}
		}
		console.log(`  GMGN ${category}: ${count} wallets`);
		total += count;
		// Pause between categories
		await new Promise(r => setTimeout(r, 1200));
	}

	console.log(`  GMGN total: ${total} wallets`);
	return wallets;
}

// ── main ──────────────────────────────────────────────────────────────────────
const merged = {};

if (!GMGN_ONLY) {
	const kq = await fetchKolQuest();
	Object.assign(merged, kq);
}

const gmgn = await fetchGmgn();
// GMGN overwrites kol-quest (fresher data)
Object.assign(merged, gmgn);

// ── stats ─────────────────────────────────────────────────────────────────────
const counts = {};
for (const w of Object.values(merged)) {
	counts[w.label] = (counts[w.label] || 0) + 1;
}
const total = Object.keys(merged).length;

console.log('');
console.log(`── Results ──────────────────────────────────────────────────────`);
console.log(`  Total wallets : ${total}`);
for (const [label, n] of Object.entries(counts)) {
	console.log(`    ${label.padEnd(14)} : ${n}`);
}

if (DRY) {
	console.log('[dry-run] Not writing known-wallets.json');
	process.exit(0);
}

const output = {
	meta: {
		source: 'gmgn.ai + nirholas/kol-quest',
		total,
		counts,
		updated_at: new Date().toISOString(),
	},
	wallets: merged,
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 0));
console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);
