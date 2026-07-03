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
import { ringAllowedAddresses } from '../ring-allowlist.js';
import {
	enforceSpendLimit,
	recordSpend,
	SpendLimitError,
	getSpendLimits,
} from '../../agent-trade-guards.js';
import { recoverSolanaAgentKeypair } from '../../agent-wallet.js';
import { env } from '../../env.js';

// ── Deterministic RNG ─────────────────────────────────────────────────────────

/**
 * mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Seeded, deterministic,
 * dependency-free. Used so persona selection and per-tick endpoint choice are a
 * pure function of the tick seed (reproducible across processes and tests).
 * @param {number} seed
 * @returns {() => number} next float in [0,1)
 */
export function mulberry32(seed) {
	let a = seed >>> 0;
	return function next() {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Fold an arbitrary string (e.g. a runId) into a 32-bit seed. Lets the driver
 * derive a stable seed when no monotonic tick counter is available.
 * @param {string} str
 * @returns {number}
 */
export function seedFromString(str) {
	let h = 2166136261 >>> 0;
	const s = String(str || '');
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/**
 * Deterministically pick `n` distinct items from `items` given a seed. Stable:
 * same (items, seed, n) ⇒ same picks in the same order. Used by personas to
 * choose which endpoint(s) to buy this tick.
 * @template T
 * @param {T[]} items
 * @param {number} seed
 * @param {number} [n=1]
 * @returns {T[]}
 */
export function pickDeterministic(items, seed, n = 1) {
	const pool = items.slice();
	const rng = mulberry32(seed);
	const out = [];
	const take = Math.min(n, pool.length);
	for (let i = 0; i < take; i++) {
		const idx = Math.floor(rng() * pool.length);
		out.push(pool.splice(idx, 1)[0]);
	}
	return out;
}

// ── Float math (shared with ring-rebalance float-top-up) ───────────────────────

/**
 * Pure float-band arithmetic. Given an agent's current USDC balance and the
 * band, decide the single next move that returns it toward target:
 *   balance < floor   → 'top_up'  by (target − balance)   (treasury → agent)
 *   balance > ceiling → 'sweep'   by (balance − target)   (agent → treasury)
 *   otherwise         → 'none'
 * All amounts are atomic USDC (6dp). Never returns a negative amount.
 *
 * @param {{ balanceAtomic: number|bigint, floorAtomic: number, targetAtomic: number, ceilingAtomic: number }} p
 * @returns {{ action: 'top_up'|'sweep'|'none', amountAtomic: number }}
 */
export function planFloatMove({ balanceAtomic, floorAtomic, targetAtomic, ceilingAtomic }) {
	const bal = Number(balanceAtomic);
	if (bal < floorAtomic) {
		return { action: 'top_up', amountAtomic: Math.max(0, targetAtomic - bal) };
	}
	if (bal > ceilingAtomic) {
		return { action: 'sweep', amountAtomic: Math.max(0, bal - targetAtomic) };
	}
	return { action: 'none', amountAtomic: 0 };
}

/**
 * Resolve the float band from env, once per call. FLOAT is the target; floor is
 * half of it, ceiling is double — a symmetric band that keeps a small working
 * balance without letting winnings accumulate off-ledger.
 * @returns {{ floorAtomic: number, targetAtomic: number, ceilingAtomic: number }}
 */
export function floatBand() {
	const target = Math.max(0, Number(process.env.X402_RING_AGENT_FLOAT_ATOMIC || 2_000_000));
	const floor = Math.max(0, Number(process.env.X402_RING_AGENT_FLOAT_FLOOR_ATOMIC || Math.floor(target / 2)));
	const ceiling = Math.max(target, Number(process.env.X402_RING_AGENT_FLOAT_CEIL_ATOMIC || target * 2));
	return { floorAtomic: floor, targetAtomic: target, ceilingAtomic: ceiling };
}

// ── Guarded purchase path ──────────────────────────────────────────────────────

/**
 * Is `address` inside the platform-controlled ring set? Accepts a pre-resolved
 * allowlist Set to avoid re-querying per purchase within a tick.
 * @param {string} address
 * @param {Set<string>} allowed
 * @returns {boolean}
 */
export function isRingAddress(address, allowed) {
	return typeof address === 'string' && allowed.has(address);
}

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
 * @returns {Promise<{ status:'paid'|'free'|'refused'|'error'|'skipped', persona:string, agentId:string,
 *   slug:string, kind:string, amountAtomic:number, txSig:string|null, payTo:string|null,
 *   reason:string|null, durationMs:number, responseLiveness:object }>}
 */
export async function executePurchase({ agent, purchase, solana, allowed, persona, remainingCap = Infinity }) {
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
		result = await payX402({
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

/** Compact liveness summary — keeps the log row small while proving a real reply. */
export function summarizeLiveness(body) {
	if (body == null) return { ok: false, shape: 'empty' };
	if (typeof body === 'string') return { ok: body.length > 0, shape: 'text', length: body.length };
	if (Array.isArray(body)) return { ok: body.length > 0, shape: 'array', length: body.length };
	if (typeof body === 'object') {
		const keys = Object.keys(body);
		return { ok: keys.length > 0 && !body.error, shape: 'object', keys: keys.slice(0, 10) };
	}
	return { ok: true, shape: typeof body };
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

/** Build a GET URL with query params, or return the path unchanged for POST. */
export function buildUrl(origin, path, query) {
	if (!query || Object.keys(query).length === 0) return `${origin}${path}`;
	const qs = new URLSearchParams(query).toString();
	const sep = path.includes('?') ? '&' : '?';
	return `${origin}${path}${sep}${qs}`;
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
