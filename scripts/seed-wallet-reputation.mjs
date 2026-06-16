#!/usr/bin/env node
// Seed wallet_reputation from gmgn.ai's public smart-money API.
//
// Cold-start problem: on day one we have no wallet reputation data, but gmgn.ai
// has years of it. This script fetches their ranked wallet lists (no key needed,
// same endpoints the browser uses) and upserts seed rows into wallet_reputation.
//
// Run once manually: node scripts/seed-wallet-reputation.mjs
// Or add to a cron: node scripts/seed-wallet-reputation.mjs --dry-run (preview)
//
// Safe: uses ON CONFLICT DO NOTHING for existing rows so running it again never
// downgrades a wallet we've already scored from live data.
//
// Source: nirholas/kol-quest GMGN fetcher patterns (adapted for Node.js / one-shot).

import { neon } from '@neondatabase/serverless';

const DRY_RUN = process.argv.includes('--dry-run');
const NETWORK = 'mainnet';
const GMGN_BASE = 'https://gmgn.ai/defi/quotation/v1';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const HEADERS = {
	'User-Agent': UA,
	'Accept': 'application/json, */*',
	'Accept-Language': 'en-US,en;q=0.9',
	'Referer': 'https://gmgn.ai/',
};

// Categories and timeframes to seed from
const CATEGORIES = ['smart_degen', 'pump_smart', 'kol', 'sniper', 'top_dev'];
const TIMEFRAMES = ['7d', '30d'];

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJSON(url, retries = 2) {
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const r = await fetch(url, { headers: HEADERS });
			if (r.status === 429) {
				console.warn(`  rate limited — waiting 10s (attempt ${attempt + 1}/${retries + 1})`);
				await sleep(10_000);
				continue;
			}
			if (!r.ok) { console.warn(`  HTTP ${r.status} for ${url}`); return null; }
			return await r.json();
		} catch (err) {
			console.warn(`  fetch error: ${err.message}`);
			if (attempt < retries) await sleep(2_000);
		}
	}
	return null;
}

function labelFromCategory(category, pnl30d, winrate30d, tags) {
	// Map gmgn category + stats → our wallet_reputation label
	if (category === 'sniper') return 'sniper';
	if (category === 'top_dev') return 'neutral'; // devs have different signal
	if (category === 'kol') return 'neutral';
	// smart_degen / pump_smart: score by win-rate
	if (winrate30d >= 0.65) return 'smart_money';
	if (winrate30d >= 0.45) return 'neutral';
	return 'unproven';
}

function gmgnSmartMoneyScore(category, winrate30d, winrate7d, pnl30d) {
	// Map gmgn data to our 0..100 smart_money_score
	const wr = winrate30d || winrate7d || 0;
	const cat = category === 'smart_degen' || category === 'pump_smart' ? 10 : 0;
	const pnlBonus = pnl30d > 10000 ? 10 : pnl30d > 1000 ? 5 : 0;
	return Math.min(100, Math.round(wr * 80 + cat + pnlBonus));
}

async function main() {
	if (!process.env.DATABASE_URL) {
		console.error('DATABASE_URL not set');
		process.exit(1);
	}
	const sql = neon(process.env.DATABASE_URL);

	// Deduplicate across categories/timeframes — keep the best stats
	const wallets = new Map(); // address -> bestRow

	for (const category of CATEGORIES) {
		for (const timeframe of TIMEFRAMES) {
			const url = `${GMGN_BASE}/rank/sol/${category}/${timeframe}?orderby=pnl_${timeframe}&direction=desc&page=1&limit=100`;
			console.log(`Fetching ${category}/${timeframe}...`);
			const data = await fetchJSON(url);
			await sleep(800);

			// gmgn returns { code: 0, data: { rank: [...] } } or { code: 0, data: [...] }
			const rank = data?.data?.rank || data?.data || [];
			if (!Array.isArray(rank)) { console.warn('  unexpected shape — skipping'); continue; }

			for (const w of rank) {
				const addr = w.wallet_address || w.address;
				if (!addr || typeof addr !== 'string' || addr.length < 32) continue;

				const wr7 = parseFloat(w.winrate_7d || w.win_rate_7d || 0);
				const wr30 = parseFloat(w.winrate_30d || w.win_rate_30d || 0);
				const pnl30 = parseFloat(w.realized_profit_30d || w.pnl_30d || 0);
				const pnl7 = parseFloat(w.realized_profit_7d || w.pnl_7d || 0);
				const buy30 = parseInt(w.buy_30d || 0, 10);
				const sell30 = parseInt(w.sell_30d || 0, 10);

				const existing = wallets.get(addr);
				const score = gmgnSmartMoneyScore(category, wr30, wr7, pnl30);

				// Keep the row with the highest computed score
				if (!existing || score > existing.score) {
					wallets.set(addr, {
						wallet: addr,
						category,
						winrate7: wr7,
						winrate30: wr30,
						pnl30,
						pnl7,
						buy30,
						sell30,
						score,
						label: labelFromCategory(category, pnl30, wr30, w.tags),
						tags: w.tags || [],
					});
				}
			}
		}
	}

	console.log(`\nCollected ${wallets.size} unique wallets. ${DRY_RUN ? '[DRY RUN — not writing]' : 'Writing to DB...'}`);

	if (DRY_RUN) {
		const preview = [...wallets.values()].sort((a, b) => b.score - a.score).slice(0, 10);
		for (const w of preview) {
			console.log(`  ${w.wallet.slice(0, 8)}… score=${w.score} label=${w.label} wr30=${(w.winrate30 * 100).toFixed(0)}% pnl30=$${Math.round(w.pnl30)}`);
		}
		return;
	}

	let inserted = 0;
	let skipped = 0;
	const rows = [...wallets.values()];

	for (let i = 0; i < rows.length; i += 50) {
		const batch = rows.slice(i, i + 50);
		for (const w of batch) {
			try {
				const result = await sql`
					insert into wallet_reputation (
						wallet, network, smart_money_score, label,
						win_rate, early_win_rate, dump_rate,
						coins_traded, buy_volume_lamports,
						first_seen_at, last_active_at, updated_at
					) values (
						${w.wallet}, ${NETWORK}, ${w.score}, ${w.label},
						${w.winrate30}, ${w.winrate7}, 0,
						${w.buy30 + w.sell30}, 0,
						now(), now(), now()
					)
					on conflict (wallet, network) do nothing
					returning wallet
				`;
				if (result.length) inserted++;
				else skipped++;
			} catch (err) {
				console.warn(`  failed to insert ${w.wallet.slice(0, 8)}…: ${err.message}`);
			}
		}
		if (i % 200 === 0 && i > 0) console.log(`  ${i}/${rows.length} processed…`);
	}

	console.log(`\nDone. Inserted=${inserted} Skipped(already exists)=${skipped}`);
	console.log('wallet_reputation is now seeded — the smart-money xref will have data from first launch.');
}

main().catch((err) => { console.error(err); process.exit(1); });
