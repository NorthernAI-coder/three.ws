// @ts-check
// api/_lib/x402/agents/persona-kit.js
//
// Shared machinery for the ring's agent-buyer personas (Task 09). Every persona
// module (endpoint-shopper.js, agora-citizen.js, curator.js) is a thin,
// pure-ish description of WHAT an agent buys; this kit is the HOW that all of
// them share:
//
//   • deterministic selection — mulberry32(seed) + helpers so "which persona
//     acts this tick" and "which endpoint it buys" are a pure function of a tick
//     seed. Same seed ⇒ same plan, every time (the property Task 09 tests assert
//     and the dashboard relies on for reproducibility).
//   • float math — planFloatMove(): pure floor/target/ceiling arithmetic the
//     rebalancer's float-top-up step (ring-rebalance.js) and its tests share.
//   • executePurchase() — the ONE guarded settle path every persona routes
//     through: spend-limit-check (enforceSpendLimit) → ring-allowlist the
//     counterparty → pay via payX402 with the AGENT's keypair → custody-log the
//     spend → return a structured record the driver writes to x402_autonomous_log
//     with agent_id attribution. No persona is allowed to move money any other
//     way — that is what keeps every agent purchase spend-limited, allowlisted,
//     and attributable.
//
// Money invariant: the buyer is a platform-controlled custodial agent wallet and
// the payTo is the ring treasury (X402_PAY_TO_SOLANA) — both inside
// ringAllowedAddresses(). USDC only; never $THREE or any third-party coin (the
// commit gate in CLAUDE.md applies). Personas are labeled internal in every log
// row (`persona` + `internal:true`), never presented as organic users.

import { PublicKey } from '@solana/web3.js';

import { payX402, USDC_MINT } from '../pay.js';
import {
	enforceSpendLimit,
	recordSpend,
	SpendLimitError,
} from '../../agent-trade-guards.js';
import { recoverSolanaAgentKeypair } from '../../agent-wallet.js';
import { env } from '../../env.js';
// The pure core (RNG, float math, small utils) lives in a dependency-free module
// so it can be unit-tested without loading Solana/DB/env. Re-exported here so
// existing importers of persona-kit keep working unchanged.
import {
	mulberry32,
	seedFromString,
	pickDeterministic,
	planFloatMove,
	floatBand,
	isRingAddress,
	summarizeLiveness,
	buildUrl,
} from './persona-math.js';

export {
	mulberry32,
	seedFromString,
	pickDeterministic,
	planFloatMove,
	floatBand,
	isRingAddress,
	summarizeLiveness,
	buildUrl,
};

// ── Guarded purchase path ──────────────────────────────────────────────────────

const ATOMIC_PER_USD = 1_000_000;

/**
 * Execute ONE persona purchase through the full guard chain. Never throws — every
 * failure (spend-limit refusal, allowlist miss, protocol/network fault) is
 * returned as a structured, recordable outcome so a single bad purchase can never
 * crash the ring tick.
 *
 * Flow:
 *   1. enforceSpendLimit({ category:'x402', usdValue }) — the agent's own caps.
 *      A SpendLimitError is caught and surfaced as { status:'refused' }, NOT
 *      rethrown (the tick continues; the refusal is logged + custody-recorded).
 *   2. Probe the endpoint's 402 challenge via payX402 to learn payTo, then assert
 *      payTo ∈ ringAllowedAddresses(). A non-ring recipient is refused BEFORE any
 *      payment (defence in depth over the facilitator's own payTo allowlist).
 *   3. Pay via payX402 with the AGENT's recovered keypair as buyer.
 *   4. Record a custody 'spend' event (durable, owner-viewable) with the settle
 *      signature so the loop stays closed through the business layer.
 *
 * @param {object} p
 * @param {{ id:string, name?:string, address:string, keypair:import('@solana/web3.js').Keypair, meta?:object }} p.agent
 * @param {{ slug:string, url:string, method:string, body:any, priceAtomic:number, kind:string, memo?:string }} p.purchase
 * @param {{ conn:any, blockhash:string, mintInfo:any }} p.solana
 * @param {Set<string>} p.allowed  pre-resolved ringAllowedAddresses()
 * @param {string} p.persona       persona id (attribution / logs)
 * @param {number} [p.remainingCap] atomic cap remaining this tick
 * @param {typeof payX402} [p.payImpl] injectable payment client (tests); defaults to payX402
 * @returns {Promise<{ status:'paid'|'free'|'refused'|'error'|'skipped', persona:string, agentId:string,
 *   slug:string, kind:string, amountAtomic:number, txSig:string|null, payTo:string|null,
 *   reason:string|null, durationMs:number, responseLiveness:object }>}
 */
