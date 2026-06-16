// Oracle worker — settle loop (the learning loop).
//
// Grades open agent actions against the data brain's ground-truth outcomes. Once
// a coin an agent acted on has resolved (graduated / rugged / ATH known), the
// action's win/loss + mark-to-market PnL is written back. This is what makes the
// agent's win-rate ledger honest and what feeds the conviction backtest.

import { sql } from '../../api/_lib/db.js';
import { log } from './log.js';
import { gradeAction } from '../../api/_lib/oracle/settle.js';

/** Open actions whose coin now has a resolved outcome. */
async function settleableActions(cfg, limit = 100) {
	return sql`
		select a.id, a.size_sol, a.entry_mc_usd,
		       o.graduated, o.rugged, o.ath_multiple, o.last_market_cap_usd
		from oracle_watch_actions a
		join pump_coin_outcomes o on o.mint = a.mint
		where a.network = ${cfg.network}
		  and (a.outcome is null or a.outcome = 'open')
		  and (o.graduated is true or o.rugged is true or o.ath_multiple is not null or o.last_market_cap_usd is not null)
		order by a.acted_at asc
		limit ${limit}
	`.catch((e) => { log.warn('settleable query failed:', e.message); return []; });
}

export async function runSettlePass(cfg) {
	const rows = await settleableActions(cfg);
	if (!rows.length) return 0;
	let settled = 0;
	for (const r of rows) {
		const g = gradeAction(
			{ size_sol: r.size_sol, entry_mc_usd: r.entry_mc_usd },
			{ graduated: r.graduated, rugged: r.rugged, ath_multiple: r.ath_multiple, last_market_cap_usd: r.last_market_cap_usd },
		);
		if (!g.settled) continue;
		try {
			await sql`
				update oracle_watch_actions
				set outcome = ${g.outcome}, peak_multiple = ${g.peak_multiple},
				    realized_pnl_sol = ${g.realized_pnl_sol}, settled_at = now()
				where id = ${r.id}
			`;
			settled += 1;
		} catch (e) {
			log.warn(`settle action ${r.id} failed:`, e.message);
		}
	}
	if (settled) log.info(`settled ${settled} action(s)`);
	return settled;
}
