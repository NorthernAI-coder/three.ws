// agent-sniper — position lifecycle loop.
//
// Every cfg.pollMs: re-quote each open position's current SOL value off the
// bonding curve, update the high-water mark, and exit on stop-loss / trailing
// stop / take-profit / timeout (evaluated in that priority order). Pricing is
// authoritative on-chain (quoteForSell), so it needs no per-mint trade feed.

import { sql } from '../../api/_lib/db.js';
import { log } from './log.js';
import { getTradeCtx } from './trade-client.js';
import { getOpenPositions } from './strategy-store.js';
import { executeSell } from './executor.js';
import { quoteAmmSell } from './amm-exit.js';

function pct(n) {
	const x = Number(n);
	return Number.isFinite(x) ? x : null;
}

/** Decide the exit reason for a position, or null to hold. */
function decideExit(pos, value, peak) {
	const entry = BigInt(pos.entry_quote_lamports || '0');
	if (entry <= 0n) return null;
	const ev = Number(entry);
	const sl = pct(pos.stop_loss_pct);
	const ts = pct(pos.trailing_stop_pct);
	const tp = pct(pos.take_profit_pct);

	if (sl != null && value <= ev * (1 - sl / 100)) return 'stop_loss';
	if (ts != null && peak > 0 && value <= peak * (1 - ts / 100)) return 'trailing_stop';
	if (tp != null && value >= ev * (1 + tp / 100)) return 'take_profit';

	const heldS = (Date.now() - new Date(pos.opened_at).getTime()) / 1000;
	if (pos.max_hold_seconds != null && heldS >= pos.max_hold_seconds) return 'timeout';
	return null;
}

async function tickPosition(cfg, pos) {
	// Kill-switch flipped while holding → exit at market now.
	if (pos.kill_switch) {
		await executeSell({ cfg, position: pos, reason: 'kill_switch' });
		return;
	}

	const baseAmount = new (await getTradeCtx(cfg.network)).BN(BigInt(pos.base_amount).toString());
	const slippagePct = (pos.slippage_bps ?? 500) / 100;
	const graduated = typeof pos.error === 'string' && pos.error.startsWith('graduated');

	const value = graduated
		? await requoteGraduated(cfg, pos, baseAmount, slippagePct)
		: await requoteCurve(cfg, pos, baseAmount, slippagePct);
	if (value == null) return; // transient quote failure — try again next sweep

	const prevPeak = Number(pos.peak_value_lamports || pos.entry_quote_lamports || 0);
	const peak = Math.max(prevPeak, value);
	await sql`
		UPDATE agent_sniper_positions
		SET last_value_lamports = ${Math.round(value)}, peak_value_lamports = ${Math.round(peak)}, last_quoted_at = now()
		WHERE id = ${pos.id}
	`;

	const reason = decideExit(pos, value, peak);
	if (reason) await executeSell({ cfg, position: pos, reason });
}

// Re-quote a still-on-curve position off the bonding curve. On graduation, flag
// the position once so the NEXT sweep re-quotes it off the AMM (and executeSell
// routes the exit there) — never park it. Returns null on a transient failure.
async function requoteCurve(cfg, pos, baseAmount, slippagePct) {
	const ctx = await getTradeCtx(cfg.network);
	const mintPk = new ctx.web3.PublicKey(pos.mint);
	try {
		const quote = await ctx.client.quoteForSell({ mint: mintPk, baseAmount, slippagePct });
		return Number(quote.expectedQuoteOut.toString());
	} catch (err) {
		if (err?.name === 'CoinGraduatedError') {
			await sql`
				UPDATE agent_sniper_positions
				SET error = 'graduated:awaiting_amm_exit', last_quoted_at = now()
				WHERE id = ${pos.id} AND status = 'open'
			`;
			// Flag in-memory too so a same-tick executeSell takes the AMM branch
			// directly instead of re-hitting the dead curve.
			pos.error = 'graduated:awaiting_amm_exit';
			log.info('position graduated — switching to AMM exit', { agent: pos.agent_id, mint: pos.mint });
			// Quote off the AMM on the same tick so exit triggers fire immediately.
			return await requoteGraduated(cfg, pos, baseAmount, slippagePct);
		}
		log.warn('position re-quote failed', { mint: pos.mint, err: err?.message });
		return null;
	}
}

// Re-quote a graduated position off the canonical AMM pool. Same exit math, real
// post-graduation price. Returns null on a transient failure (pool not yet
// readable, RPC hiccup) so the position holds and retries rather than mis-exiting.
async function requoteGraduated(cfg, pos, baseAmount, slippagePct) {
	try {
		const { expectedQuoteOut } = await quoteAmmSell({
			network: cfg.network, mint: pos.mint, baseAmount, slippagePct,
		});
		return Number(expectedQuoteOut);
	} catch (err) {
		log.warn('amm re-quote failed', { mint: pos.mint, code: err?.code, err: err?.message });
		return null;
	}
}

/** Run one sweep over all open positions. Errors on one position never abort the rest. */
export async function runPositionSweep(cfg) {
	let positions;
	try {
		positions = await getOpenPositions(cfg.network);
	} catch (err) {
		log.error('open-position query failed', { err: err?.message });
		return;
	}
	for (const pos of positions) {
		try {
			await tickPosition(cfg, pos);
		} catch (err) {
			log.error('position tick failed', { mint: pos.mint, err: err?.message });
		}
	}
}
