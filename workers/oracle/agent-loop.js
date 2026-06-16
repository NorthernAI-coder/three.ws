// Oracle worker — agent action loop.
//
// Polls newly-scored coins and, for every armed agent watch, runs the pure
// decision (agent-eval) against each coin and executes when it clears the bar.
// Each (agent, mint) acts at most once. Simulate-default; live is gated by the
// worker's mode + a hard per-trade cap in the executor.

import { sql } from '../../api/_lib/db.js';
import { log } from './log.js';
import { evaluateWatch } from '../../api/_lib/oracle/agent-eval.js';
import { executeAction, agentBudget } from './executor.js';

// Module cursor — only consider verdicts scored since the last pass.
let cursor = new Date(Date.now() - 60_000).toISOString();

async function armedWatches(network) {
	return sql`
		select w.agent_id, w.user_id, w.network, w.armed, w.mode, w.min_score, w.min_tier,
		       w.categories, w.per_trade_sol, w.max_daily_sol, w.max_open, w.require_smart_money
		from oracle_agent_watch w
		join agent_identities a on a.id = w.agent_id and a.deleted_at is null
		where w.armed = true and w.network = ${network}
	`.catch(() => []);
}

async function freshlyScored(network, sinceIso, limit = 60) {
	return sql`
		select mint, symbol, score, tier, category, smart_wallet_count, scored_at
		from oracle_conviction
		where network = ${network} and scored_at > ${sinceIso}::timestamptz
		order by scored_at asc
		limit ${limit}
	`.catch(() => []);
}

async function alreadyActed(agentId, mint, network) {
	const r = await sql`
		select 1 from oracle_watch_actions
		where agent_id = ${agentId} and mint = ${mint} and network = ${network} limit 1
	`.catch(() => []);
	return r.length > 0;
}

export async function runAgentPass(cfg) {
	if (cfg.globalKill) return 0;
	const watches = await armedWatches(cfg.network);
	if (!watches.length) return 0;

	const coins = await freshlyScored(cfg.network, cursor);
	if (coins.length) cursor = coins[coins.length - 1].scored_at;
	if (!coins.length) return 0;

	let acted = 0;
	for (const watch of watches) {
		const { openCount, spentTodaySol } = await agentBudget(watch.agent_id, cfg.network);
		let open = openCount, spent = spentTodaySol;
		for (const coin of coins) {
			const decision = evaluateWatch({ watch, coin, openCount: open, spentTodaySol: spent });
			if (!decision.act) continue;
			if (await alreadyActed(watch.agent_id, coin.mint, cfg.network)) continue;
			const res = await executeAction({ cfg, watch, coin, size: decision.size, reason: decision.reason });
			if (res.status === 'filled') { acted += 1; open += 1; spent += decision.size; }
		}
	}
	if (acted) log.info(`agent loop: ${acted} action(s) across ${watches.length} armed agent(s)`);
	return acted;
}
