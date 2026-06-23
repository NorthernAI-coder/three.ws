// Reusable custodial trade executor — the server-side engine behind autonomous
// trade paths (the Mirror / Copy-Trade social graph, task 09).
//
// api/agents/solana-trade.js is the OWNER-DRIVEN, HTTP-coupled discretionary path
// (preview + rich response shaping + req/res). It cannot be called server-to-server
// by a cron fanout. This module is its autonomous sibling: the SAME shared spend
// guardrails (api/_lib/agent-trade-guards.js), the SAME rug/honeypot firewall, the
// SAME idempotent custody ledger, the SAME MEV-aware execution engine — exposed as
// a plain async function that returns a structured result instead of writing HTTP.
//
//   executeCustodialTrade({ agentId, userId, meta, side, mint, solAmount,
//                           tokenAmountRaw, slippageBps, network, source,
//                           idempotencyKey, extraMeta })
//     → { ok, code, message, detail, skip, signature, explorer, usd, ... }
//
// The pump.fun instruction builders + live-quote logic intentionally mirror
// solana-trade.js (which itself mirrors api/agents/pumpfun/[action].js) so the
// "how do we price + build a trade" convention has a consistent shape across paths;
// the "is this trade allowed" math has exactly ONE home in agent-trade-guards.js
// and is imported, never re-implemented.
//
// Hard rules honoured: the key is decrypted only via recoverSolanaAgentKeypair,
// only after the guard gauntlet passes, always audit-logged; guard rejections are
// structured (never thrown 500s) so the caller can record an honest skip reason; a
// retried idempotency key never double-spends. $THREE is the only coin three.ws
// promotes — this is coin-agnostic plumbing that trades whatever mint it's given.

import { sql } from './db.js';
import { recoverSolanaAgentKeypair } from './agent-wallet.js';
import { solanaConnection, solanaPublicConnection } from './agent-pumpfun.js';
import { PublicKey } from '@solana/web3.js';
import { cacheSet } from './cache.js';
import { logAudit } from './audit.js';
import { explorerTxUrl } from './avatar-wallet.js';
import {
	enforceSpendLimit, SpendLimitError, getSpendLimits, updateCustodyEvent, lamportsToUsd,
	getTradeLimits, getDailySpendLamports,
	checkKillSwitch, checkPerTradeCap, checkDailyBudgetLamports, checkSolHeadroom, checkPriceImpact,
	SOL_FEE_HEADROOM_LAMPORTS,
} from './agent-trade-guards.js';
import {
	slippagePercentFromBps, resolveCustodialQuote, resolveTokenProgramForMintOwner, WSOL_MINT,
} from './pump-trade-args.js';
import { getBuyQuote, getSellQuote } from './solana/sdk-bridge.js';
import { getAmmPoolState } from './pump.js';
import { assessTradeSafety, recordFirewallDecision } from './trade-firewall.js';
import { submitProtected } from './execution-engine.js';

const LAMPORTS_PER_SOL = 1_000_000_000;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function netOf(v) { return v === 'devnet' ? 'devnet' : 'mainnet'; }
function lamportsToSol(l) { return Number(BigInt(l)) / LAMPORTS_PER_SOL; }

function applySlippageFloor(amountBase, slippageBps) {
	const a = BigInt(amountBase);
	const bps = BigInt(Math.max(0, Math.min(10_000, slippageBps)));
	return (a * (10_000n - bps)) / 10_000n;
}

async function resolveMintDecimals(conn, mintPk) {
	try {
		const info = await conn.getParsedAccountInfo(mintPk);
		const dec = info?.value?.data?.parsed?.info?.decimals;
		if (Number.isInteger(dec)) return dec;
	} catch { /* fall through */ }
	return 6;
}

// Sum the owner's full SPL balance for a mint, across both token programs, in base
// units. Used to mirror a leader's EXIT: when the leader sells, the follower sells
// its entire position in that mint (a conservative, honest "leader out → you out").
async function resolveTokenBalanceRaw(conn, ownerPk, mintPk) {
	let total = 0n;
	for (const programId of [
		new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
		new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
	]) {
		try {
			const res = await conn.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk, programId });
			for (const { account } of res.value) {
				const amt = account?.data?.parsed?.info?.tokenAmount?.amount;
				if (amt) total += BigInt(amt);
			}
		} catch { /* program may not own any account; ignore */ }
	}
	return total;
}

