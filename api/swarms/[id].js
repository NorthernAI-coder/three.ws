// /api/swarms/:id            — full dashboard state for one swarm
// /api/swarms/:id/stream     — SSE: live consensus votes, payouts, treasury ticks
//
// Routed here by vercel.json (`/api/swarms/([^/]+)(/.*)? → /api/swarms/[id]`); the
// handler parses the path to split state vs. stream. GET only — mutations live on
// POST /api/swarms.

import { cors, method, json, error, wrap } from '../_lib/http.js';
import { resolveAccount } from '../_lib/account-auth.js';
import { sql } from '../_lib/db.js';
import { getSwarmState, getSwarm, treasuryBalanceLamports } from '../_lib/swarms.js';
import { getOrCreateAgentSolanaWallet } from '../_lib/agent-wallet.js';

const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default wrap(async (req, res) => {
	const url = new URL(req.url, 'http://x');
	const parts = url.pathname.split('/').filter(Boolean); // ['api','swarms',':id', 'stream'?]
	const id = parts[2];
	const sub = parts[3] || null;

	if (!isUuid(id)) return error(res, 404, 'not_found', 'swarm not found');

	if (sub === 'stream') {
		if (!method(req, res, ['GET'])) return;
		return streamSwarm(req, res, id);
	}

	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const auth = await resolveAccount(req, res).catch(() => null);
	const state = await getSwarmState(id, { viewerUserId: auth?.userId || null });
	if (!state) return error(res, 404, 'not_found', 'swarm not found');
	return json(res, 200, { data: state });
});

const HEARTBEAT_MS = 15_000;
const POLL_MS = 2_500;
const MAX_DURATION_MS = 280_000; // end before the platform function timeout; client reconnects

async function streamSwarm(req, res, id) {
	const swarm = await getSwarm(id);
	if (!swarm) return error(res, 404, 'not_found', 'swarm not found');

	res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
	res.setHeader('Cache-Control', 'no-cache, no-transform');
	res.setHeader('X-Accel-Buffering', 'no');
	res.setHeader('Connection', 'keep-alive');

	const send = (event, data) => {
		try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* socket closed */ }
	};

	let treasuryAddr = null;
	try { treasuryAddr = (await getOrCreateAgentSolanaWallet(swarm.treasury_agent_id)).address; } catch { /* leave null */ }

	send('hello', { swarm_id: id, network: swarm.network, treasury: treasuryAddr });

	// Cursors — only emit rows newer than what we've already sent.
	let lastVoteAt = new Date(0).toISOString();
	let lastPayoutAt = new Date(0).toISOString();

	const poll = async () => {
		try {
			const [votes, payouts, posAgg] = await Promise.all([
				sql`select id, mint, decision, consensus, min_consensus, conviction, size_lamports,
					   members_long, members_total, smart_money_score, breakdown, reason, position_id, created_at
					from swarm_votes where swarm_id = ${id} and created_at > ${lastVoteAt}
					order by created_at asc limit 20`,
				sql`select id, kind, amount_lamports, share_bps, agent_id, signature, status, created_at
					from swarm_payouts where swarm_id = ${id} and created_at > ${lastPayoutAt}
					order by created_at asc limit 20`,
				sql`select count(*) filter (where status in ('open','opening','closing'))::int as open,
					   count(*) filter (where status='closed')::int as closed,
					   count(*) filter (where status='closed' and realized_pnl_lamports > 0)::int as wins,
					   coalesce(sum(realized_pnl_lamports),0)::numeric as pnl
					from agent_sniper_positions where agent_id = ${swarm.treasury_agent_id} and network = ${swarm.network}`,
			]);
			for (const v of votes) {
				lastVoteAt = v.created_at;
				send('vote', { ...v, size_sol: v.size_lamports == null ? null : Number(String(v.size_lamports).split('.')[0]) / 1e9 });
			}
			for (const p of payouts) {
				lastPayoutAt = p.created_at;
				send('payout', { ...p, amount_sol: Number(String(p.amount_lamports).split('.')[0]) / 1e9 });
			}
			let balanceSol = null;
			if (treasuryAddr) {
				const lam = await treasuryBalanceLamports(treasuryAddr, swarm.network).catch(() => null);
				balanceSol = lam == null ? null : Number(lam) / 1e9;
			}
			const cur = await getSwarm(id);
			const closedCount = posAgg[0]?.closed || 0;
			send('tick', {
				status: cur?.status || swarm.status,
				balance_sol: balanceSol,
				open_positions: posAgg[0]?.open || 0,
				closed_trades: closedCount,
				realized_pnl_sol: Number(String(posAgg[0]?.pnl || '0').split('.')[0]) / 1e9,
				win_rate: closedCount > 0 ? (posAgg[0]?.wins || 0) / closedCount : null,
			});
		} catch {
			/* transient DB blip — keep the stream open, retry next tick */
		}
	};

	await poll();
	const pollTimer = setInterval(poll, POLL_MS);
	const heartbeat = setInterval(() => { try { res.write(`:hb\n\n`); } catch { /* closed */ } }, HEARTBEAT_MS);
	const deadline = setTimeout(() => { cleanup(); try { res.end(); } catch { /* closed */ } }, MAX_DURATION_MS);

	const cleanup = () => { clearInterval(pollTimer); clearInterval(heartbeat); clearTimeout(deadline); };
	req.on('close', cleanup);
	res.on('close', cleanup);
}
