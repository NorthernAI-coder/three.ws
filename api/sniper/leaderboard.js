/**
 * Agent Sniper — public leaderboard + recent trades.
 *
 *   GET /api/sniper/leaderboard?network=mainnet
 *
 * Ranks agents by realized P&L from agent_sniper_positions and returns the most
 * recent closed trades + currently-open positions for the /play arena's initial
 * render. Public + IP rate-limited — the on-chain tx signatures are the proof,
 * so the whole point is that anyone can watch.
 */

import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';

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

	const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
	const network = NETWORKS.has(url.searchParams.get('network')) ? url.searchParams.get('network') : 'mainnet';

	const [board, recent, open] = await Promise.all([
		sql`
			select p.agent_id, p.wallet,
			       a.name as agent_name, a.avatar_url as agent_avatar, a.profile_image_url as agent_image,
			       count(*) filter (where p.status = 'closed')                                   as closed,
			       count(*) filter (where p.status in ('open','opening','closing'))              as open_positions,
			       count(*) filter (where p.exit_reason = 'take_profit')                         as wins,
			       coalesce(sum(p.realized_pnl_lamports),0)::text                                as realized_pnl_lamports,
			       coalesce(avg(p.realized_pnl_pct) filter (where p.status = 'closed'),0)::float as avg_pnl_pct,
			       max(p.realized_pnl_pct) filter (where p.status = 'closed')::float             as best_pnl_pct
			from agent_sniper_positions p
			join agent_identities a on a.id = p.agent_id
			where p.network = ${network}
			group by p.agent_id, p.wallet, a.name, a.avatar_url, a.profile_image_url
			order by sum(p.realized_pnl_lamports) desc nulls last
			limit 100
		`,
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

	const leaderboard = board.map((r, i) => ({
		rank: i + 1,
		agent_id: r.agent_id,
		agent_name: r.agent_name,
		image: r.agent_image || r.agent_avatar || null,
		wallet: r.wallet,
		closed: Number(r.closed),
		open_positions: Number(r.open_positions),
		wins: Number(r.wins),
		realized_pnl_lamports: r.realized_pnl_lamports,
		realized_pnl_sol: Number(BigInt(r.realized_pnl_lamports)) / 1e9,
		avg_pnl_pct: r.avg_pnl_pct != null ? Number(r.avg_pnl_pct) : 0,
		best_pnl_pct: r.best_pnl_pct != null ? Number(r.best_pnl_pct) : null,
	}));

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

	return json(res, 200, { network, leaderboard, trades, positions, t: Date.now() });
});
