// Coin Intelligence — the learning loop.
//
// Watching is only half of "learns from watching". Here we:
//   1. labelOutcomes()  — revisit observed coins after the fact and record what
//      actually happened (graduated / pumped / flat / rugged) as ground truth.
//   2. trainWeights()   — correlate each launch-time signal with good outcomes
//      and persist per-signal weights the scorer reads. The dataset grows, the
//      weights sharpen, the sniper's judgment improves. No black box: weights
//      are plain correlations anyone can inspect.
//
// Run both from a cron (see api/cron or the worker loop). Pure-math helpers are
// exported for testing.

const PUMPFUN_COIN_API = 'https://frontend-api-v3.pump.fun/coins';
const FETCH_TIMEOUT_MS = 4_000;

// Signals we train on — all are ~0..1 (or normalized below). Counts are excluded;
// their information is already captured by the ratio signals.
export const TRAINABLE_SIGNALS = [
	'organic_score', 'bundle_score', 'snipe_ratio', 'coordination_score',
	'timing_entropy', 'concentration_top1', 'concentration_top5', 'concentration_top10',
	'fresh_wallet_ratio', 'bubblemap_connectivity',
];

let _sqlPromise = null;
async function getSql() {
	if (_sqlPromise) return _sqlPromise;
	_sqlPromise = import('../../../api/_lib/db.js').then((m) => m.sql).catch(() => null);
	return _sqlPromise;
}

async function fetchCoin(mint) {
	const ctrl = new AbortController();
	const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		const r = await fetch(`${PUMPFUN_COIN_API}/${encodeURIComponent(mint)}`, {
			signal: ctrl.signal,
			headers: { accept: 'application/json', 'user-agent': 'three.ws-coin-intel/1' },
		});
		if (!r.ok) return null;
		return await r.json();
	} catch { return null; } finally { clearTimeout(tid); }
}

function isGraduated(c) {
	return c?.complete === true || !!c?.raydium_pool || !!c?.pump_swap_pool;
}

/**
 * Decide the outcome bucket for one coin from its current pump.fun state and the
 * market cap we recorded when we first saw it.
 * @returns {{ outcome, graduated, rugged, ath_multiple, last_market_cap_usd, ath_market_cap_usd }}
 */
export function deriveOutcome(coin, mcSolFirstSeen) {
	if (!coin) return { outcome: 'unknown', graduated: null, rugged: null, ath_multiple: null, last_market_cap_usd: null, ath_market_cap_usd: null };

	const graduated = isGraduated(coin);
	const usdMc = typeof coin.usd_market_cap === 'number' ? coin.usd_market_cap : null;
	const solMc = typeof coin.market_cap === 'number' ? coin.market_cap : null;
	const athUsd = typeof coin.ath_market_cap === 'number' ? coin.ath_market_cap
		: typeof coin.ath_market_cap_usd === 'number' ? coin.ath_market_cap_usd : usdMc;

	// Derive the coin's own SOL price (usd/sol) to keep the multiple unit-consistent
	// with the SOL market cap we stored at first sight.
	const solPrice = usdMc != null && solMc ? usdMc / solMc : null;
	const athSol = athUsd != null && solPrice ? athUsd / solPrice : null;
	const ath_multiple = athSol != null && mcSolFirstSeen > 0 ? athSol / mcSolFirstSeen : null;
	const lastMultiple = solMc != null && mcSolFirstSeen > 0 ? solMc / mcSolFirstSeen : null;

	let rugged = false;
	let outcome;
	if (graduated) outcome = 'graduated';
	else if (ath_multiple != null && ath_multiple >= 3) outcome = 'pumped';
	else if (lastMultiple != null && lastMultiple <= 0.25) { outcome = 'rugged'; rugged = true; }
	else if (usdMc != null && usdMc < 3_000) { outcome = 'rugged'; rugged = true; }
	else outcome = 'flat';

	return { outcome, graduated, rugged, ath_multiple, last_market_cap_usd: usdMc, ath_market_cap_usd: athUsd };
}

/**
 * Label coins observed ≥ minAgeMinutes ago that have no outcome yet.
 * @returns {Promise<{ labeled: number }>}
 */
