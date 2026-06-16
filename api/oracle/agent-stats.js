/**
 * Oracle — public agent track record.
 *
 *   GET /api/oracle/agent-stats?agent_id=<uuid>&network=mainnet&limit=20
 *
 * Returns an agent's oracle trading summary (win rate, realized PnL, ROI) plus
 * the N most recent actions so any visitor can verify the track record.
 * This endpoint is public — no auth required. It's the evidence behind copy-
 * trading: followers can see exactly which conviction calls were made and how
 * they resolved before choosing to mirror a leader.
 *
 * Cache: 60s public CDN (the data changes only when the settle-loop runs).
 */

import { cors, json, method, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';
import { recentActions, actionsSummary } from '../_lib/oracle/store.js';

const NETWORKS = new Set(['mainnet', 'devnet']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handleAgentStats(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const ip = clientIp(req);
	const rl = await limits.publicIp(ip);
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, 'http://x').searchParams;
	const agentId = params.get('agent_id') || '';
	const network = NETWORKS.has(params.get('network')) ? params.get('network') : 'mainnet';
	const limit = Math.min(50, Math.max(1, parseInt(params.get('limit') || '20', 10)));

	if (!UUID_RE.test(agentId)) {
		return json(res, 400, { error: 'invalid_agent_id', message: 'agent_id must be a UUID' });
	}

	// Load agent name so callers don't need a separate /api/agents fetch.
	const [agentRow] = await sql`
		select name, description, image_url from agent_identities where id = ${agentId}
	`.catch(() => []);

	if (!agentRow) {
		return json(res, 404, { error: 'agent_not_found', message: 'No agent with that ID' });
	}

	const [summary, actions] = await Promise.all([
		actionsSummary(agentId, network),
		recentActions(agentId, network, limit),
	]);

	// Per-tier breakdown from the action ledger.
	const byTier = {};
	for (const a of actions) {
		if (!a.tier) continue;
		if (!byTier[a.tier]) byTier[a.tier] = { total: 0, wins: 0, losses: 0 };
		byTier[a.tier].total++;
		if (a.outcome === 'win') byTier[a.tier].wins++;
		else if (a.outcome === 'loss') byTier[a.tier].losses++;
	}
	for (const t of Object.values(byTier)) {
		const res = t.wins + t.losses;
		t.win_rate = res > 0 ? Math.round((t.wins / res) * 100) : null;
	}

	return json(res, 200, {
		agent: {
			id: agentId,
			name: agentRow.name,
			description: agentRow.description || null,
			image_url: agentRow.image_url || null,
		},
		network,
		summary,
		by_tier: byTier,
		recent_actions: actions.map((a) => ({
			mint: a.mint,
			symbol: a.symbol,
			conviction: a.conviction,
			tier: a.tier,
			mode: a.mode,
			size_sol: a.size_sol != null ? Number(a.size_sol) : null,
			status: a.status,
			reason: a.reason,
			peak_multiple: a.peak_multiple != null ? Number(a.peak_multiple) : null,
			realized_pnl_sol: a.realized_pnl_sol != null ? Number(a.realized_pnl_sol) : null,
			outcome: a.outcome || 'open',
			acted_at: a.acted_at,
			pump_url: `https://pump.fun/coin/${a.mint}`,
			oracle_url: `https://three.ws/oracle?mint=${a.mint}`,
		})),
	}, { 'cache-control': 'public, max-age=60, s-maxage=60' });
}
