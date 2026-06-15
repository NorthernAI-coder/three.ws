/**
 * Agent Sniper — public leaderboard + recent trades.
 *
 *   GET /api/sniper/leaderboard?network=mainnet&window=30d&sort=score&verified=1
 *
 * Ranks agents by their composite TraderScore (or a chosen metric) over a time
 * window, computed by the shared trader-stats truth layer so this board and the
 * /trader/:id profile can never disagree. Also returns the most recent closed
 * trades + currently-open positions for the /play arena's initial render. Public
 * + IP rate-limited — the on-chain tx signatures are the proof, so the whole
 * point is that anyone can watch.
 *
 * Backward-compatible: every field the arena already reads is still present; the
 * board rows are now a SUPERSET (win_rate, score, verified, roi_pct, drawdown, …).
 */

import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';
import { getLeaderboard, WINDOWS, LEADERBOARD_SORTS } from '../_lib/trader-stats.js';

const NETWORKS = new Set(['mainnet', 'devnet']);

function solscan(sig, network) {
	if (!sig || sig === 'SIMULATED') return null;
	return network === 'devnet'
		? `https://solscan.io/tx/${sig}?cluster=devnet`
		: `https://solscan.io/tx/${sig}`;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const network = NETWORKS.has(params.get('network')) ? params.get('network') : 'mainnet';
	// Default 'all' preserves the arena's historical lifetime ranking; the flagship
	// /leaderboard page requests an explicit window.
	const window = WINDOWS.has(params.get('window')) ? params.get('window') : 'all';
	const sort = LEADERBOARD_SORTS.has(params.get('sort')) ? params.get('sort') : 'score';
	const verifiedOnly = params.get('verified') === '1' || params.get('verified') === 'true';

	const [boardResult, recent, open] = await Promise.all([
		getLeaderboard({ network, window, sort, verifiedOnly, limit: 100 }),
		sql`
			select p.id, p.agent_id, a.name as agent_name, p.mint, p.symbol, p.name,
			       p.entry_quote_lamports, p.exit_quote_lamports, p.realized_pnl_lamports,
			       p.realized_pnl_pct, p.exit_reason, p.buy_sig, p.sell_sig, p.closed_at
			from agent_sniper_positions p
			join agent_identities a on a.id = p.agent_id
			where p.network = ${network} and p.status = 'closed'
			order by p.closed_at desc
			limit 30
		`,
		sql`
			select p.id, p.agent_id, a.name as agent_name, p.mint, p.symbol, p.name,
			       p.entry_quote_lamports, p.last_value_lamports, p.peak_value_lamports,
			       p.buy_sig, p.opened_at
			from agent_sniper_positions p
			join agent_identities a on a.id = p.agent_id
			where p.network = ${network} and p.status = 'open'
			order by p.opened_at desc
			limit 50
		`,
	]);

	const trades = recent.map((t) => ({
		id: t.id,
		agent_id: t.agent_id,
		agent_name: t.agent_name,
		mint: t.mint,
		symbol: t.symbol,
		name: t.name,
		entry_sol: t.entry_quote_lamports != null ? Number(BigInt(t.entry_quote_lamports)) / 1e9 : null,
		exit_sol: t.exit_quote_lamports != null ? Number(BigInt(t.exit_quote_lamports)) / 1e9 : null,
		pnl_sol: t.realized_pnl_lamports != null ? Number(BigInt(t.realized_pnl_lamports)) / 1e9 : null,
		pnl_pct: t.realized_pnl_pct != null ? Number(t.realized_pnl_pct) : null,
		exit_reason: t.exit_reason,
		buy_url: solscan(t.buy_sig, network),
		sell_url: solscan(t.sell_sig, network),
		at: t.closed_at,
	}));

	const positions = open.map((o) => {
		const entry = o.entry_quote_lamports != null ? Number(BigInt(o.entry_quote_lamports)) : 0;
		const last = o.last_value_lamports != null ? Number(BigInt(o.last_value_lamports)) : entry;
		return {
			id: o.id,
			agent_id: o.agent_id,
			agent_name: o.agent_name,
			mint: o.mint,
			symbol: o.symbol,
			name: o.name,
			entry_sol: entry / 1e9,
			current_sol: last / 1e9,
			unrealized_pct: entry > 0 ? ((last - entry) / entry) * 100 : 0,
			buy_url: solscan(o.buy_sig, network),
			at: o.opened_at,
		};
	});

	return json(res, 200, {
		network,
		window,
		sort,
		sol_usd: boardResult.sol_usd,
		leaderboard: boardResult.leaderboard,
		trades,
		positions,
		t: Date.now(),
	}, { 'cache-control': 'public, max-age=10, s-maxage=20' });
});