function typed(status, code, message) {
	const e = new Error(message);
	e.status = status; e.code = code;
	return e;
}

function clampImpact(v) {
	const n = Number(v);
	return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function derivePriceImpact(inReserve, outReserve, inAmt, out) {
	const ir = Number(inReserve?.toString?.() ?? inReserve ?? 0);
	const or = Number(outReserve?.toString?.() ?? outReserve ?? 0);
	const a = Number(inAmt?.toString?.() ?? inAmt ?? 0);
	const o = Number(out ?? 0);
	if (!(ir > 0) || !(or > 0) || !(a > 0)) return 0;
	const spotOut = (a * or) / ir;
	if (!(spotOut > 0)) return 0;
	const impact = ((spotOut - o) / spotOut) * 100;
	return Number.isFinite(impact) ? Math.max(0, Math.min(100, impact)) : 0;
}

async function loadAmm(network, mintPk) {
	const amm = await getAmmPoolState({ network, mint: mintPk });
	const resolvedQuote = amm.pool.quoteMint?.toString?.() ?? WSOL_MINT;
	if (resolvedQuote !== WSOL_MINT) {
		throw typed(409, 'unsupported_quote', 'this coin trades against a non-SOL asset');
	}
	return amm;
}

// Live quote — bonding curve first, AMM pool for graduated coins. Pure read.
export async function quoteTrade({ conn, side, mintPk, mintStr, network, solAmount, tokenAmountRaw, slippageBps }) {
	if (side === 'buy') {
		const lamportsIn = BigInt(Math.floor(Number(solAmount) * LAMPORTS_PER_SOL));
		if (lamportsIn <= 0n) throw typed(400, 'amount_too_small', 'enter a SOL amount greater than zero');

		const curve = await getBuyQuote(conn, mintStr, lamportsIn.toString());
		if (curve && curve.tokens) {
			const decimals = await resolveMintDecimals(conn, mintPk);
			const tokensOut = BigInt(curve.tokens.toString());
			if (tokensOut <= 0n) throw typed(400, 'amount_too_small', 'that SOL amount is too small to buy any tokens');
			return {
				venue: 'bonding_curve', graduated: false, quoteAsset: 'SOL',
				inAsset: 'SOL', inAmount: Number(solAmount), inAtomics: lamportsIn.toString(),
				outAsset: 'TOKEN', outAtomics: tokensOut.toString(), outUi: Number(tokensOut) / 10 ** decimals,
				minOutAtomics: applySlippageFloor(tokensOut, slippageBps).toString(),
				minOutUi: Number(applySlippageFloor(tokensOut, slippageBps)) / 10 ** decimals,
				decimals, priceImpactPct: clampImpact(curve.priceImpact),
			};
		}

		const amm = await loadAmm(network, mintPk);
		const sdk = await import('@pump-fun/pump-swap-sdk');
		const r = sdk.buyQuoteInput({
			quote: new amm.BN(lamportsIn.toString()), slippage: slippagePercentFromBps(slippageBps),
			baseReserve: amm.baseReserve, quoteReserve: amm.quoteReserve, globalConfig: amm.globalConfig,
			baseMintAccount: amm.baseMintAccount, baseMint: amm.pool.baseMint,
			coinCreator: amm.pool.coinCreator, creator: amm.pool.creator, feeConfig: amm.feeConfig,
		});
		const decimals = await resolveMintDecimals(conn, mintPk);
		const tokensOut = BigInt((r.base ?? 0).toString());
		if (tokensOut <= 0n) throw typed(400, 'amount_too_small', 'that SOL amount is too small to buy any tokens');
		return {
			venue: 'amm', graduated: true, quoteAsset: 'SOL', poolKey: amm.poolKey.toString(),
			inAsset: 'SOL', inAmount: Number(solAmount), inAtomics: lamportsIn.toString(),
			outAsset: 'TOKEN', outAtomics: tokensOut.toString(), outUi: Number(tokensOut) / 10 ** decimals,
			minOutAtomics: applySlippageFloor(tokensOut, slippageBps).toString(),
			minOutUi: Number(applySlippageFloor(tokensOut, slippageBps)) / 10 ** decimals,
			decimals, priceImpactPct: derivePriceImpact(amm.quoteReserve, amm.baseReserve, lamportsIn, tokensOut),
		};
	}

	// SELL — amount is token base units.
	const baseUnits = BigInt(tokenAmountRaw);
	if (baseUnits <= 0n) throw typed(400, 'amount_too_small', 'enter a token amount greater than zero');
	const decimals = await resolveMintDecimals(conn, mintPk);

	const curve = await getSellQuote(conn, mintStr, baseUnits.toString());
	if (curve && curve.sol) {
		const lamportsOut = BigInt(curve.sol.toString());
		return {
			venue: 'bonding_curve', graduated: false, quoteAsset: 'SOL',
			inAsset: 'TOKEN', inAtomics: baseUnits.toString(), inUi: Number(baseUnits) / 10 ** decimals,
			outAsset: 'SOL', outAtomics: lamportsOut.toString(), outUi: lamportsToSol(lamportsOut),
			minOutAtomics: applySlippageFloor(lamportsOut, slippageBps).toString(),
			minOutUi: lamportsToSol(applySlippageFloor(lamportsOut, slippageBps)),
			decimals, priceImpactPct: clampImpact(curve.priceImpact),
		};
	}

	const amm = await loadAmm(network, mintPk);
	const sdk = await import('@pump-fun/pump-swap-sdk');
	const r = sdk.sellBaseInput({
		base: new amm.BN(baseUnits.toString()), slippage: slippagePercentFromBps(slippageBps),
		baseReserve: amm.baseReserve, quoteReserve: amm.quoteReserve, globalConfig: amm.globalConfig,
		baseMintAccount: amm.baseMintAccount, baseMint: amm.pool.baseMint,
		coinCreator: amm.pool.coinCreator, creator: amm.pool.creator, feeConfig: amm.feeConfig,
	});
	const lamportsOut = BigInt((r.uiQuote ?? r.minQuote ?? 0).toString());
	const minLamportsOut = BigInt((r.minQuote ?? r.uiQuote ?? 0).toString());
	return {
		venue: 'amm', graduated: true, quoteAsset: 'SOL', poolKey: amm.poolKey.toString(),
		inAsset: 'TOKEN', inAtomics: baseUnits.toString(), inUi: Number(baseUnits) / 10 ** decimals,
		outAsset: 'SOL', outAtomics: lamportsOut.toString(), outUi: lamportsToSol(lamportsOut),
		minOutAtomics: minLamportsOut.toString(), minOutUi: lamportsToSol(minLamportsOut),
		decimals, priceImpactPct: derivePriceImpact(amm.baseReserve, amm.quoteReserve, baseUnits, lamportsOut),
	};
}

// Build the on-chain instructions for the resolved venue + side. Curve trades use
// the pump-sdk v2 builders; graduated trades use the pump-swap AMM SDK.
async function buildTradeInstructions({ side, conn, network, mintPk, ownerPk, quote, slippageBps, solAmount, tokenAmountRaw }) {
	const BNmod = (await import('bn.js')).default;

	if (quote.venue === 'bonding_curve') {
		const { PumpSdk, OnlinePumpSdk, getBuyTokenAmountFromSolAmount, getSellSolAmountFromTokenAmount } =
			await import('@pump-fun/pump-sdk');
		const online = new OnlinePumpSdk(conn);
		const sdk = new PumpSdk();
		const mintInfo = await conn.getAccountInfo(mintPk);
		if (!mintInfo) throw typed(404, 'mint_not_found', 'mint not found on this network');
		const tokenProgram = resolveTokenProgramForMintOwner(mintInfo.owner);

		if (side === 'buy') {
			const [global, feeConfig, state] = await Promise.all([
				online.fetchGlobal(), online.fetchFeeConfig().catch(() => null),
				online.fetchBuyState(mintPk, ownerPk, tokenProgram),
			]);
			const qa = resolveCustodialQuote(state.bondingCurve?.quoteMint, network);
			if (!qa.isSol) throw typed(409, 'unsupported_quote', 'this coin trades against a non-SOL asset');
			const quoteAtomics = new BNmod(Math.floor(Number(solAmount) * LAMPORTS_PER_SOL));
			const expected = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: state.bondingCurve.tokenTotalSupply, bondingCurve: state.bondingCurve, amount: quoteAtomics });
			if (!expected.gt(new BNmod(0))) throw typed(400, 'amount_too_small', 'that SOL amount is too small to buy any tokens');
			return sdk.buyV2Instructions({
				global, bondingCurveAccountInfo: state.bondingCurveAccountInfo, bondingCurve: state.bondingCurve,
				associatedUserAccountInfo: state.associatedUserAccountInfo, mint: mintPk, user: ownerPk,
				amount: expected, quoteAmount: quoteAtomics, slippage: slippagePercentFromBps(slippageBps), tokenProgram,
			});
		}
		const [global, feeConfig, state] = await Promise.all([
			online.fetchGlobal(), online.fetchFeeConfig().catch(() => null),
			online.fetchSellState(mintPk, ownerPk, tokenProgram),
		]);
		const qa = resolveCustodialQuote(state.bondingCurve?.quoteMint, network);
		if (!qa.isSol) throw typed(409, 'unsupported_quote', 'this coin trades against a non-SOL asset');
		const tokens = new BNmod(tokenAmountRaw);
		const expectedQuote = getSellSolAmountFromTokenAmount({ global, feeConfig, mintSupply: state.bondingCurve.tokenTotalSupply, bondingCurve: state.bondingCurve, amount: tokens });
		return sdk.sellV2Instructions({
			global, bondingCurveAccountInfo: state.bondingCurveAccountInfo, bondingCurve: state.bondingCurve,
			mint: mintPk, user: ownerPk, amount: tokens, quoteAmount: expectedQuote,
			slippage: slippagePercentFromBps(slippageBps), tokenProgram,
		});
	}

	const { PumpAmmSdk, OnlinePumpAmmSdk, canonicalPumpPoolPda } = await import('@pump-fun/pump-swap-sdk');
	const amm = new PumpAmmSdk();
	const online = new OnlinePumpAmmSdk(conn);
	const poolKey = canonicalPumpPoolPda(mintPk);
	const swapState = await online.swapSolanaState(poolKey, ownerPk).catch(() => online.swapSolanaStateNoPool(poolKey, ownerPk));
	const slippage = slippagePercentFromBps(slippageBps);
	if (side === 'buy') {
		return amm.buyQuoteInput(swapState, new BNmod(BigInt(quote.inAtomics).toString()), slippage);
	}
	return amm.sellBaseInput(swapState, new BNmod(tokenAmountRaw), slippage);
}