export async function executePurchase({ agent, purchase, solana, allowed, persona, remainingCap = Infinity, payImpl = payX402 }) {
	const t0 = Date.now();
	const base = {
		persona,
		agentId: agent.id,
		slug: purchase.slug,
		kind: purchase.kind,
		amountAtomic: 0,
		txSig: null,
		payTo: null,
		reason: null,
	};
	const done = (extra) => ({ ...base, ...extra, durationMs: Date.now() - t0, responseLiveness: extra.responseLiveness || {} });

	const usdValue = (purchase.priceAtomic || 0) / ATOMIC_PER_USD;

	// 1 — the agent's own spend policy. A breach is a REFUSAL, not a crash.
	try {
		await enforceSpendLimit({
			agentId: agent.id,
			userId: agent.userId ?? null,
			meta: agent.meta || {},
			category: 'x402',
			usdValue,
			asset: USDC_MINT,
			network: 'mainnet',
		});
	} catch (err) {
		if (err instanceof SpendLimitError) {
			await recordSpend({
				agentId: agent.id,
				userId: agent.userId ?? null,
				category: 'x402',
				network: 'mainnet',
				asset: USDC_MINT,
				usd: usdValue,
				status: 'failed',
				reason: `spend_limit:${err.code}`,
				meta: { persona, slug: purchase.slug, internal: true, refused: true },
			}).catch(() => {});
			return done({ status: 'refused', reason: `spend_limit:${err.code}` });
		}
		return done({ status: 'error', reason: `enforce_error:${String(err?.message || err).slice(0, 120)}` });
	}

	// 2 — probe first so we can allowlist the recipient BEFORE paying. payX402
	// returns a structured outcome; a thrown fault is caught below.
	let result;
	try {
		result = await payImpl({
			url: purchase.url,
			method: purchase.method || 'GET',
			body: purchase.body ?? null,
			buyer: agent.keypair,
			conn: solana.conn,
			blockhash: solana.blockhash,
			mintInfo: solana.mintInfo,
			remainingCap,
			userAgent: `threews-ring-agent/${persona}`,
			// A distinct nonce per (agent, slug, tick) keeps byte-identical
			// same-price transfers from colliding on one shared blockhash.
			nonce: seedFromString(`${agent.id}:${purchase.slug}:${solana.blockhash}`) % 997,
			// The purchase-recipient allowlist is enforced here, pre-broadcast, via
			// the onAccept hook: payX402 hands us the resolved accept so we can
			// refuse a non-ring payTo before signing.
			onAccept: (accept) => {
				const payTo = accept?.payTo || null;
				base.payTo = payTo;
				if (!isRingAddress(payTo, allowed)) {
					return { abort: true, reason: `payto_not_ring:${payTo}` };
				}
				return null;
			},
		});
	} catch (err) {
		return done({ status: 'error', reason: `pay_error:${String(err?.message || err).slice(0, 120)}` });
	}

	if (result.refusedByHook) {
		return done({ status: 'refused', reason: result.errorMsg || 'payto_not_ring' });
	}
	if (result.free) {
		return done({ status: 'free', responseLiveness: summarizeLiveness(result.responseBody) });
	}
	if (!result.paid) {
		return done({ status: result.skipped ? 'skipped' : 'error', reason: result.errorMsg, responseLiveness: summarizeLiveness(result.responseBody) });
	}

	// 4 — durable custody record of the settled spend (owner-viewable trail).
	await recordSpend({
		agentId: agent.id,
		userId: agent.userId ?? null,
		category: 'x402',
		network: 'mainnet',
		asset: USDC_MINT,
		amountRaw: result.amountAtomic,
		usd: result.amountAtomic / ATOMIC_PER_USD,
		destination: base.payTo,
		signature: result.txSig,
		status: 'confirmed',
		reason: `ring:${persona}:${purchase.slug}`,
		meta: { persona, slug: purchase.slug, kind: purchase.kind, internal: true, memo: purchase.memo || null },
	}).catch(() => {});

	return done({
		status: 'paid',
		amountAtomic: result.amountAtomic,
		txSig: result.txSig,
		responseLiveness: summarizeLiveness(result.responseBody),
	});
}

/**
 * Recover an agent's custodial Solana keypair for signing, auditing the decrypt.
 * Returns null (never throws) when the agent has no usable secret — the driver
 * skips that agent for the tick.
 * @param {{ id:string, user_id?:string, meta?:object }} row
 * @returns {Promise<import('@solana/web3.js').Keypair|null>}
 */
export async function recoverAgentBuyer(row) {
	const enc = row?.meta?.encrypted_solana_secret;
	if (!enc) return null;
	try {
		return await recoverSolanaAgentKeypair(enc, {
			agentId: row.id,
			userId: row.user_id ?? null,
			reason: 'x402_ring_buy',
			meta: { context: 'ring-agent-buyer' },
		});
	} catch {
		return null;
	}
}


/** Assert USDC is configured; personas call this before planning real spends. */
export function usdcConfigured() {
	return Boolean(USDC_MINT);
}

/** The ring treasury pubkey, or null. Personas verify it parses as a real key. */
export function treasuryPubkey() {
	const addr = env.X402_PAY_TO_SOLANA;
	if (!addr) return null;
	try {
		return new PublicKey(addr).toBase58();
	} catch {
		return null;
	}
}
