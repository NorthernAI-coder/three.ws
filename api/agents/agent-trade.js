// POST /api/agents/:id/trade — discretionary, owner-authenticated pump.fun trade
// from the agent's OWN custodial wallet (server-signed).
//
// This is the discretionary sibling of the sniper: same instruction builders
// (PumpTradeClient buy/sell, AMM sell on graduation), same custodial key path
// (recoverSolanaAgentKeypair, audit-logged), and — critically — the SAME shared
// guardrail module (api/_lib/agent-trade-guards.js). The owner funds the agent
// wallet, then drives buys/sells through this endpoint; every trade is capped,
// budgeted, price-impact-broken, idempotent, and recorded into the custody
// ledger that backs the spend ceilings and the owner-facing audit feed.
//
// Routes (dispatched from api/agents/[id].js, sub === 'trade'):
//   POST /api/agents/:id/trade            execute a buy/sell
//   POST /api/agents/:id/trade/quote      preview: expected out, impact, fees, guards
//   GET  /api/agents/:id/trade/quote      same preview via query params
//   GET  /api/agents/:id/trade/limits     read the per-agent trade limits
//   PUT  /api/agents/:id/trade/limits     update the per-agent trade limits (owner)
//
// SNIPER_MODE=simulate or { simulate: true } runs the full real-quote path but
// skips the broadcast (paper mode) — an ops/test toggle, never the default.

