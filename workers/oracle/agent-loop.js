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
import { alertAgentEntry } from '../../api/_lib/oracle/alerts.js';

// Module cursor — only consider verdicts scored since the last pass.
let cursor = new Date(Date.now() - 60_000).toISOString();

async function armedWatches(network) {
	return sql`
		select w.agent_id, w.user_id, w.network, w.armed, w.mode, w.min_score, w.min_tier,
		       w.categories, w.per_trade_sol, w.max_daily_sol, w.max_open, w.require_smart_money,
		       w.size_scaling, a.name as agent_name
		from oracle_agent_watch w
		join agent_identities a on a.id = w.agent_id and a.deleted_at is null
		where w.armed = true and w.network = ${network}
	`.catch(() => []);
}

/** Coins scored since a cursor — the work list for the agent loop and the
 *  alert pass. Returns enough fields for both act decisions and Telegram formatting. */
export async function freshlyScored(network, sinceIso, limit = 60) {
	const rows = await sql`
		select mint, symbol, name, score, tier, category, smart_wallet_count, scored_at,
		       pedigree, structure, narrative, momentum
		from oracle_conviction
		where network = ${network} and scored_at > ${sinceIso}::timestamptz
		order by scored_at asc
		limit ${limit}
	`.catch(() => []);
	// Attach a `pillars` object so downstream consumers (alerts, agent-eval) have
	// a consistent shape regardless of whether the row came from the DB or SSE.
	return rows.map((r) => ({
		...r,
		pillars: { pedigree: r.pedigree, structure: r.structure, narrative: r.narrative, momentum: r.momentum },
	}));
}

async function alreadyActed(agentId, mint, network) {
	const r = await sql`
		select 1 from oracle_watch_actions
		where agent_id = ${agentId} and mint = ${mint} and network = ${network} limit 1
	`.catch(() => []);
	return r.length > 0;
}

/**
 * Run every armed watch against a given set of freshly-scored coins. Pure of the
 * cursor so both the long-lived loop and the serverless cron share one code path.
 * Each (agent, mint) acts at most once via the `alreadyActed` guard, so passing
 * an overlapping window across invocations is safe and idempotent.
 */
export async function actOnFreshCoins(cfg, coins) {
	if (cfg.globalKill || !coins.length) return 0;
	const watches = await armedWatches(cfg.network);
	if (!watches.length) return 0;

	let acted = 0;
	const liveEntries = [];
	for (const watch of watches) {
		const { openCount, spentTodaySol } = await agentBudget(watch.agent_id, cfg.network);
		let open = openCount, spent = spentTodaySol;
		for (const coin of coins) {
			const decision = evaluateWatch({ watch, coin, openCount: open, spentTodaySol: spent });
			if (!decision.act) continue;
			if (await alreadyActed(watch.agent_id, coin.mint, cfg.network)) continue;
			const res = await executeAction({ cfg, watch, coin, size: decision.size, reason: decision.reason });
			if (res.status === 'filled') {
				acted += 1; open += 1; spent += decision.size;
				// Collect live entries for the Telegram entry alert.
				if (watch.mode === 'live' && cfg.mode === 'live') {
					liveEntries.push({
						agent_id: watch.agent_id,
						agent_name: watch.agent_name || null,
						symbol: coin.symbol,
						mint: coin.mint,
						tier: coin.tier,
						conviction: coin.score,
						size_sol: decision.size,
						network: cfg.network,
					});
				}
			}
		}
	}
	if (acted) log.info(`agent loop: ${acted} action(s) across ${watches.length} armed agent(s)`);
	if (liveEntries.length) alertAgentEntry(liveEntries).catch(() => {});
	return acted;
}

export async function runAgentPass(cfg) {
	if (cfg.globalKill) return 0;
	const coins = await freshlyScored(cfg.network, cursor);
	if (coins.length) cursor = coins[coins.length - 1].scored_at;
	return actOnFreshCoins(cfg, coins);
}
