// agent-sniper — strategy + position reads (cached strategy list, position counts).

import { sql } from '../../api/_lib/db.js';
import { log } from './log.js';

let _strategies = [];
let _loadedAt = 0;

/**
 * Active strategies for the worker's network: enabled, not killed, with a real
 * budget and a positive stop-loss. The stop-loss filter is the runtime half of
 * the mandatory-SL guarantee (the DB constraint is the other half) — a strategy
 * that somehow has a null/zero SL is dropped here rather than trusted.
 */
export async function refreshStrategies(network, maxAgeMs) {
	if (Date.now() - _loadedAt < maxAgeMs && _strategies.length) return _strategies;
	const rows = await sql`
		SELECT * FROM agent_sniper_strategies
		WHERE network = ${network}
		  AND enabled = true
		  AND kill_switch = false
		  AND daily_budget_lamports > 0
		  AND per_trade_lamports > 0
		  AND stop_loss_pct > 0
	`;
	_strategies = rows;
	_loadedAt = Date.now();
	return _strategies;
}

export function cachedStrategies() {
	return _strategies;
}

/** Count an agent's positions that still hold (or are mid-open) on this network. */
export async function countOpenPositions(agentId, network) {
	const [r] = await sql`
		SELECT count(*)::int AS n FROM agent_sniper_positions
		WHERE agent_id = ${agentId} AND network = ${network}
		  AND status IN ('opening','open','closing')
	`;
	return r?.n ?? 0;
}

/** Lamports committed by an agent today (UTC) — the daily-budget denominator. */
export async function getDailySpend(agentId, network) {
	const [r] = await sql`
		SELECT coalesce(sum(entry_quote_lamports), 0)::text AS spent
		FROM agent_sniper_positions
		WHERE agent_id = ${agentId} AND network = ${network}
		  AND opened_at >= date_trunc('day', now())
		  AND status <> 'failed'
	`;
	return BigInt(r?.spent ?? '0');
}

/** Open positions across all agents — the position-loop work set. */
export async function getOpenPositions(network) {
	return sql`
		SELECT p.*, s.take_profit_pct, s.stop_loss_pct, s.trailing_stop_pct,
		       s.max_hold_seconds, s.slippage_bps, s.user_id AS strat_user_id,
		       s.kill_switch
		FROM agent_sniper_positions p
		JOIN agent_sniper_strategies s ON s.id = p.strategy_id
		WHERE p.network = ${network}
		  AND p.status = 'open'
		  AND (p.error IS NULL OR p.error NOT LIKE 'graduated%')
		ORDER BY p.opened_at ASC
		LIMIT 200
	`;
}

export function logStrategyLoad(network) {
	log.info('strategies refreshed', { network, count: _strategies.length });
}
