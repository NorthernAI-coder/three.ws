// GET /api/cron/copy-fanout — turn leader trades into copier intents.
//
// Two fanout sources:
//   1. agent_sniper_positions — the sniper engine's real executed positions.
//   2. oracle_watch_actions   — the Oracle conviction agent's live buys.
//
// For each (position/action, subscriber) the cron generates a sized,
// safety-checked copy INTENT via the pure copy-engine. Non-custodial: it only
// records the intent — the copier acts from their own wallet.
//
//   BUY  fanout: a leader opens/buys → size each subscriber's order, clamp to
//                their per-trade cap + remaining daily budget, gate on coin safety,
//                and insert a pending intent (or a 'skipped' row with reason).
//   SELL fanout (sniper only): a leader closes → mirror exit ONLY to copiers who
//                acted on the matching buy. Oracle sells are not modelled (there
//                is no explicit exit event — outcomes are graded after the fact).
//
// Idempotent via partial unique indexes:
//   (subscription_id, leader_position_id,      direction) when leader_position_id      is not null
//   (subscription_id, leader_oracle_action_id, direction) when leader_oracle_action_id is not null

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { sql } from '../_lib/db.js';
import { planCopyOrder } from '../_lib/copy-engine.js';

const NETWORKS = ['mainnet', 'devnet'];
const lamToSol = (l) => (l == null ? 0 : Number(BigInt(l)) / 1e9);

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) { error(res, 503, 'not_configured', 'CRON_SECRET unset'); return false; }
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) { error(res, 401, 'unauthorized', 'invalid cron secret'); return false; }
	return true;
}

// Best-effort coin context for the safety gate. pump.fun's public coin endpoint
// gives a live USD market cap; richer signals (dev holding, liquidity, honeypot)
// are left null and the engine treats them as "unknown". Oracle score is merged
// in separately so subscriptions with min_oracle_score can filter on it.
const _coinCache = new Map();
async function coinContext(mint, oracleScore) {
	if (_coinCache.has(mint)) {
		const cached = _coinCache.get(mint);
		return oracleScore != null ? { ...cached, oracle_score: oracleScore } : cached;
	}
	let ctx = null;
	try {
		const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
			headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000),
		});
		if (r.ok) {
			const c = await r.json();
			ctx = { market_cap_usd: Number(c.usd_market_cap) || null, graduated: !!c.complete };
		}
	} catch { /* leave null — engine handles missing context */ }
	_coinCache.set(mint, ctx);
	return oracleScore != null ? { ...(ctx || {}), oracle_score: oracleScore } : ctx;
}

// Fetch the latest Oracle conviction score for a mint from the DB. Returns null
// if unscored. Called in the sniper fanout path (Oracle fanout has the score inline).
const _oracleScoreCache = new Map();
async function oracleScore(mint, network) {
	const key = `${network}:${mint}`;
	if (_oracleScoreCache.has(key)) return _oracleScoreCache.get(key);
	try {
		const [row] = await sql`
			select score from oracle_conviction
			where mint = ${mint} and network = ${network}
			limit 1
		`;
		const score = row?.score != null ? Number(row.score) : null;
		_oracleScoreCache.set(key, score);
		return score;
	} catch { return null; }
}