export async function labelOutcomes({ network = 'mainnet', limit = 100, minAgeMinutes = 60 } = {}) {
	const sql = await getSql();
	if (!sql) return { labeled: 0 };

	const rows = await sql`
		select i.mint, i.signals
		from pump_coin_intel i
		left join pump_coin_outcomes o on o.mint = i.mint
		where i.network = ${network}
		  and o.mint is null
		  and i.first_seen_at <= now() - (${minAgeMinutes} || ' minutes')::interval
		order by i.first_seen_at asc
		limit ${Math.max(1, Math.min(500, limit | 0))}
	`;

	let labeled = 0;
	for (const row of rows) {
		const mcSol = Number(row.signals?.mc_sol_first_seen) || 0;
		const coin = await fetchCoin(row.mint);
		const o = deriveOutcome(coin, mcSol);
		try {
			await sql`
				insert into pump_coin_outcomes (
					mint, graduated, rugged, ath_market_cap_usd, ath_multiple,
					last_market_cap_usd, outcome
				) values (
					${row.mint}, ${o.graduated}, ${o.rugged}, ${o.ath_market_cap_usd},
					${o.ath_multiple}, ${o.last_market_cap_usd}, ${o.outcome}
				)
				on conflict (mint) do update set
					graduated = excluded.graduated, rugged = excluded.rugged,
					ath_market_cap_usd = excluded.ath_market_cap_usd,
					ath_multiple = excluded.ath_multiple,
					last_market_cap_usd = excluded.last_market_cap_usd,
					outcome = excluded.outcome, labeled_at = now()
			`;
			labeled++;
		} catch (err) {
			console.warn('[coin-intel] label outcome failed:', err?.message);
		}
	}
	return { labeled };
}

// Pearson correlation of a signal against a binary good/bad label. Returns 0
// when there's no variance (degenerate) — a 0 weight, i.e. "no information".
export function correlation(pairs) {
	const xs = [], ys = [];
	for (const [x, y] of pairs) {
		if (x == null || !Number.isFinite(x)) continue;
		xs.push(x); ys.push(y);
	}
	const n = xs.length;
	if (n < 5) return 0;
	const mx = xs.reduce((a, b) => a + b, 0) / n;
	const my = ys.reduce((a, b) => a + b, 0) / n;
	let num = 0, dx = 0, dy = 0;
	for (let i = 0; i < n; i++) {
		const ex = xs[i] - mx, ey = ys[i] - my;
		num += ex * ey; dx += ex * ex; dy += ey * ey;
	}
	if (dx === 0 || dy === 0) return 0;
	const r = num / Math.sqrt(dx * dy);
	return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : 0;
}

/**
 * Recompute per-signal weights from all labeled coins and persist them.
 * "good" = graduated or pumped. Skips quietly until there's enough signal.
 * @returns {Promise<{ trained: boolean, sample_size: number, weights?: object }>}
 */
export async function trainWeights({ network = 'mainnet', minSamples = 50 } = {}) {
	const sql = await getSql();
	if (!sql) return { trained: false, sample_size: 0 };

	const rows = await sql`
		select i.signals, o.outcome
		from pump_coin_intel i
		join pump_coin_outcomes o on o.mint = i.mint
		where i.network = ${network} and o.outcome <> 'unknown'
	`;
	if (rows.length < minSamples) return { trained: false, sample_size: rows.length };

	const labels = rows.map((r) => (r.outcome === 'graduated' || r.outcome === 'pumped') ? 1 : 0);
	const weights = {};
	for (const key of TRAINABLE_SIGNALS) {
		const pairs = rows.map((r, i) => [r.signals?.[key], labels[i]]);
		weights[key] = Number(correlation(pairs).toFixed(4));
	}

	await sql`
		insert into pump_intel_weights (network, weights, sample_size)
		values (${network}, ${JSON.stringify(weights)}::jsonb, ${rows.length})
	`;
	return { trained: true, sample_size: rows.length, weights };
}

/**
 * Turn signals + learned weights into a 0..1 learned score the scorer can blend.
 * With no weights yet, returns null so the scorer falls back to its baseline.
 */
export function learnedScore(signals, weights) {
	if (!weights || !signals) return null;
	let dot = 0, used = 0;
	for (const key of TRAINABLE_SIGNALS) {
		const w = weights[key];
		const v = signals[key];
		if (w == null || v == null || !Number.isFinite(v)) continue;
		dot += w * v; used++;
	}
	if (!used) return null;
	// Logistic squash to 0..1.
	return Number((1 / (1 + Math.exp(-dot))).toFixed(4));
}
