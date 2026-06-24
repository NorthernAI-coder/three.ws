// `pay_and_call` — pay an x402 endpoint in USDC from the local Solana wallet and
// return its result. EXECUTION tool: it moves real money.
//
// Guards before any payment: probe the 402 to read the Solana price, refuse if it
// exceeds max_usd or MAX_PAY_USD, and (when REQUIRE_CONFIRM is on) require an
// explicit confirm:true. Payment + settlement are done by the real @x402/* libs.

import { z } from 'zod';

import { buildPayingFetch, decodeSettlement, probeChallenge, isThreeAccept, isUsdcAccept } from '../lib/x402-buyer.js';
import { MAX_PAY_USD, REQUIRE_CONFIRM, SOLANA_DEFAULT_SECRET } from '../config.js';

// Split a challenge's Solana accepts into the two main assets so we can price
// and pay in the caller's chosen token.
function pickSolanaAccepts(accepts) {
	const sol = (Array.isArray(accepts) ? accepts : []).filter((a) => String(a.network || '').startsWith('solana'));
	return { sol, usdc: sol.find(isUsdcAccept) || null, three: sol.find(isThreeAccept) || null };
}

// USD value of a USDC accept (6-decimal atomic, or a "$x" string). Returns null
// when unknown — $THREE accepts have no USD price (their amount is a token count).
function usdFromAccept(a) {
	if (!a) return null;
	const raw = a.price ?? a.maxAmountRequired ?? a.amount;
	if (raw == null) return null;
	if (typeof raw === 'string' && raw.trim().startsWith('$')) return Number(raw.replace('$', '').trim());
	const atomics = Number(raw);
	return Number.isFinite(atomics) ? atomics / 1_000_000 : null;
}

export const def = {
	name: 'pay_and_call',
	title: 'Pay an x402 endpoint in USDC or $THREE and return its result',
	// Moves real funds — irreversible transfer.
	annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
	description:
		'Call a paid x402 endpoint and settle the payment automatically from your Solana wallet (SOLANA_SECRET_KEY or a per-call `secret`), then return the result. Pay in USDC (default) or, when the endpoint advertises it, in $THREE — set token:"three". Bounded by max_usd and the MAX_PAY_USD cap (priced off the endpoint\'s USDC quote); refuses before any money moves if the price is over the cap. With REQUIRE_CONFIRM on (default), the call refuses until re-issued with confirm:true. Settles the Solana (solana:*) requirement via the `exact` scheme.',
	inputSchema: {
		url: z.string().url().describe('The x402 endpoint to pay and call.'),
		method: z.enum(['GET', 'POST']).default('GET').describe('HTTP method.'),
		body: z.record(z.any()).optional().describe('JSON body for POST requests.'),
		token: z
			.enum(['usdc', 'three'])
			.default('usdc')
			.describe('Settlement token. "usdc" (default) or "three" — the $THREE platform token; the endpoint must advertise it.'),
		max_usd: z
			.number()
			.positive()
			.optional()
			.describe('Hard ceiling for THIS call in USD. Can only lower the MAX_PAY_USD cap, never raise it.'),
		secret: z.string().optional().describe('Per-call base58 signer override (defaults to SOLANA_SECRET_KEY).'),
		confirm: z.boolean().optional().describe('Must be true to execute when REQUIRE_CONFIRM is on.'),
	},
	async handler(args) {
		const url = String(args?.url ?? '').trim();
		const method = args?.method === 'POST' ? 'POST' : 'GET';
		const secret = args?.secret || SOLANA_DEFAULT_SECRET;
		if (!secret) {
			throw Object.assign(new Error('No signer configured. Set SOLANA_SECRET_KEY or pass `secret`.'), {
				code: 'no_signer',
			});
		}

		// Probe first so we never pay blind and can enforce the cap pre-payment.
		const probe = await probeChallenge(url, { method, body: args?.body });
		if (!probe.paid) {
			return {
				ok: true,
				paid: false,
				url,
				note: 'Endpoint is not paywalled — called directly, no payment needed.',
				status: probe.status,
				result: probe.result,
			};
		}

		const token = args?.token === 'three' ? 'three' : 'usdc';
		const { sol, usdc, three } = pickSolanaAccepts(probe.accepts);
		if (!sol.length) {
			throw Object.assign(new Error('Endpoint has no Solana (solana:*) payment option this wallet can settle.'), {
				code: 'no_solana_requirement',
			});
		}
		if (token === 'three' && !three) {
			throw Object.assign(new Error('Endpoint does not advertise a $THREE payment option — retry with token:"usdc".'), {
				code: 'three_not_offered',
			});
		}
		// Cap is always priced off the USDC quote (the dollar value); $THREE amounts
		// are token counts, not USD. If only $THREE is offered, the USD price is
		// unknown and the cap can't bind — confirm:true is then the only gate.
		const priceUsd = usdFromAccept(usdc);
		const ceiling = Math.min(MAX_PAY_USD, args?.max_usd ?? Infinity);
		if (priceUsd != null && priceUsd > ceiling) {
			throw Object.assign(
				new Error(`Price $${priceUsd} exceeds the cap $${ceiling}. Raise max_usd / MAX_PAY_USD to allow it.`),
				{ code: 'over_cap', price_usd: priceUsd, cap_usd: ceiling },
			);
		}
		const threeAmount = token === 'three' ? String(three.amount ?? three.maxAmountRequired ?? three.price ?? '') : null;
		const spendLabel = token === 'three' ? `${threeAmount} atomic $THREE` : `$${priceUsd ?? '?'} USDC`;
		if (REQUIRE_CONFIRM && args?.confirm !== true) {
			return {
				ok: false,
				error: 'confirm_required',
				message: `This will spend up to ${spendLabel} on ${url}. Re-issue with confirm:true to proceed (or set REQUIRE_CONFIRM=0).`,
				token,
				price_usd: priceUsd,
				...(threeAmount ? { three_amount: threeAmount } : {}),
				url,
			};
		}

		const { payingFetch, address } = await buildPayingFetch(secret, { preferToken: token });
		const init = {
			method,
			headers: { accept: 'application/json', ...(args?.body !== undefined ? { 'content-type': 'application/json' } : {}) },
			body: args?.body !== undefined ? JSON.stringify(args.body) : undefined,
		};
		const res = await payingFetch(url, init);
		const text = await res.text();
		let result;
		try {
			result = text ? JSON.parse(text) : null;
		} catch {
			result = text;
		}
		if (!res.ok) {
			throw Object.assign(new Error(`Paid call to ${url} returned HTTP ${res.status}`), {
				code: 'call_failed',
				status: res.status,
				body: result,
			});
		}
		const settlement = await decodeSettlement(res);
		return {
			ok: true,
			paid: true,
			url,
			payer: address,
			token,
			price_usd: priceUsd,
			...(threeAmount ? { three_amount: threeAmount } : {}),
			settlement,
			result,
		};
	},
};
