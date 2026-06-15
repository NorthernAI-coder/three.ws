// agent-sniper — the only module that signs and broadcasts.
//
// executeBuy / executeSell own every guardrail, the idempotency lock, the trade
// build, the broadcast, and the agent_sniper_positions writes. In `simulate`
// mode the full path runs against REAL on-chain quotes but the broadcast is
// skipped (sig = 'SIMULATED') — an ops safety toggle, never the default.

import { sql } from '../../api/_lib/db.js';
import { log } from './log.js';
import { loadAgentKeypair } from './keys.js';
import { getTradeCtx, signAndSend } from './trade-client.js';
import { countOpenPositions, getDailySpend } from './strategy-store.js';

// Fee + rent headroom we keep above the trade size so a buy doesn't fail for
// lack of lamports to pay fees / open the token ATA.
const SOL_HEADROOM_LAMPORTS = 3_000_000n; // ~0.003 SOL

// ── per-agent serialization ────────────────────────────────────────────────
// Single-worker assumption: a per-agent in-process lock makes the budget +
// concurrency checks race-free without a DB reservation. (Scaling to N workers
// would require an atomic spend reservation instead — documented in README.)
const _locks = new Map();
async function withAgentLock(agentId, fn) {
	const prev = _locks.get(agentId) || Promise.resolve();
	let release;
	const next = new Promise((r) => (release = r));
	_locks.set(agentId, prev.then(() => next));
	await prev;
	try {
		return await fn();
	} finally {
		release();
		if (_locks.get(agentId) === next) _locks.delete(agentId);
	}
}

function bn(ctx, v) {
	return new ctx.BN(BigInt(v).toString());
}

/**
 * Attempt to snipe `mint` for `strat`. All checks short-circuit before any tx.
 * @returns {Promise<{ status: string, reason?: string, sig?: string }>}
 */
export async function executeBuy({ cfg, strat, mint, throttle }) {
	return withAgentLock(strat.agent_id, async () => {
		const perTrade = BigInt(strat.per_trade_lamports);
		const tag = { agent: strat.agent_id, mint: mint.mint, symbol: mint.symbol };

		// 1. global throttle (platform-wide backstop)
		if (!throttle.tryConsume()) return skip(tag, 'global_throttle');

		// 2. concurrency cap
		const open = await countOpenPositions(strat.agent_id, cfg.network);
		if (open >= strat.max_concurrent_positions) return skip(tag, 'max_positions');

		// 3. daily budget cap
		const spent = await getDailySpend(strat.agent_id, cfg.network);
		if (spent + perTrade > BigInt(strat.daily_budget_lamports)) return skip(tag, 'daily_budget');

		// 4. idempotency lock — claim the (agent,mint,network) slot BEFORE the tx.
		const claimed = await sql`
			INSERT INTO agent_sniper_positions
				(strategy_id, agent_id, user_id, wallet, network, mint, symbol, name, status)
			VALUES (${strat.id}, ${strat.agent_id}, ${strat.user_id}, ${'pending'}, ${cfg.network},
			        ${mint.mint}, ${mint.symbol || null}, ${mint.name || null}, 'opening')
			ON CONFLICT (agent_id, mint, network) DO NOTHING
			RETURNING id
		`;
		if (!claimed.length) return skip(tag, 'already_held');
		const posId = claimed[0].id;

		try {
			// 5. agent wallet + funds
			const loaded = await loadAgentKeypair(strat.agent_id, strat.user_id, 'sniper_buy');
			if (!loaded) return await fail(posId, tag, 'no_wallet');
			const { keypair, address } = loaded;
			await sql`UPDATE agent_sniper_positions SET wallet = ${address} WHERE id = ${posId}`;

			const ctx = await getTradeCtx(cfg.network);
			const lamports = BigInt(await ctx.connection.getBalance(keypair.publicKey, 'confirmed'));
			if (lamports < perTrade + SOL_HEADROOM_LAMPORTS) {
				return await fail(posId, tag, 'insufficient_sol');
			}

			const mintPk = new ctx.web3.PublicKey(mint.mint);
			const slippagePct = strat.slippage_bps / 100;

			// 6. quote + price-impact circuit breaker
			const quote = await ctx.client.quoteForBuy({ mint: mintPk, quoteAmount: bn(ctx, perTrade), slippagePct });
			if (strat.require_sol_quote && !quote.quoteMint.equals(ctx.web3.PublicKey.default) && quote.quoteMint.toBase58() !== 'So11111111111111111111111111111111111111112') {
				return await fail(posId, tag, 'quote_not_sol');
			}
			if (Number(quote.priceImpactPct) > Number(strat.max_price_impact_pct)) {
				return await fail(posId, tag, 'price_impact');
			}

			// 7. build + (live) broadcast
			const built = await ctx.client.buildBuyInstructions({
				mint: mintPk, user: keypair.publicKey, quoteAmount: bn(ctx, perTrade), slippagePct,
			});
			const baseAmount = BigInt(built.expectedBaseTokens.toString());
			if (baseAmount <= 0n) return await fail(posId, tag, 'zero_tokens');

			let sig = 'SIMULATED';
			if (cfg.mode === 'live') {
				sig = await signAndSend(ctx, keypair, built.instructions, cfg.confirmTimeoutMs);
			}

			const pricePerToken = Number(perTrade) / Number(baseAmount);
			await sql`
				UPDATE agent_sniper_positions SET
					status = 'open', buy_sig = ${sig},
					entry_quote_lamports = ${perTrade.toString()},
					base_amount = ${baseAmount.toString()},
					entry_price_lamports_per_token = ${pricePerToken},
					entry_price_impact_pct = ${Number(quote.priceImpactPct)},
					peak_value_lamports = ${perTrade.toString()},
					last_value_lamports = ${perTrade.toString()},
					last_quoted_at = now()
				WHERE id = ${posId}
			`;
			log.trade('buy', { ...tag, mode: cfg.mode, sig, sol: lamportsToSol(perTrade), base: baseAmount.toString(), impact: Number(quote.priceImpactPct).toFixed(2) });
			return { status: 'open', sig };
		} catch (err) {
			return await fail(posId, tag, errCode(err), err);
		}
	});
}

