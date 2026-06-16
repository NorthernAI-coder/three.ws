/**
 * Trader track-record truth layer.
 *
 * The single source of truth for every "how good is this trader" number on
 * three.ws — the leaderboard, the trader profile, the Proof tab, the copy-trading
 * verification badge. Built on `agent_sniper_positions`, which is the canonical
 * per-position ledger: each row already carries realized P&L (lamports + pct),
 * entry/exit SOL, hold window (opened_at → closed_at), and the on-chain buy/sell
 * signatures that PROVE every number. We never invent a metric we can't trace to
 * a tx.
 *
 * Two layers, by design:
 *   - computeTraderMetrics(positions, opts)  — PURE. No DB, no network. Deterministic
 *     over an array of position rows. This is what the tests pin to fixtures, and
 *     what guarantees the leaderboard and the profile can never disagree.
 *   - getTraderStats / getLeaderboard        — fetch rows, price SOL→USD, attach
 *     identity, then defer all arithmetic to computeTraderMetrics.
 *
 * Honesty rules baked in:
 *   - SOL amounts are exact (from chain). USD is an enrichment that degrades to
 *     null if the price feed is down — we never fabricate a dollar figure.
 *   - We do NOT claim "wash detection" we can't do from one-sided position data.
 *     `churn_pct` is an explicit heuristic (near-flat in-and-out churn) and is
 *     named as such.
 *   - Survivorship-honest: closed losers are counted, never hidden.
 */

import { sql } from './db.js';
import { solUsdPrice } from './avatar-wallet.js';
import { actionsSummary } from './oracle/store.js';

const LAMPORTS_PER_SOL = 1e9;