function fail(code, message, { skip = false, detail = null } = {}) {
	return { ok: false, skip, code, message, detail };
}

/**
 * Execute a real custodial trade for an agent, server-side, fully guarded.
 *
 * Returns a structured result — never throws for an expected rejection (a guard
 * breach, insufficient funds, a firewall block, a missing position). Those come
 * back as { ok:false, skip:true, code, message } so an autonomous caller can log
 * an honest skip reason and keep its subscription alive. Only genuinely
 * unexpected internal failures bubble up.
 *
 * @param {object} p
 * @param {string} p.agentId            follower agent id
 * @param {string} p.userId             owner user id (for custody/audit attribution)
 * @param {object} p.meta               agent_identities.meta (wallet keys + spend policy)
 * @param {'buy'|'sell'} p.side
 * @param {string} p.mint               base58 mint
 * @param {number} [p.solAmount]        buy: SOL to spend
 * @param {string} [p.tokenAmountRaw]   sell: token base units, or 'max' for full position
 * @param {number} [p.slippageBps]
 * @param {string} [p.network]
 * @param {string} [p.source]           recorded in custody meta + audit (e.g. 'mirror')
 * @param {string} p.idempotencyKey     required — dedupes retries
 * @param {object} [p.extraMeta]        merged into the custody event meta + audit meta
 */