/**
 * Close `position` for `reason`. Re-quotes fresh for slippage, builds the sell,
 * broadcasts (live), records realized P&L.
 */
export async function executeSell({ cfg, position, reason }) {
	return withAgentLock(position.agent_id, async () => {
		const tag = { agent: position.agent_id, mint: position.mint, symbol: position.symbol, reason };
		await sql`UPDATE agent_sniper_positions SET status = 'closing' WHERE id = ${position.id} AND status = 'open'`;

		try {
			const loaded = await loadAgentKeypair(position.agent_id, position.user_id, 'sniper_sell');
			if (!loaded) return await fail(position.id, tag, 'no_wallet');
			const { keypair } = loaded;

			const ctx = await getTradeCtx(cfg.network);
			const mintPk = new ctx.web3.PublicKey(position.mint);
			const baseAmount = bn(ctx, BigInt(position.base_amount));
			const slippagePct = (position.slippage_bps ?? 500) / 100;

			let expectedOut;
			let built;
			try {
				const quote = await ctx.client.quoteForSell({ mint: mintPk, baseAmount, slippagePct });
				expectedOut = BigInt(quote.expectedQuoteOut.toString());
				built = await ctx.client.buildSellInstructions({ mint: mintPk, user: keypair.publicKey, baseAmount, slippagePct });
			} catch (err) {
				if (err?.name === 'CoinGraduatedError') return await markGraduated(position.id, tag);
				throw err;
			}

			let sig = 'SIMULATED';
			if (cfg.mode === 'live') {
				sig = await signAndSend(ctx, keypair, built.instructions, cfg.confirmTimeoutMs);
			} else {
				expectedOut = BigInt(built.expectedQuoteOut.toString());
			}

			const entry = BigInt(position.entry_quote_lamports || '0');
			const pnl = expectedOut - entry;
			const pnlPct = entry > 0n ? (Number(pnl) / Number(entry)) * 100 : 0;
			await sql`
				UPDATE agent_sniper_positions SET
					status = 'closed', exit_reason = ${reason}, sell_sig = ${sig},
					exit_quote_lamports = ${expectedOut.toString()},
					realized_pnl_lamports = ${pnl.toString()},
					realized_pnl_pct = ${pnlPct},
					closed_at = now()
				WHERE id = ${position.id}
			`;
			log.trade('sell', { ...tag, mode: cfg.mode, sig, pnl_sol: lamportsToSol(pnl), pnl_pct: pnlPct.toFixed(1) });
			return { status: 'closed', sig, pnl: pnl.toString() };
		} catch (err) {
			// A failed sell must NOT terminate the position — leave it 'open' so the
			// next tick retries the exit rather than stranding the bag as 'failed'.
			await sql`UPDATE agent_sniper_positions SET status = 'open', error = ${errCode(err)}, last_quoted_at = now() WHERE id = ${position.id}`;
			log.warn('sell failed (will retry)', { ...tag, code: errCode(err), err: err?.message });
			return { status: 'retry', reason: errCode(err) };
		}
	});
}

async function markGraduated(posId, tag) {
	// Bonding-curve sell is impossible post-graduation. Flag for the AMM-exit
	// fast-follow and stop re-quoting (getOpenPositions excludes 'graduated%').
	await sql`
		UPDATE agent_sniper_positions
		SET error = 'graduated:awaiting_amm_exit', exit_reason = 'graduated', last_quoted_at = now()
		WHERE id = ${posId}
	`;
	log.warn('position graduated — needs AMM exit', tag);
	return { status: 'graduated' };
}

function skip(tag, reason) {
	log.info('skip', { ...tag, reason });
	return { status: 'skip', reason };
}

async function fail(posId, tag, reason, err) {
	await sql`UPDATE agent_sniper_positions SET status = 'failed', error = ${reason}, closed_at = now() WHERE id = ${posId}`;
	log.warn('buy aborted', { ...tag, reason, err: err?.message });
	return { status: 'failed', reason };
}

function errCode(err) {
	return err?.code || err?.name || 'error';
}

function lamportsToSol(l) {
	return Number(BigInt(l)) / 1e9;
}