/** Supported leaderboard / profile time windows. */
export const WINDOWS = new Set(['24h', '7d', '30d', 'all']);
const WINDOW_MS = { '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 };

/** ISO lower-bound for a window, or null for 'all'. `now` injectable for tests. */
export function windowStartIso(window, now = Date.now()) {
	const span = WINDOW_MS[window];
	return span ? new Date(now - span).toISOString() : null;
}

// --- Score / badge tuning. Transparent, named, tunable. -----------------------
// A trader's composite score (0–100) is a documented weighted blend of win rate,
// profit factor, signed realized P&L, consistency (Sharpe-ish), drawdown, and
// churn — regressed toward neutral until they have enough closed trades to trust.
const SCORE_WEIGHTS = { winRate: 0.30, profitFactor: 0.22, pnl: 0.26, consistency: 0.12, drawdown: 0.10 };
const CHURN_SCORE_PENALTY = 0.10; // churn subtracts up to this much from raw score
const CONFIDENCE_FULL_AT = 14;    // closed trades for full statistical confidence
const NEUTRAL_RAW = 0.42;         // unproven traders regress toward this (slightly below mid)
const PNL_TANH_SOL = 5;           // ~5 SOL realized ≈ a strongly positive pnl sub-score
const SHARPE_TANH = 2;            // consistency normalization

// Verification badge ("proven track record") gate — every condition must hold.
const BADGE = { minClosed: 12, minUniqueCoins: 5, maxChurnPct: 40 };

// Churn heuristic: a position opened and closed inside this window with a
// near-flat result is in-and-out churn that pads trade counts without real risk.
const CHURN_HOLD_SECONDS = 25;
const CHURN_FLAT_PCT = 1.5;

const big = (v) => {
	try { return Number(BigInt(v)); } catch { return Number(v) || 0; }
};
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const tanh = (x) => Math.tanh(x);

function median(sorted) {
	if (!sorted.length) return 0;
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values, mean) {
	if (values.length < 2) return 0;
	const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
	return Math.sqrt(variance);
}

/**
 * Max drawdown over the realized equity curve (cumulative realized P&L in
 * lamports, ordered oldest→newest close). Returns both the absolute SOL drop from
 * a running peak and that drop as a pct of the peak equity. A monotonically
 * rising book has zero drawdown.
 */
function maxDrawdown(closedOrderedLamports) {
	let equity = 0, peak = 0, maxDropLamports = 0, maxDropPct = 0;
	for (const pnl of closedOrderedLamports) {
		equity += pnl;
		if (equity > peak) peak = equity;
		const drop = peak - equity;
		if (drop > maxDropLamports) {
			maxDropLamports = drop;
			maxDropPct = peak > 0 ? (drop / peak) * 100 : 0;
		}
	}
	return { sol: maxDropLamports / LAMPORTS_PER_SOL, pct: maxDropPct };
}

/**
 * Compute the full metric set for one trader from their position rows.
 *
 * @param {Array<object>} positions  agent_sniper_positions rows (closed + open).
 *   Required fields per row: status, realized_pnl_lamports, realized_pnl_pct,
 *   entry_quote_lamports, exit_quote_lamports, last_value_lamports, mint,
 *   opened_at, closed_at.
 * @param {object} [opts]
 * @param {number|null} [opts.solUsd]  USD per SOL, or null to omit USD fields.
 * @returns {object} canonical metrics — see fields below.
 */
export function computeTraderMetrics(positions, { solUsd = null } = {}) {
	const closed = positions.filter((p) => p.status === 'closed');
	const open = positions.filter((p) => p.status === 'open' || p.status === 'opening' || p.status === 'closing');

	// --- Realized (closed positions) ---
	let realizedLamports = 0n;
	let grossProfit = 0n, grossLoss = 0n; // grossLoss kept positive
	let wins = 0, losses = 0;
	let invested = 0n;
	const pnlPcts = [];
	const winPcts = [], lossPcts = [];
	const holdSeconds = [];
	const coins = new Set();
	let churn = 0;
	let bestPct = null, worstPct = null;
	let firstActive = null, lastActive = null;

	// Oldest→newest by close time for the equity curve.
	const closedOrdered = [...closed].sort(
		(a, b) => new Date(a.closed_at || a.opened_at).getTime() - new Date(b.closed_at || b.opened_at).getTime(),
	);
	const equityPnls = [];

	for (const p of closedOrdered) {
		const pnl = BigInt(p.realized_pnl_lamports ?? 0);
		realizedLamports += pnl;
		equityPnls.push(big(p.realized_pnl_lamports));
		if (pnl > 0n) { wins += 1; grossProfit += pnl; } else if (pnl < 0n) { losses += 1; grossLoss += -pnl; }
		invested += BigInt(p.entry_quote_lamports ?? 0);
		if (p.mint) coins.add(p.mint);

		const pct = p.realized_pnl_pct != null ? Number(p.realized_pnl_pct) : null;
		if (pct != null && Number.isFinite(pct)) {
			pnlPcts.push(pct);
			if (pct > 0) winPcts.push(pct); else if (pct < 0) lossPcts.push(pct);
			bestPct = bestPct == null ? pct : Math.max(bestPct, pct);
			worstPct = worstPct == null ? pct : Math.min(worstPct, pct);
		}

		const opened = new Date(p.opened_at).getTime();
		const closedAt = new Date(p.closed_at || p.opened_at).getTime();
		const held = Math.max(0, (closedAt - opened) / 1000);
		holdSeconds.push(held);
		if (held <= CHURN_HOLD_SECONDS && pct != null && Math.abs(pct) <= CHURN_FLAT_PCT) churn += 1;

		if (firstActive == null || opened < firstActive) firstActive = opened;
		if (lastActive == null || closedAt > lastActive) lastActive = closedAt;
	}

	// --- Unrealized (open positions) ---
	let openExposure = 0n;
	let unrealizedLamports = 0n;
	for (const p of open) {
		const entry = BigInt(p.entry_quote_lamports ?? 0);
		const last = p.last_value_lamports != null ? BigInt(p.last_value_lamports) : entry;
		openExposure += entry;
		unrealizedLamports += last - entry;
		const opened = new Date(p.opened_at).getTime();
		if (firstActive == null || opened < firstActive) firstActive = opened;
		if (lastActive == null || opened > lastActive) lastActive = opened;
	}

	const closedCount = closed.length;
	const realizedSol = big(realizedLamports.toString()) / LAMPORTS_PER_SOL;
	const investedSol = big(invested.toString()) / LAMPORTS_PER_SOL;
	const unrealizedSol = big(unrealizedLamports.toString()) / LAMPORTS_PER_SOL;
	const openExposureSol = big(openExposure.toString()) / LAMPORTS_PER_SOL;

	const winRate = closedCount ? wins / closedCount : 0;
	const profitFactor = grossLoss > 0n
		? big(grossProfit.toString()) / big(grossLoss.toString())
		: (grossProfit > 0n ? Infinity : 0);
	const roiPct = investedSol > 0 ? (realizedSol / investedSol) * 100 : 0;
	const avgPnlPct = pnlPcts.length ? pnlPcts.reduce((a, v) => a + v, 0) / pnlPcts.length : 0;
	const avgWinPct = winPcts.length ? winPcts.reduce((a, v) => a + v, 0) / winPcts.length : 0;
	const avgLossPct = lossPcts.length ? lossPcts.reduce((a, v) => a + v, 0) / lossPcts.length : 0;
	const holdSorted = [...holdSeconds].sort((a, b) => a - b);
	const avgHoldSeconds = holdSeconds.length ? holdSeconds.reduce((a, v) => a + v, 0) / holdSeconds.length : 0;
	const sharpe = pnlPcts.length > 1 ? avgPnlPct / (stddev(pnlPcts, avgPnlPct) || 1) : 0;
	const churnPct = closedCount ? (churn / closedCount) * 100 : 0;
	const drawdown = maxDrawdown(equityPnls);

	// --- Composite score (0–100), transparent + confidence-regressed ---
	const pfComponent = profitFactor === Infinity ? 1 : profitFactor / (profitFactor + 1);
	const pnlComponent = 0.5 + 0.5 * tanh(realizedSol / PNL_TANH_SOL);
	const consistencyComponent = 0.5 + 0.5 * tanh(sharpe / SHARPE_TANH);
	const drawdownComponent = 1 - clamp(drawdown.pct / 100, 0, 1);
	let raw =
		SCORE_WEIGHTS.winRate * winRate +
		SCORE_WEIGHTS.profitFactor * pfComponent +
		SCORE_WEIGHTS.pnl * pnlComponent +
		SCORE_WEIGHTS.consistency * consistencyComponent +
		SCORE_WEIGHTS.drawdown * drawdownComponent;
	raw = clamp(raw - CHURN_SCORE_PENALTY * clamp(churnPct / 100, 0, 1), 0, 1);
	const confidence = clamp(closedCount / CONFIDENCE_FULL_AT, 0, 1);
	const effective = raw * confidence + NEUTRAL_RAW * (1 - confidence);
	const score = Math.round(100 * effective);

	const verified =
		closedCount >= BADGE.minClosed &&
		realizedSol > 0 &&
		coins.size >= BADGE.minUniqueCoins &&
		churnPct <= BADGE.maxChurnPct;

	const usd = (sol) => (solUsd != null ? sol * solUsd : null);

	return {
		score,
		verified,
		confidence: Number(confidence.toFixed(3)),

		closed_count: closedCount,
		open_count: open.length,
		wins,
		losses,
		win_rate: Number(winRate.toFixed(4)),

		realized_pnl_lamports: realizedLamports.toString(),
		realized_pnl_sol: Number(realizedSol.toFixed(6)),
		realized_pnl_usd: usd(realizedSol) != null ? Number(usd(realizedSol).toFixed(2)) : null,
		unrealized_pnl_sol: Number(unrealizedSol.toFixed(6)),
		unrealized_pnl_usd: usd(unrealizedSol) != null ? Number(usd(unrealizedSol).toFixed(2)) : null,

		invested_sol: Number(investedSol.toFixed(6)),
		roi_pct: Number(roiPct.toFixed(2)),
		open_exposure_sol: Number(openExposureSol.toFixed(6)),
		open_exposure_usd: usd(openExposureSol) != null ? Number(usd(openExposureSol).toFixed(2)) : null,

		profit_factor: profitFactor === Infinity ? null : Number(profitFactor.toFixed(3)),
		avg_pnl_pct: Number(avgPnlPct.toFixed(2)),
		avg_win_pct: Number(avgWinPct.toFixed(2)),
		avg_loss_pct: Number(avgLossPct.toFixed(2)),
		best_pnl_pct: bestPct != null ? Number(bestPct.toFixed(2)) : null,
		worst_pnl_pct: worstPct != null ? Number(worstPct.toFixed(2)) : null,
		sharpe: Number(sharpe.toFixed(3)),

		max_drawdown_sol: Number(drawdown.sol.toFixed(6)),
		max_drawdown_pct: Number(drawdown.pct.toFixed(2)),

		avg_hold_seconds: Math.round(avgHoldSeconds),
		median_hold_seconds: Math.round(median(holdSorted)),
		unique_coins: coins.size,
		churn_pct: Number(churnPct.toFixed(2)),

		first_active_at: firstActive ? new Date(firstActive).toISOString() : null,
		last_active_at: lastActive ? new Date(lastActive).toISOString() : null,
	};
}

// --- DB layer ---------------------------------------------------------------
//
// NOTE: the Neon HTTP driver's tagged template does not compose nested `sql`
// fragments (a `${sql`…`}` would bind as a parameter), so the position column
// list is written literally into each query below. It is static SQL with no user
// input — duplication here is the safe, correct trade-off.

/**
 * Fetch a trader's positions for a window. Closed positions are window-bounded by
 * close time; open positions are ALWAYS included (current exposure is "now",
 * regardless of window).
 */
export async function fetchTraderPositions({ agentId, network, window = 'all', now = Date.now() }) {
	const start = windowStartIso(window, now);
	return start
		? sql`
			select p.id, p.agent_id, p.wallet, p.mint, p.symbol, p.name, p.status, p.exit_reason,
			       p.entry_quote_lamports, p.exit_quote_lamports, p.last_value_lamports, p.peak_value_lamports,
			       p.realized_pnl_lamports, p.realized_pnl_pct, p.buy_sig, p.sell_sig,
			       p.opened_at, p.closed_at
			from agent_sniper_positions p
			where p.agent_id = ${agentId} and p.network = ${network}
			  and (p.status in ('open','opening','closing') or p.closed_at >= ${start})
			order by coalesce(p.closed_at, p.opened_at) desc
		`
		: sql`
			select p.id, p.agent_id, p.wallet, p.mint, p.symbol, p.name, p.status, p.exit_reason,
			       p.entry_quote_lamports, p.exit_quote_lamports, p.last_value_lamports, p.peak_value_lamports,
			       p.realized_pnl_lamports, p.realized_pnl_pct, p.buy_sig, p.sell_sig,
			       p.opened_at, p.closed_at
			from agent_sniper_positions p
			where p.agent_id = ${agentId} and p.network = ${network}
			order by coalesce(p.closed_at, p.opened_at) desc
		`;
}

/** SOL/USD with a short module cache so a burst of stat requests prices once. */
let _solCache = { usd: null, at: 0 };
async function cachedSolUsd() {
	const now = Date.now();
	if (_solCache.usd != null && now - _solCache.at < 60_000) return _solCache.usd;
	try {
		const usd = await solUsdPrice();
		_solCache = { usd, at: now };
		return usd;
	} catch {
		// Degrade to last known price if we have one, else null (SOL stays exact).
		return _solCache.usd;
	}
}

function solscanUrl(sig, network) {
	if (!sig || sig === 'SIMULATED') return null;
	return network === 'devnet' ? `https://solscan.io/tx/${sig}?cluster=devnet` : `https://solscan.io/tx/${sig}`;
}

/**
 * Active copiers per leader on a network → Map(agentId → count). Best-effort: if
 * the copy_subscriptions table isn't migrated yet, degrade to an empty map rather
 * than failing the whole leaderboard.
 */
async function activeCopierCounts(network) {
	try {
		const rows = await sql`
			select leader_agent_id, count(*)::int as copiers
			from copy_subscriptions
			where network = ${network} and status = 'active'
			group by leader_agent_id
		`;
		return new Map(rows.map((r) => [r.leader_agent_id, Number(r.copiers) || 0]));
	} catch {
		return new Map();
	}
}

/** Active copier count for one leader. Best-effort (see activeCopierCounts). */
async function copierCountForAgent(agentId, network) {
	try {
		const [row] = await sql`
			select count(*)::int as copiers from copy_subscriptions
			where leader_agent_id = ${agentId} and network = ${network} and status = 'active'
		`;
		return Number(row?.copiers) || 0;
	} catch {
		return 0;
	}
}

/** Shape a closed position for the profile history + Proof tab (every number → tx). */
export function shapeClosed(p, network) {
	return {
		id: p.id,
		mint: p.mint,
		symbol: p.symbol,
		name: p.name,
		entry_sol: p.entry_quote_lamports != null ? big(p.entry_quote_lamports) / LAMPORTS_PER_SOL : null,
		exit_sol: p.exit_quote_lamports != null ? big(p.exit_quote_lamports) / LAMPORTS_PER_SOL : null,
		pnl_sol: p.realized_pnl_lamports != null ? big(p.realized_pnl_lamports) / LAMPORTS_PER_SOL : null,
		pnl_pct: p.realized_pnl_pct != null ? Number(p.realized_pnl_pct) : null,
		exit_reason: p.exit_reason,
		opened_at: p.opened_at,
		closed_at: p.closed_at,
		buy_url: solscanUrl(p.buy_sig, network),
		sell_url: solscanUrl(p.sell_sig, network),
	};
}

/** Shape an open position with live unrealized P&L. */
export function shapeOpen(p, network) {
	const entry = p.entry_quote_lamports != null ? big(p.entry_quote_lamports) : 0;
	const last = p.last_value_lamports != null ? big(p.last_value_lamports) : entry;
	return {
		id: p.id,
		mint: p.mint,
		symbol: p.symbol,
		name: p.name,
		entry_sol: entry / LAMPORTS_PER_SOL,
		current_sol: last / LAMPORTS_PER_SOL,
		unrealized_pct: entry > 0 ? ((last - entry) / entry) * 100 : 0,
		opened_at: p.opened_at,
		buy_url: solscanUrl(p.buy_sig, network),
	};
}

/**
 * Full trader profile: identity + metrics for the window + closed history (proof)
 * + open positions. Returns null if the agent has no positions on this network.
 */
export async function getTraderStats({ agentId, network, window = 'all', now = Date.now() }) {
	const [idRows, positions, solUsd, copiers, oracleSummary] = await Promise.all([
		sql`
			select id, name, description, avatar_url, profile_image_url, is_public
			from agent_identities where id = ${agentId} limit 1
		`,
		fetchTraderPositions({ agentId, network, window, now }),
		cachedSolUsd(),
		copierCountForAgent(agentId, network),
		actionsSummary(agentId, network).catch(() => null),
	]);
	const identity = idRows[0];
	if (!identity) return null;

	const metrics = computeTraderMetrics(positions, { solUsd });
	const closed = positions.filter((p) => p.status === 'closed').map((p) => shapeClosed(p, network));
	const open = positions
		.filter((p) => p.status === 'open' || p.status === 'opening' || p.status === 'closing')
		.map((p) => shapeOpen(p, network));
	const wallet = positions[0]?.wallet || null;

	return {
		agent: {
			id: identity.id,
			name: identity.name,
			description: identity.description || null,
			image: identity.profile_image_url || identity.avatar_url || null,
			is_public: identity.is_public !== false,
			wallet,
			copiers,
		},
		network,
		window,
		sol_usd: solUsd,
		metrics,
		closed,
		open,
		oracle: oracleSummary && oracleSummary.total > 0 ? oracleSummary : null,
	};
}

/**
 * Leaderboard: every agent with sniper activity in the window, ranked by composite
 * score. One query pulls all in-window positions; we group by agent and run each
 * group through the SAME pure `computeTraderMetrics` the profile uses, so the two
 * surfaces can never disagree. Scale note: the sniper arena is a curated set of
 * agents — if it ever grows past a few hundred active traders per window, move the
 * grouping into SQL with a windowed aggregate.
 */
export const LEADERBOARD_SORTS = new Set(['score', 'pnl', 'winrate', 'roi']);

const SORT_COMPARATORS = {
	score: (a, b) => b.score - a.score || b.realized_pnl_sol - a.realized_pnl_sol,
	pnl: (a, b) => b.realized_pnl_sol - a.realized_pnl_sol || b.score - a.score,
	winrate: (a, b) => b.win_rate - a.win_rate || b.closed - a.closed,
	roi: (a, b) => b.roi_pct - a.roi_pct || b.realized_pnl_sol - a.realized_pnl_sol,
};

export async function getLeaderboard({
	network, window = '30d', limit = 100, sort = 'score', verifiedOnly = false, now = Date.now(),
}) {
	const start = windowStartIso(window, now);
	const rows = start
		? await sql`
			select p.id, p.agent_id, p.wallet, p.mint, p.symbol, p.name, p.status, p.exit_reason,
			       p.entry_quote_lamports, p.exit_quote_lamports, p.last_value_lamports, p.peak_value_lamports,
			       p.realized_pnl_lamports, p.realized_pnl_pct, p.buy_sig, p.sell_sig,
			       p.opened_at, p.closed_at,
			       a.name as agent_name, a.avatar_url as agent_avatar, a.profile_image_url as agent_image
			from agent_sniper_positions p
			join agent_identities a on a.id = p.agent_id
			where p.network = ${network} and a.is_public is not false
			  and (p.status in ('open','opening','closing') or p.closed_at >= ${start})
		`
		: await sql`
			select p.id, p.agent_id, p.wallet, p.mint, p.symbol, p.name, p.status, p.exit_reason,
			       p.entry_quote_lamports, p.exit_quote_lamports, p.last_value_lamports, p.peak_value_lamports,
			       p.realized_pnl_lamports, p.realized_pnl_pct, p.buy_sig, p.sell_sig,
			       p.opened_at, p.closed_at,
			       a.name as agent_name, a.avatar_url as agent_avatar, a.profile_image_url as agent_image
			from agent_sniper_positions p
			join agent_identities a on a.id = p.agent_id
			where p.network = ${network} and a.is_public is not false
		`;
	const solUsd = await cachedSolUsd();
	const copiers = await activeCopierCounts(network);

	const byAgent = new Map();
	for (const r of rows) {
		let g = byAgent.get(r.agent_id);
		if (!g) {
			g = {
				agent_id: r.agent_id,
				agent_name: r.agent_name,
				image: r.agent_image || r.agent_avatar || null,
				wallet: r.wallet,
				positions: [],
			};
			byAgent.set(r.agent_id, g);
		}
		g.positions.push(r);
	}

	const board = [...byAgent.values()]
		.map((g) => {
			const m = computeTraderMetrics(g.positions, { solUsd });
			return {
				agent_id: g.agent_id,
				agent_name: g.agent_name,
				image: g.image,
				wallet: g.wallet,
				score: m.score,
				verified: m.verified,
				closed: m.closed_count,
				open_positions: m.open_count,
				wins: m.wins,
				losses: m.losses,
				win_rate: m.win_rate,
				realized_pnl_lamports: m.realized_pnl_lamports,
				realized_pnl_sol: m.realized_pnl_sol,
				realized_pnl_usd: m.realized_pnl_usd,
				roi_pct: m.roi_pct,
				profit_factor: m.profit_factor,
				avg_pnl_pct: m.avg_pnl_pct,
				best_pnl_pct: m.best_pnl_pct,
				max_drawdown_pct: m.max_drawdown_pct,
				avg_hold_seconds: m.avg_hold_seconds,
				unique_coins: m.unique_coins,
				churn_pct: m.churn_pct,
				last_active_at: m.last_active_at,
				copiers: copiers.get(g.agent_id) || 0,
			};
		})
		.filter((r) => (verifiedOnly ? r.verified : true))
		.sort(SORT_COMPARATORS[sort] || SORT_COMPARATORS.score)
		.slice(0, limit)
		.map((r, i) => ({ rank: i + 1, ...r }));

	return { network, window, sort, sol_usd: solUsd, leaderboard: board, t: now };
}