export async function executeCustodialTrade({
	agentId, userId, meta, side, mint, solAmount, tokenAmountRaw,
	slippageBps = 300, network = 'mainnet', source = 'auto', idempotencyKey, extraMeta = {},
}) {
	network = netOf(network);
	side = side === 'sell' ? 'sell' : 'buy';
	if (!idempotencyKey) return fail('validation_error', 'idempotency_key is required');
	if (typeof mint !== 'string' || !BASE58_RE.test(mint)) return fail('validation_error', 'mint must be a base58 Solana address');
	if (mint === WSOL_MINT) return fail('validation_error', 'cannot trade wrapped SOL as a token');

	let mintPk, ownerPk;
	try { mintPk = new PublicKey(mint); } catch { return fail('validation_error', 'mint is not a valid Solana address'); }

	const address = meta?.solana_address || null;
	const encryptedSecret = meta?.encrypted_solana_secret || null;
	if (!address || !encryptedSecret) return fail('wallet_preparing', 'the agent wallet is still being prepared', { skip: true });
	try { ownerPk = new PublicKey(address); } catch { return fail('wallet_preparing', 'the agent wallet is still being prepared', { skip: true }); }

	const idem = String(idempotencyKey).slice(0, 128);
	const readConn = solanaConnection(network);

	// Resolve a 'max' sell to the full on-chain position now (mirroring a leader exit).
	if (side === 'sell') {
		if (tokenAmountRaw === 'max' || tokenAmountRaw == null) {
			const bal = await resolveTokenBalanceRaw(readConn, ownerPk, mintPk).catch(() => 0n);
			if (bal <= 0n) return fail('no_position', 'the follower holds none of this token to mirror the exit', { skip: true });
			tokenAmountRaw = bal.toString();
		} else if (!/^\d+$/.test(String(tokenAmountRaw)) || BigInt(String(tokenAmountRaw)) <= 0n) {
			return fail('validation_error', 'token_amount_raw must be a positive base-unit integer');
		}
	} else if (!(Number(solAmount) > 0)) {
		return fail('amount_too_small', 'sol amount must be greater than zero', { skip: true });
	}

	const bps = Math.max(0, Math.min(5_000, Math.round(Number(slippageBps) || 300)));

	// 1. Quote.
	let quote;
	try {
		quote = await quoteTrade({ conn: readConn, side, mintPk, mintStr: mint, network, solAmount, tokenAmountRaw, slippageBps: bps });
	} catch (e) {
		if (e?.code === 'pool_not_found') return fail('no_market', 'no bonding curve or AMM pool found for this mint', { skip: true });
		if (e?.status) return fail(e.code || 'quote_failed', e.message, { skip: true });
		return fail('quote_failed', 'could not price this trade right now', { skip: true });
	}

	// USD value of the SOL leg (best-effort).
	let usdValue = null;
	try {
		const lamports = side === 'buy' ? BigInt(quote.inAtomics) : BigInt(quote.outAtomics);
		usdValue = await lamportsToUsd(lamports);
	} catch { usdValue = null; }

	const limitsCfg = getSpendLimits(meta);
	const tradeLimits = getTradeLimits(meta);

	// 2. Guards — identical predicates to the owner-driven path. The kill switch +
	//    price-impact breaker apply both directions; SOL caps gate only a buy.
	const killed = checkKillSwitch(tradeLimits.kill_switch);
	if (killed) return fail('trading_paused', 'trading is paused for this agent', { skip: true, detail: {} });

	if (side === 'buy') {
		const lamportsIn = BigInt(quote.inAtomics);

		const capLamports = tradeLimits.per_trade_sol == null ? null : BigInt(Math.floor(tradeLimits.per_trade_sol * LAMPORTS_PER_SOL));
		const cap = checkPerTradeCap(lamportsIn, capLamports);
		if (cap) return fail('per_trade_cap', `over the per-trade cap of ◎${tradeLimits.per_trade_sol}`, { skip: true, detail: cap.detail });

		if (tradeLimits.daily_budget_sol != null) {
			const budgetLamports = BigInt(Math.floor(tradeLimits.daily_budget_sol * LAMPORTS_PER_SOL));
			const spent = await getDailySpendLamports(agentId, network);
			const budget = checkDailyBudgetLamports(spent, lamportsIn, budgetLamports);
			if (budget) return fail('daily_budget', `over the ◎${tradeLimits.daily_budget_sol} daily budget`, { skip: true, detail: budget.detail });
		}

		try {
			await enforceSpendLimit({ agentId, limits: limitsCfg, category: 'trade', usdValue, network });
		} catch (e) {
			if (e instanceof SpendLimitError) return fail(e.code, e.message, { skip: true, detail: e.detail });
			throw e;
		}
	}

	// Price-impact circuit breaker — both directions.
	{
		const impact = checkPriceImpact(quote.priceImpactPct, tradeLimits.max_price_impact_pct);
		if (impact) return fail('price_impact_too_high', `price impact ${quote.priceImpactPct.toFixed(1)}% over the ${tradeLimits.max_price_impact_pct}% limit`, { skip: true, detail: impact.detail });
	}

	// 3. Rug/honeypot firewall — a REAL on-chain simulated round-trip, buys only.
	if (side === 'buy') {
		const assessment = await assessTradeSafety({
			network, mint: mintPk, side: 'buy', payer: ownerPk,
			quoteAmount: BigInt(quote.inAtomics), priceImpactPct: quote.priceImpactPct,
		}).catch(() => null);
		if (assessment) {
			recordFirewallDecision({
				mint, network, side: 'buy', verdict: assessment.verdict, score: assessment.score,
				simulated: assessment.simulated, checks: assessment.checks, reasons: assessment.reasons,
				source, agentId, userId, quoteLamports: BigInt(quote.inAtomics), enforced: assessment.verdict === 'block',
			}).catch(() => {});
			if (assessment.verdict === 'block') {
				return fail('firewall_blocked', assessment.reasons?.[0] || 'blocked by the safety firewall', { skip: true, detail: { score: assessment.score, reasons: assessment.reasons } });
			}
		}
	}

	// 4. SOL headroom / balance check (real on-chain balance).
	let walletLamports = null;
	try { walletLamports = BigInt(await readConn.getBalance(ownerPk, 'confirmed')); }
	catch {
		try { walletLamports = BigInt(await solanaPublicConnection(network).getBalance(ownerPk, 'confirmed')); }
		catch { walletLamports = null; }
	}
	if (walletLamports != null) {
		const spendLamports = side === 'buy' ? BigInt(quote.inAtomics) : 0n;
		const head = checkSolHeadroom(walletLamports, spendLamports, SOL_FEE_HEADROOM_LAMPORTS);
		if (head) return fail(side === 'buy' ? 'insufficient_sol' : 'insufficient_sol_for_fees', 'the wallet lacks SOL for this trade plus fees', { skip: true, detail: head.detail });
	}

	// 5. Idempotency fast-path.
	const [prior] = await sql`
		SELECT status, signature FROM agent_custody_events
		WHERE agent_id = ${agentId} AND idempotency_key = ${idem} LIMIT 1
	`;
	if (prior) {
		if (prior.status === 'confirmed' && prior.signature) {
			return { ok: true, replayed: true, signature: prior.signature, explorer: explorerTxUrl(prior.signature, network), side, mint, network, venue: quote.venue, usd: usdValue };
		}
		if (prior.status === 'pending') return fail('trade_in_progress', 'a trade with this id is already in flight');
		return fail('trade_failed', 'this trade id already failed');
	}

	// 6. Claim the idempotency slot (also the spend-ledger row). A buy counts toward
	//    the daily ceiling (usd set); a sell records usd=null so it never inflates spend.
	const claimMeta = {
		side, mint, venue: quote.venue, source,
		expected_out_atomics: quote.outAtomics, min_out_atomics: quote.minOutAtomics,
		slippage_bps: bps, price_impact_pct: quote.priceImpactPct, ...extraMeta,
	};
	const claim = await sql`
		INSERT INTO agent_custody_events
			(agent_id, user_id, event_type, category, network, asset,
			 amount_lamports, amount_raw, usd, status, idempotency_key, meta)
		VALUES (
			${agentId}, ${userId}, 'spend', 'trade', ${network},
			${side === 'buy' ? 'SOL' : mint},
			${side === 'buy' ? quote.inAtomics : null},
			${side === 'sell' ? quote.inAtomics : null},
			${side === 'buy' ? usdValue ?? null : null},
			'pending', ${idem},
			${JSON.stringify(claimMeta)}::jsonb
		)
		ON CONFLICT (agent_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
		RETURNING id
	`;
	if (!claim.length) return fail('trade_in_progress', 'a trade with this id is already in flight');
	const claimId = claim[0].id;

	// 7. Recover the signing key (audit-logged) and build the instructions.
	let keypair;
	try {
		keypair = await recoverSolanaAgentKeypair(encryptedSecret, {
			agentId, userId, reason: `${source}_trade_${side}`,
			meta: { mint, network, custody_event_id: claimId, venue: quote.venue, source },
		});
	} catch (e) {
		await updateCustodyEvent(claimId, { status: 'failed', meta: { error: 'key_recover_failed' } }).catch(() => {});
		return fail('key_recover_failed', 'could not access the agent wallet key — no funds were moved');
	}

	let instructions;
	try {
		instructions = await buildTradeInstructions({ side, conn: readConn, network, mintPk, ownerPk: keypair.publicKey, quote, slippageBps: bps, solAmount, tokenAmountRaw });
	} catch (e) {
		await updateCustodyEvent(claimId, { status: 'failed', meta: { error: 'build_failed', message: (e?.message || '').slice(0, 200) } }).catch(() => {});
		return fail(e?.code || 'build_failed', e?.message || 'could not build this trade — the market may have moved', { skip: true });
	}

	// 8. Broadcast + confirm through the MEV-aware execution engine (protected single-tx,
	//    no Jito tip — autonomous mirrors don't run a per-strategy tip policy).
	const signConn = solanaConnection(network);
	let signature, confirmed = true, execTelemetry = null;
	try {
		const result = await submitProtected({
			network, connection: signConn, payer: keypair, instructions,
			opts: { tipMode: 'off', confirmTimeoutMs: 45_000 },
		});
		signature = result.signature;
		execTelemetry = { route: result.route, priority_fee_microlamports: result.priorityFeeMicroLamports, landed_ms: result.landedMs, attempts: result.attempts };
	} catch (e) {
		if (e?.code === 'TX_ERR') { signature = e.signature || null; confirmed = false; }
		else {
			await updateCustodyEvent(claimId, { status: 'failed', meta: { error: 'send_failed', message: (e?.message || '').slice(0, 200) } }).catch(() => {});
			logAudit({ userId, action: 'custody.trade_failed', resourceId: agentId, meta: { side, mint, reason: 'send_failed', source, ...extraMeta } });
			return fail('send_failed', 'the trade could not be submitted and no funds were moved');
		}
	}

	if (!confirmed) {
		await updateCustodyEvent(claimId, { signature, meta: { confirm: 'unconfirmed' } }).catch(() => {});
		logAudit({ userId, action: 'custody.trade_unconfirmed', resourceId: agentId, meta: { side, mint, signature, source, ...extraMeta } });
		return fail('trade_unconfirmed', 'the trade was submitted but not yet confirmed', { detail: { signature, explorer: explorerTxUrl(signature, network) } });
	}

	await updateCustodyEvent(claimId, {
		status: 'confirmed', signature, usd: side === 'buy' ? usdValue ?? null : null,
		meta: execTelemetry ? { exec: execTelemetry } : undefined,
	}).catch(() => {});
	logAudit({ userId, action: 'custody.trade', resourceId: agentId, meta: { side, mint, venue: quote.venue, usd: usdValue, signature, network, exec_route: execTelemetry?.route, source, ...extraMeta } });

	await cacheSet(`sol:bal:${address}:${network}`, null, 1).catch(() => {});

	return {
		ok: true, replayed: false, signature, explorer: explorerTxUrl(signature, network),
		side, mint, network, venue: quote.venue, usd: usdValue,
		custodyEventId: claimId,
		sol_spent: side === 'buy' ? lamportsToSol(quote.inAtomics) : null,
		sol_received: side === 'sell' ? lamportsToSol(quote.outAtomics) : null,
		tokens_received: side === 'buy' ? quote.outAtomics : null,
		tokens_sold: side === 'sell' ? quote.inAtomics : null,
		price_impact_pct: quote.priceImpactPct,
	};
}