async function fanoutBuys(network, stats) {
	const positions = await sql`
		select p.id, p.agent_id, p.mint, p.symbol, p.name, p.entry_quote_lamports, p.buy_sig, p.opened_at
		from agent_sniper_positions p
		where p.network = ${network} and p.buy_sig is not null and p.buy_sig <> 'SIMULATED'
		  and p.opened_at > now() - interval '8 minutes'
		  and exists (
		    select 1 from copy_subscriptions s
		    where s.leader_agent_id = p.agent_id and s.network = ${network} and s.status = 'active'
		  )
		order by p.opened_at desc
		limit 200
	`;
	if (!positions.length) return;

	// Per-subscription day-spend + open-intent counts, batched once.
	const spendRows = await sql`
		select subscription_id, coalesce(sum(planned_sol), 0) as spent
		from copy_executions
		where direction = 'buy' and status in ('pending', 'acted') and created_at::date = current_date
		group by subscription_id
	`;
	const openRows = await sql`
		select subscription_id, count(*) as open
		from copy_executions
		where direction = 'buy' and status = 'pending'
		group by subscription_id
	`;
	const spent = new Map(spendRows.map((r) => [r.subscription_id, Number(r.spent) || 0]));
	const open = new Map(openRows.map((r) => [r.subscription_id, Number(r.open) || 0]));

	for (const pos of positions) {
		const subs = await sql`
			select * from copy_subscriptions
			where leader_agent_id = ${pos.agent_id} and network = ${network} and status = 'active'
		`;
		if (!subs.length) continue;
		const score = await oracleScore(pos.mint, network);
		const coin = await coinContext(pos.mint, score);
		const entrySol = lamToSol(pos.entry_quote_lamports);

		for (const sub of subs) {
			const decision = planCopyOrder({
				subscription: sub,
				position: { direction: 'buy', entry_sol: entrySol, mint: pos.mint },
				coin,
				spentTodaySol: spent.get(sub.id) || 0,
				openCopies: open.get(sub.id) || 0,
			});
			const status = decision.action === 'copy' ? 'pending' : 'skipped';
			const planned = decision.action === 'copy' ? decision.order_sol : null;

			const [inserted] = await sql`
				insert into copy_executions (
					subscription_id, copier_user_id, leader_agent_id, leader_position_id, network,
					mint, symbol, name, direction, planned_sol, leader_entry_sol, status, skip_reason,
					safety, leader_buy_sig
				) values (
					${sub.id}, ${sub.copier_user_id}, ${pos.agent_id}, ${pos.id}, ${network},
					${pos.mint}, ${pos.symbol}, ${pos.name}, 'buy', ${planned}, ${entrySol}, ${status},
					${decision.reason && status === 'skipped' ? decision.reason : null},
					${coin ? JSON.stringify(coin) : null}::jsonb, ${pos.buy_sig}
				)
				on conflict (subscription_id, leader_position_id, direction) do nothing
				returning id
			`;
			if (inserted) {
				stats[status] = (stats[status] || 0) + 1;
				if (status === 'pending') {
					spent.set(sub.id, (spent.get(sub.id) || 0) + (planned || 0));
					open.set(sub.id, (open.get(sub.id) || 0) + 1);
				}
			}
		}
	}
}

async function fanoutSells(network, stats) {
	// Closes whose matching buy a copier actually acted on.
	const closes = await sql`
		select distinct p.id, p.agent_id, p.mint, p.symbol, p.name, p.sell_sig, p.closed_at
		from agent_sniper_positions p
		where p.network = ${network} and p.status = 'closed' and p.closed_at > now() - interval '8 minutes'
		  and exists (
		    select 1 from copy_executions e
		    where e.leader_position_id = p.id and e.direction = 'buy' and e.status = 'acted'
		  )
		order by p.closed_at desc
		limit 200
	`;
	for (const pos of closes) {
		const buys = await sql`
			select e.subscription_id, e.copier_user_id, s.copy_sells, s.status as sub_status
			from copy_executions e
			join copy_subscriptions s on s.id = e.subscription_id
			where e.leader_position_id = ${pos.id} and e.direction = 'buy' and e.status = 'acted'
		`;
		for (const b of buys) {
			if (!b.copy_sells || b.sub_status === 'stopped') continue;
			const [inserted] = await sql`
				insert into copy_executions (
					subscription_id, copier_user_id, leader_agent_id, leader_position_id, network,
					mint, symbol, name, direction, planned_sol, status, leader_buy_sig
				) values (
					${b.subscription_id}, ${b.copier_user_id}, ${pos.agent_id}, ${pos.id}, ${network},
					${pos.mint}, ${pos.symbol}, ${pos.name}, 'sell', 0, 'pending', ${pos.sell_sig}
				)
				on conflict (subscription_id, leader_position_id, direction) do nothing
				returning id
			`;
			if (inserted) stats.sell_pending = (stats.sell_pending || 0) + 1;
		}
	}
}