import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { cors, json, method, error, readJson, rateLimited, serverError } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { ensureAgentWallet, recoverSolanaAgentKeypair } from '../_lib/agent-wallet.js';
import { getPumpTradeClient } from '../_lib/pump.js';
import { buildAmmSellInstructions, quoteAmmSell } from '../../workers/agent-sniper/amm-exit.js';
import { logAudit } from '../_lib/audit.js';
import { explorerTxUrl } from '../_lib/avatar-wallet.js';
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import {
	getAssociatedTokenAddressSync, getMint,
	TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { randomUUID } from 'node:crypto';
import {
	validateSolanaAddress, enforceSpendLimit, SpendLimitError, lamportsToUsd,
	getTradeLimits, setTradeLimits, getDailySpendLamports,
	updateCustodyEvent,
	checkKillSwitch, checkConcurrency, checkPerTradeCap, checkDailyBudgetLamports,
	checkSolHeadroom, checkPriceImpact, tradeGuardResponse,
	SOL_FEE_HEADROOM_LAMPORTS, TRADE_LIMIT_DEFAULTS,
} from '../_lib/agent-trade-guards.js';

const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const CONFIRM_TIMEOUT_MS = 45_000;

function normNetwork(n) {
	return n === 'devnet' ? 'devnet' : 'mainnet';
}

async function resolveAuth(req) {
	const session = await getSessionUser(req);
	if (session) return { userId: session.id };
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return { userId: bearer.userId };
	return null;
}

// Owner gate shared by every route here. On any failure it writes the response
// and returns { error: true }; on success returns the owner + agent row + meta.
async function loadOwnedAgent(req, res, id) {
	const auth = await resolveAuth(req);
	if (!auth) { error(res, 401, 'unauthorized', 'sign in required'); return { error: true }; }

	const [row] = await sql`SELECT id, user_id, meta FROM agent_identities WHERE id = ${id} AND deleted_at IS NULL`;
	if (!row) { error(res, 404, 'not_found', 'agent not found'); return { error: true }; }
	if (row.user_id !== auth.userId) { error(res, 403, 'forbidden', 'not your agent'); return { error: true }; }

	return { auth, row, meta: { ...(row.meta || {}) } };
}

// Whole-token → base units, and SOL → lamports, without float drift on the
// integer part. amount is already validated finite + positive.
function toBaseUnits(amount, decimals) {
	const [whole, frac = ''] = String(amount).split('.');
	const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
	return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

function solToLamports(sol) {
	return toBaseUnits(sol, 9);
}

function lamportsToSol(l) {
	return Number(BigInt(l)) / 1e9;
}

// Resolve the agent's SPL holding for a mint: token program, decimals, ATA, and
// current base-unit balance. Throws a structured boundary error on any miss.
async function resolveHolding(conn, mintPk, ownerPk) {
	let mintAcc;
	try {
		mintAcc = await conn.getAccountInfo(mintPk);
	} catch {
		mintAcc = null;
	}
	if (!mintAcc) throw boundary(400, 'invalid_mint', 'token mint not found on this network');
	const tokenProgramId = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

	let decimals;
	try {
		decimals = (await getMint(conn, mintPk, 'confirmed', tokenProgramId)).decimals;
	} catch {
		throw boundary(400, 'invalid_mint', 'could not read the token mint');
	}

	const ata = getAssociatedTokenAddressSync(mintPk, ownerPk, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
	let balanceRaw = 0n;
	try {
		balanceRaw = BigInt((await conn.getTokenAccountBalance(ata)).value.amount);
	} catch {
		balanceRaw = 0n; // no ATA → holds none
	}
	return { tokenProgramId, decimals, ata, balanceRaw };
}

function boundary(status, code, message, detail = {}) {
	return Object.assign(new Error(message), { status, code, detail, isBoundary: true });
}

function isGraduatedErr(err) {
	return err?.name === 'CoinGraduatedError' || err?.code === 'CoinGraduated';
}

// Price a buy or sell against live state. Returns everything the guards and the
// builder need. Throws boundary() errors for bad input / unpriceable / RPC.
async function quoteTrade({ ctx, side, mintPk, amount, isMax, slippagePct, network, ownerPk }) {
	const slippageBps = Math.round(slippagePct * 100);

	if (side === 'buy') {
		const lamports = solToLamports(amount);
		if (lamports <= 0n) throw boundary(400, 'invalid_amount', 'amount rounds to zero lamports');
		let q;
		try {
			q = await ctx.client.quoteForBuy({ mint: mintPk, quoteAmount: new ctx.BN(lamports.toString()), slippagePct });
		} catch (err) {
			if (isGraduatedErr(err)) {
				throw boundary(409, 'graduated', 'This coin has graduated off the bonding curve. Buying it from the agent wallet via the AMM isn’t supported on this path yet.');
			}
			console.error('[agents/agent-trade] buy quote failed', err?.message);
			throw boundary(502, 'quote_failed', 'could not price the buy — try again');
		}
		requireSolQuote(ctx, q.quoteMint);
		const expectedBase = BigInt(q.expectedBaseTokens.toString());
		if (expectedBase <= 0n) throw boundary(422, 'zero_out', 'this amount buys zero tokens — raise it');
		const minOut = (expectedBase * BigInt(10000 - slippageBps)) / 10000n;
		return {
			venue: 'bonding_curve',
			lamports, baseAmount: null, decimals: null,
			expectedOutRaw: expectedBase, minOutRaw: minOut,
			priceImpactPct: Number(q.priceImpactPct ?? 0),
			usdValue: null, slippageBps,
		};
	}

	// sell
	const conn = ctx.connection;
	const { decimals, balanceRaw } = await resolveHolding(conn, mintPk, ownerPk);
	if (balanceRaw <= 0n) throw boundary(400, 'insufficient_token_balance', 'the agent holds none of this token');
	const baseAmount = isMax ? balanceRaw : toBaseUnits(amount, decimals);
	if (baseAmount <= 0n) throw boundary(400, 'invalid_amount', 'amount rounds to zero token units');
	if (baseAmount > balanceRaw) {
		throw boundary(400, 'insufficient_token_balance', 'amount exceeds the agent token balance', {
			balance_raw: balanceRaw.toString(), decimals,
		});
	}

	const baseBn = new ctx.BN(baseAmount.toString());
	let expectedSolOut;
	let priceImpactPct;
	let venue = 'bonding_curve';
	try {
		const q = await ctx.client.quoteForSell({ mint: mintPk, baseAmount: baseBn, slippagePct });
		requireSolQuote(ctx, q.quoteMint);
		expectedSolOut = BigInt(q.expectedQuoteOut.toString());
		priceImpactPct = Number(q.priceImpactPct ?? 0);
	} catch (err) {
		if (!isGraduatedErr(err)) {
			if (err?.isBoundary) throw err;
			console.error('[agents/agent-trade] sell quote failed', err?.message);
			throw boundary(502, 'quote_failed', 'could not price the sell — try again');
		}
		// Graduated: route the quote through the canonical AMM pool.
		const a = await quoteAmmSell({ network, mint: mintPk.toBase58(), baseAmount: baseBn, slippagePct });
		expectedSolOut = a.expectedQuoteOut;
		priceImpactPct = Number(a.priceImpactPct ?? 0);
		venue = 'amm';
	}
	const minOut = (expectedSolOut * BigInt(10000 - slippageBps)) / 10000n;
	return {
		venue,
		lamports: null, baseAmount, decimals,
		expectedOutRaw: expectedSolOut, minOutRaw: minOut,
		priceImpactPct, usdValue: null, slippageBps,
	};
}

function requireSolQuote(ctx, quoteMint) {
	if (!quoteMint) return;
	const isDefault = quoteMint.equals?.(ctx.web3.PublicKey.default);
	const b58 = quoteMint.toBase58?.();
	if (isDefault || b58 === WSOL_MINT) return;
	throw boundary(422, 'quote_not_sol', 'this coin is not SOL-quoted — the agent wallet trades in SOL on this path');
}

// Build the on-chain instructions for a prepared trade.
async function buildTradeInstructions({ ctx, side, venue, mintPk, ownerPk, lamports, baseAmount, slippagePct, network }) {
	if (side === 'buy') {
		const built = await ctx.client.buildBuyInstructions({
			mint: mintPk, user: ownerPk, quoteAmount: new ctx.BN(lamports.toString()), slippagePct,
		});
		return { instructions: built.instructions, expectedOutRaw: BigInt(built.expectedBaseTokens.toString()) };
	}
	const baseBn = new ctx.BN(baseAmount.toString());
	if (venue === 'amm') {
		const built = await buildAmmSellInstructions({ network, mint: mintPk.toBase58(), user: ownerPk, baseAmount: baseBn, slippagePct });
		return { instructions: built.instructions, expectedOutRaw: built.expectedQuoteOut };
	}
	const built = await ctx.client.buildSellInstructions({ mint: mintPk, user: ownerPk, baseAmount: baseBn, slippagePct });
	return { instructions: built.instructions, expectedOutRaw: BigInt(built.expectedQuoteOut.toString()) };
}

// Run every guard for a prepared trade. Returns null if clear, or a 4xx response
// shape. Buys are gated on the lamport caps + USD ceiling + balance; sells only
// move SOL inward, so they skip the spend caps but still honor the kill switch,
// the price-impact breaker, and a fee-headroom floor.
async function runGuards({ id, side, tradeLimits, prep, walletLamports, network, meta }) {
	const killed = checkKillSwitch(tradeLimits.kill_switch);
	if (killed) return tradeGuardResponse(killed);

	const impact = checkPriceImpact(prep.priceImpactPct, tradeLimits.max_price_impact_pct);
	if (impact) return tradeGuardResponse(impact);

	if (side === 'buy') {
		const lamports = prep.lamports;
		const capLamports = tradeLimits.per_trade_sol == null ? null : solToLamports(tradeLimits.per_trade_sol);
		const cap = checkPerTradeCap(lamports, capLamports);
		if (cap) return tradeGuardResponse(cap);

		if (tradeLimits.max_concurrent != null) {
			const open = await countOpenTrades(id, network);
			const conc = checkConcurrency(open, tradeLimits.max_concurrent);
			if (conc) return tradeGuardResponse(conc);
		}

		const budgetLamports = tradeLimits.daily_budget_sol == null ? null : solToLamports(tradeLimits.daily_budget_sol);
		if (budgetLamports != null) {
			const spent = await getDailySpendLamports(id, network);
			const budget = checkDailyBudgetLamports(spent, lamports, budgetLamports);
			if (budget) return tradeGuardResponse(budget);
		}

		// Cross-path USD ceiling (shared with withdraw / x402 / snipe).
		try {
			await enforceSpendLimit({ agentId: id, meta, category: 'trade', usdValue: prep.usdValue, network });
		} catch (e) {
			if (e instanceof SpendLimitError) return { status: e.status, code: e.code, message: e.message, detail: e.detail };
			throw e;
		}

		const headroom = checkSolHeadroom(walletLamports, lamports, SOL_FEE_HEADROOM_LAMPORTS);
		if (headroom) return tradeGuardResponse(headroom);
	} else {
		// Sell: only needs enough SOL on hand to pay the network fee (and maybe
		// open a wSOL/quote ATA). Reuse the same headroom floor with zero spend.
		const headroom = checkSolHeadroom(walletLamports, 0n, SOL_FEE_HEADROOM_LAMPORTS);
		if (headroom) {
			return tradeGuardResponse({
				reason: 'insufficient_sol',
				detail: { wallet_lamports: BigInt(walletLamports).toString(), required_lamports: SOL_FEE_HEADROOM_LAMPORTS.toString() },
			});
		}
	}
	return null;
}

// Count the agent's open discretionary trades in the trailing window — buys that
// haven't been closed by a matching sell. A lightweight concurrency signal drawn
// from the unified custody ledger (only enforced when max_concurrent is set).
async function countOpenTrades(agentId, network) {
	const [r] = await sql`
		SELECT count(*)::int AS n FROM agent_custody_events
		WHERE agent_id = ${agentId} AND network = ${network}
		  AND event_type = 'spend' AND category = 'trade'
		  AND status IN ('pending', 'confirmed', 'ok')
		  AND (meta->>'side') = 'buy'
		  AND created_at > now() - interval '24 hours'
	`;
	return r?.n ?? 0;
}

// Parse + validate the trade request body into a normalized shape, or throw a
// boundary() error. Shared by execute + preview.
function parseTradeInput(body, tradeLimits) {
	const side = body.side === 'sell' ? 'sell' : body.side === 'buy' ? 'buy' : null;
	if (!side) throw boundary(400, 'invalid_side', 'side must be "buy" or "sell"');

	const mintCheck = validateSolanaAddress(body.mint);
	if (!mintCheck.valid) throw boundary(400, 'invalid_mint', `mint is not a valid Solana address (${mintCheck.reason})`);

	const denom = side === 'buy' ? 'sol' : 'token';
	const isMax = side === 'sell' && (body.amount === 'max' || body.amount === 'MAX' || body.amount === 'all');
	let amount = null;
	if (!isMax) {
		amount = Number(body.amount);
		if (!Number.isFinite(amount) || amount <= 0) {
			throw boundary(400, 'invalid_amount', side === 'buy' ? 'amount (SOL to spend) must be a positive number' : 'amount (tokens to sell) must be a positive number or "max"');
		}
	}

	const requestedBps = Number.isFinite(Number(body.slippageBps)) ? Math.round(Number(body.slippageBps)) : tradeLimits.max_slippage_bps;
	const slippageBps = Math.max(0, Math.min(tradeLimits.max_slippage_bps, requestedBps));

	return {
		side, denom, isMax, amount,
		mintPk: mintCheck.pubkey,
		mint: mintCheck.base58,
		slippageBps,
		slippagePct: slippageBps / 100,
		network: normNetwork(body.network),
		simulate: body.simulate === true || process.env.SNIPER_MODE === 'simulate',
		idempotencyKey: typeof body.idempotency_key === 'string' && body.idempotency_key.trim()
			? body.idempotency_key.trim().slice(0, 128)
			: null,
	};
}

// ── execute ─────────────────────────────────────────────────────────────────

async function handleExecute(req, res, id) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const owned = await loadOwnedAgent(req, res, id);
	if (owned.error) return;
	const { auth, meta } = owned;

	const rlUser = await limits.tradePerUser(auth.userId);
	if (!rlUser.success) return rateLimited(res, rlUser);
	const rlIp = await limits.authIp(clientIp(req));
	if (!rlIp.success) return rateLimited(res, rlIp);

	let body;
	try {
		body = await readJson(req);
	} catch (e) {
		return error(res, e?.status === 415 ? 415 : 400, 'bad_request', e?.message || 'invalid request body');
	}

	const tradeLimits = getTradeLimits(meta);
	let input;
	try {
		input = parseTradeInput(body, tradeLimits);
	} catch (e) {
		return boundaryError(res, e);
	}
	const { side, network, simulate, slippagePct } = input;
	const idempotencyKey = input.idempotencyKey || randomUUID();

	// Guarantee the wallet exists (lazy provision) so a funded-but-unprovisioned
	// agent can trade. ensureAgentWallet audits the provision and never returns
	// the secret.
	let address;
	try {
		address = (await ensureAgentWallet(id, auth.userId, { reason: 'trade' })).address;
	} catch (e) {
		return error(res, 500, 'wallet_unavailable', 'could not prepare the agent wallet — try again');
	}
	const ownerPk = new PublicKey(address);

	// Fast-path idempotency: a retry of a finished/in-flight trade with the same key.
	{
		const [existing] = await sql`
			SELECT id, status, signature, meta FROM agent_custody_events
			WHERE agent_id = ${id} AND idempotency_key = ${idempotencyKey}
		`;
		if (existing) {
			if (existing.status === 'confirmed') {
				return json(res, 200, { data: { replayed: true, signature: existing.signature, explorer: explorerTxUrl(existing.signature, network), network, ...(existing.meta || {}) } });
			}
			if (existing.status === 'pending') {
				return error(res, 409, 'trade_in_progress', 'a trade with this id is already in flight — check the audit log before retrying', { signature: existing.signature || null });
			}
			return error(res, 409, 'trade_failed', 'this trade id already failed — retry with a fresh idempotency key', { signature: existing.signature || null });
		}
	}

	let ctx;
	try {
		ctx = await getPumpTradeClient({ network });
	} catch (e) {
		return error(res, 502, 'rpc_error', 'could not connect to the trade RPC — try again');
	}
	const conn = ctx.connection;

	let walletLamports;
	try {
		walletLamports = BigInt(await conn.getBalance(ownerPk, 'confirmed'));
	} catch {
		return error(res, 502, 'rpc_error', 'could not read the wallet balance — try again');
	}

	// Price the trade.
	let prep;
	try {
		prep = await quoteTrade({ ctx, side, mintPk: input.mintPk, amount: input.amount, isMax: input.isMax, slippagePct, network, ownerPk });
	} catch (e) {
		return boundaryError(res, e);
	}
	if (side === 'buy' && prep.lamports != null) {
		try { prep.usdValue = await lamportsToUsd(prep.lamports); } catch { prep.usdValue = null; }
	}

	// Run the shared guardrails.
	let blocked;
	try {
		blocked = await runGuards({ id, side, tradeLimits, prep, walletLamports, network, meta });
	} catch (e) {
		return error(res, 502, 'guard_check_failed', 'could not verify the trade guardrails — try again');
	}
	if (blocked) return error(res, blocked.status, blocked.code, blocked.message, { detail: blocked.detail });

	// Build the on-chain instructions (also the real graduation check for buys).
	let built;
	try {
		built = await buildTradeInstructions({ ctx, side, venue: prep.venue, mintPk: input.mintPk, ownerPk, lamports: prep.lamports, baseAmount: prep.baseAmount, slippagePct, network });
	} catch (e) {
		if (isGraduatedErr(e)) {
			return error(res, 409, 'graduated', 'This coin graduated mid-trade — refresh the quote and retry.');
		}
		console.error('[agents/agent-trade] build failed', e?.message);
		return error(res, 502, 'build_failed', 'could not build the trade — try again');
	}

	const ledgerMeta = {
		side, mint: input.mint, venue: prep.venue, slippage_bps: input.slippageBps,
		price_impact_pct: prep.priceImpactPct,
		expected_out: prep.expectedOutRaw.toString(),
		min_out: prep.minOutRaw.toString(),
		...(side === 'sell' ? { base_amount: prep.baseAmount.toString(), token_decimals: prep.decimals } : {}),
	};

	// Paper mode: simulate the real instructions, never sign, never record.
	if (simulate) {
		const message = new TransactionMessage({ payerKey: ownerPk, recentBlockhash: (await safeBlockhash(conn))?.blockhash || '11111111111111111111111111111111', instructions: built.instructions }).compileToV0Message();
		const vtx = new VersionedTransaction(message);
		let sim = null;
		try {
			sim = await conn.simulateTransaction(vtx, { sigVerify: false, replaceRecentBlockhash: true });
		} catch (e) {
			console.error('[agents/agent-trade] simulation failed', e?.message);
			return serverError(res, 502, 'simulation_failed', e);
		}
		return json(res, 200, {
			data: {
				simulated: true, side, mint: input.mint, network, venue: prep.venue,
				expected_out: prep.expectedOutRaw.toString(),
				min_out: prep.minOutRaw.toString(),
				price_impact_pct: prep.priceImpactPct,
				err: sim.value?.err ?? null,
				units_consumed: sim.value?.unitsConsumed ?? null,
			},
		});
	}

	// Claim the idempotency slot — this row is also the ledger/audit entry. Buys
	// count toward the SOL + USD budgets (amount_lamports + usd set); sells move
	// SOL inward, so they record for audit with null amounts (don't consume budget).
	const claim = await sql`
		INSERT INTO agent_custody_events
			(agent_id, user_id, event_type, category, network, asset,
			 amount_lamports, amount_raw, usd, status, idempotency_key, reason, meta)
		VALUES (
			${id}, ${auth.userId}, 'spend', 'trade', ${network},
			${side === 'buy' ? 'SOL' : input.mint},
			${side === 'buy' ? String(prep.lamports) : null},
			${side === 'sell' ? String(prep.baseAmount) : null},
			${side === 'buy' ? (prep.usdValue ?? null) : null},
			'pending', ${idempotencyKey}, ${`trade_${side}`},
			${JSON.stringify(ledgerMeta)}::jsonb
		)
		ON CONFLICT (agent_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
		RETURNING id
	`;
	if (!claim.length) {
		return error(res, 409, 'trade_in_progress', 'a trade with this id is already in flight — check the audit log before retrying');
	}
	const claimId = claim[0].id;

	// Recover the custodial key (audit-logged) and sign.
	let keypair;
	try {
		keypair = await recoverSolanaAgentKeypair(meta.encrypted_solana_secret, {
			agentId: id, userId: auth.userId, reason: `trade_${side}`,
			meta: { mint: input.mint, network, venue: prep.venue, custody_event_id: claimId },
		});
	} catch (e) {
		await updateCustodyEvent(claimId, { status: 'failed', meta: { error: 'key_recover_failed' } }).catch(() => {});
		return error(res, 500, 'key_recover_failed', 'could not access the agent wallet key — no funds were moved');
	}

	// Submit + confirm, re-checking the chain on an ambiguous timeout.
	let result;
	try {
		result = await signSendConfirm(conn, keypair, built.instructions);
	} catch (e) {
		await updateCustodyEvent(claimId, { status: 'failed', meta: { error: e?.code || 'send_failed', message: e?.message?.slice(0, 200) } }).catch(() => {});
		logAudit({ userId: auth.userId, action: 'custody.trade_failed', resourceId: id, meta: { side, mint: input.mint, reason: e?.code || 'send_failed', network }, req });
		return error(res, 502, 'send_failed', 'the trade could not be submitted and no funds were moved — try again');
	}

	if (!result.confirmed) {
		await updateCustodyEvent(claimId, { signature: result.signature, meta: { confirm: 'unconfirmed' } }).catch(() => {});
		logAudit({ userId: auth.userId, action: 'custody.trade_unconfirmed', resourceId: id, meta: { side, mint: input.mint, signature: result.signature, network }, req });
		return error(res, 202, 'trade_unconfirmed', 'the trade was submitted but not yet confirmed — check the explorer link before retrying', { signature: result.signature, explorer: explorerTxUrl(result.signature, network) });
	}

	await updateCustodyEvent(claimId, { status: 'confirmed', signature: result.signature }).catch(() => {});
	logAudit({ userId: auth.userId, action: 'custody.trade', resourceId: id, meta: { side, mint: input.mint, venue: prep.venue, network, signature: result.signature, usd: prep.usdValue }, req });

	// Re-read the SOL balance for the response.
	let newSol = null;
	try { newSol = (await conn.getBalance(ownerPk, 'confirmed')) / 1e9; } catch { /* best-effort */ }

	return json(res, 200, {
		data: {
			replayed: false,
			signature: result.signature,
			explorer: explorerTxUrl(result.signature, network),
			side, mint: input.mint, network, venue: prep.venue,
			slippage_bps: input.slippageBps,
			price_impact_pct: prep.priceImpactPct,
			...(side === 'buy'
				? { sol_spent: lamportsToSol(prep.lamports), tokens_received: prep.expectedOutRaw.toString() }
				: { tokens_sold: prep.baseAmount.toString(), sol_received: lamportsToSol(prep.expectedOutRaw) }),
			min_out: prep.minOutRaw.toString(),
			new_balance_sol: newSol,
		},
	});
}

async function safeBlockhash(conn) {
	try { return await conn.getLatestBlockhash('confirmed'); } catch { return null; }
}

// Assemble a v0 tx, sign with the agent key, broadcast, and confirm — with a
// status re-check on an ambiguous confirm so a landed tx is never marked failed.
// Mirrors the proven flow in solana-wallet.js handleWithdraw.
async function signSendConfirm(conn, payer, instructions) {
	const bh = await conn.getLatestBlockhash('confirmed');
	const message = new TransactionMessage({
		payerKey: payer.publicKey,
		recentBlockhash: bh.blockhash,
		instructions,
	}).compileToV0Message();
	const vtx = new VersionedTransaction(message);
	vtx.sign([payer]);

	let signature;
	try {
		signature = await conn.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 });
	} catch (e) {
		throw Object.assign(new Error(e?.message || 'send failed'), { code: 'send_failed' });
	}

	let confirmed = true;
	try {
		const r = await conn.confirmTransaction({ signature, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
		if (r?.value?.err) confirmed = false;
	} catch {
		try {
			const st = await conn.getSignatureStatus(signature, { searchTransactionHistory: true });
			const s = st?.value?.confirmationStatus;
			confirmed = !st?.value?.err && (s === 'confirmed' || s === 'finalized');
		} catch {
			confirmed = false;
		}
	}
	return { signature, confirmed };
}

// ── preview / quote ───────────────────────────────────────────────────────────

async function handleQuote(req, res, id) {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	const owned = await loadOwnedAgent(req, res, id);
	if (owned.error) return;
	const { auth, meta } = owned;

	const rl = await limits.walletRead(auth.userId);
	if (!rl.success) return rateLimited(res, rl);

	let body = {};
	if (req.method === 'POST') {
		try { body = await readJson(req); } catch (e) { return error(res, 400, 'bad_request', e?.message || 'invalid request body'); }
	} else {
		const url = new URL(req.url, 'http://x');
		body = {
			side: url.searchParams.get('side'),
			mint: url.searchParams.get('mint'),
			amount: url.searchParams.get('amount'),
			slippageBps: url.searchParams.get('slippageBps'),
			network: url.searchParams.get('network'),
		};
	}

	const tradeLimits = getTradeLimits(meta);
	let input;
	try {
		input = parseTradeInput(body, tradeLimits);
	} catch (e) {
		return boundaryError(res, e);
	}
	const { side, network, slippagePct } = input;

	const address = meta.solana_address || null;
	if (!address) return error(res, 404, 'no_wallet', 'agent has no solana wallet yet — fund it to start trading');
	const ownerPk = new PublicKey(address);

	let ctx;
	try { ctx = await getPumpTradeClient({ network }); } catch { return error(res, 502, 'rpc_error', 'could not connect to the trade RPC — try again'); }
	const conn = ctx.connection;

	let walletLamports = 0n;
	try { walletLamports = BigInt(await conn.getBalance(ownerPk, 'confirmed')); } catch { /* preview tolerates */ }

	let prep;
	try {
		prep = await quoteTrade({ ctx, side, mintPk: input.mintPk, amount: input.amount, isMax: input.isMax, slippagePct, network, ownerPk });
	} catch (e) {
		return boundaryError(res, e);
	}
	if (side === 'buy' && prep.lamports != null) {
		try { prep.usdValue = await lamportsToUsd(prep.lamports); } catch { prep.usdValue = null; }
	}

	let blocked = null;
	try { blocked = await runGuards({ id, side, tradeLimits, prep, walletLamports, network, meta }); } catch { blocked = null; }

	return json(res, 200, {
		data: {
			side, mint: input.mint, network, venue: prep.venue,
			slippage_bps: input.slippageBps,
			price_impact_pct: prep.priceImpactPct,
			...(side === 'buy'
				? { sol_in: lamportsToSol(prep.lamports), expected_tokens_out: prep.expectedOutRaw.toString() }
				: { tokens_in: prep.baseAmount.toString(), token_decimals: prep.decimals, expected_sol_out: lamportsToSol(prep.expectedOutRaw) }),
			min_out: prep.minOutRaw.toString(),
			wallet_balance_sol: Number(walletLamports) / 1e9,
			allowed: !blocked,
			blocked_reason: blocked ? { code: blocked.code, message: blocked.message, detail: blocked.detail } : null,
		},
	});
}

// ── limits (read / update) ──────────────────────────────────────────────────

async function handleLimits(req, res, id) {
	if (cors(req, res, { methods: 'GET,PUT,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'PUT'])) return;

	const owned = await loadOwnedAgent(req, res, id);
	if (owned.error) return;
	const { auth, meta } = owned;

	if (req.method === 'GET') {
		return json(res, 200, { data: { limits: getTradeLimits(meta), defaults: TRADE_LIMIT_DEFAULTS } });
	}

	const rl = await limits.tradePerUser(auth.userId);
	if (!rl.success) return rateLimited(res, rl);

	let body;
	try { body = await readJson(req); } catch (e) { return error(res, 400, 'bad_request', e?.message || 'invalid request body'); }

	try {
		const next = await setTradeLimits(id, auth.userId, body, { req });
		return json(res, 200, { data: { limits: next } });
	} catch (e) {
		if (e?.status) return error(res, e.status, e.code || 'error', e.message);
		return error(res, 500, 'limit_update_failed', 'could not update the trade limits — try again');
	}
}

function boundaryError(res, e) {
	if (e?.isBoundary) return error(res, e.status, e.code, e.message, e.detail && Object.keys(e.detail).length ? { detail: e.detail } : {});
	return error(res, 500, 'internal_error', 'unexpected error preparing the trade');
}

export default async function handler(req, res, id, action) {
	if (action === 'limits') return handleLimits(req, res, id);
	if (action === 'quote') return handleQuote(req, res, id);
	if (action) return error(res, 404, 'not_found', 'unknown trade sub-resource');
	return handleExecute(req, res, id);
}