// ── Oracle conviction fanout ───────────────────────────────────────────────────
// Mirrors live oracle buy actions to copy subscribers, using the same sizing
// and safety logic as the sniper fanout. Only `mode = 'live'` actions fan out.

async function fanoutOracleBuys(network, stats) {
	// Only live fills from the last 8 minutes that have at least one active
	// copy subscriber following the acting agent.
	const actions = await sql`
		select a.id, a.agent_id, a.mint, a.symbol, a.conviction, a.tier, a.size_sol, a.acted_at
		from oracle_watch_actions a
		where a.network = ${network}
		  and a.mode = 'live'
		  and a.status = 'filled'
		  and a.acted_at > now() - interval '8 minutes'
		  and exists (
		    select 1 from copy_subscriptions s
		    where s.leader_agent_id = a.agent_id and s.network = ${network} and s.status = 'active'
		  )
		order by a.acted_at desc
		limit 200
	`;
	if (!actions.length) return;

	// Per-subscription day-spend + open-intent counts, batched once.
	const spendRows = await sql`
		select subscription_id, coalesce(sum(planned_sol), 0) as spent
		from copy_executions
		where direction = 'buy' and status in ('pending', 'acted') and created_at::date = current_date
		group by subscription_id
	`;
	const openRows = await sql`
		select subscription_id, count(*) as open
		from copy_executions
		where direction = 'buy' and status = 'pending'
		group by subscription_id
	`;
	const spent = new Map(spendRows.map((r) => [r.subscription_id, Number(r.spent) || 0]));
	const open = new Map(openRows.map((r) => [r.subscription_id, Number(r.open) || 0]));

	for (const action of actions) {
		const subs = await sql`
			select * from copy_subscriptions
			where leader_agent_id = ${action.agent_id} and network = ${network} and status = 'active'
		`;
		if (!subs.length) continue;
		// Oracle action has conviction inline — no DB lookup needed.
		const coin = await coinContext(action.mint, action.conviction != null ? Number(action.conviction) : null);
		const entrySol = Number(action.size_sol) || 0;

		for (const sub of subs) {
			const decision = planCopyOrder({
				subscription: sub,
				position: { direction: 'buy', entry_sol: entrySol, mint: action.mint },
				coin,
				spentTodaySol: spent.get(sub.id) || 0,
				openCopies: open.get(sub.id) || 0,
			});
			const status = decision.action === 'copy' ? 'pending' : 'skipped';
			const planned = decision.action === 'copy' ? decision.order_sol : null;

			// Note: leader_position_id is null for oracle-sourced intents.
			// Idempotency is guaranteed by the copy_executions_oracle_idem partial unique index.
			const [inserted] = await sql`
				insert into copy_executions (
					subscription_id, copier_user_id, leader_agent_id, leader_position_id, leader_oracle_action_id,
					network, mint, symbol, direction, planned_sol, leader_entry_sol, status, skip_reason,
					safety
				) values (
					${sub.id}, ${sub.copier_user_id}, ${action.agent_id}, null, ${action.id},
					${network}, ${action.mint}, ${action.symbol || null}, 'buy', ${planned}, ${entrySol},
					${status}, ${decision.reason && status === 'skipped' ? decision.reason : null},
					${coin ? JSON.stringify(coin) : null}::jsonb
				)
				on conflict (subscription_id, leader_oracle_action_id, direction)
				where leader_oracle_action_id is not null
				do nothing
				returning id
			`;
			if (inserted) {
				const key = `oracle_${status}`;
				stats[key] = (stats[key] || 0) + 1;
				if (status === 'pending') {
					spent.set(sub.id, (spent.get(sub.id) || 0) + (planned || 0));
					open.set(sub.id, (open.get(sub.id) || 0) + 1);
				}
			}
		}
	}
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const stats = {};
	_coinCache.clear();
	for (const network of NETWORKS) {
		try {
			await fanoutBuys(network, stats);
			await fanoutSells(network, stats);
			await fanoutOracleBuys(network, stats);
		} catch (err) {
			stats[`error_${network}`] = err.message;
		}
	}
	return json(res, 200, { ok: true, ...stats });
});
