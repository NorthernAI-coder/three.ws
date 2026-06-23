// `pay_and_call` — pay an x402 endpoint in USDC from the local Solana wallet and
// return its result. EXECUTION tool: it moves real money.
//
// Guards before any payment: probe the 402 to read the Solana price, refuse if it
// exceeds max_usd or MAX_PAY_USD, and (when REQUIRE_CONFIRM is on) require an
// explicit confirm:true. Payment + settlement are done by the real @x402/* libs.

import { z } from 'zod';

import { buildPayingFetch, decodeSettlement, probeChallenge } from '../lib/x402-buyer.js';
import { MAX_PAY_USD, REQUIRE_CONFIRM, SOLANA_DEFAULT_SECRET } from '../config.js';

// Pull a USD price out of a Solana `accepts` entry. x402 prices are USDC atomic
// (6 decimals) unless already a "$x" string.
function solanaPriceUsd(accepts) {
	const solana = accepts.find((a) => String(a.network || '').startsWith('solana'));
	if (!solana) return { found: false };
	const raw = solana.price ?? solana.maxAmountRequired;
	if (raw == null) return { found: true, requirement: solana, usd: null };
	if (typeof raw === 'string' && raw.trim().startsWith('$')) {
		return { found: true, requirement: solana, usd: Number(raw.replace('$', '').trim()) };
	}
	const atomics = Number(raw);
	if (!Number.isFinite(atomics)) return { found: true, requirement: solana, usd: null };
	return { found: true, requirement: solana, usd: atomics / 1_000_000 };
}

export const def = {
	name: 'pay_and_call',
	title: 'Pay an x402 endpoint in USDC and return its result',
	// Moves real USDC — irreversible transfer.
	annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
	description:
		'Call a paid x402 endpoint and settle the USDC payment automatically from your Solana wallet (SOLANA_SECRET_KEY or a per-call `secret`), then return the result. Bounded by max_usd and the MAX_PAY_USD cap; refuses before any money moves if the price is over the cap. With REQUIRE_CONFIRM on (default), the call refuses until re-issued with confirm:true. Settles the Solana (solana:*) requirement via the `exact` scheme.',
	inputSchema: {
		url: z.string().url().describe('The x402 endpoint to pay and call.'),
		method: z.enum(['GET', 'POST']).default('GET').describe('HTTP method.'),
		body: z.record(z.any()).optional().describe('JSON body for POST requests.'),
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

		const price = solanaPriceUsd(probe.accepts);
		if (!price.found) {
			throw Object.assign(new Error('Endpoint has no Solana (solana:*) payment option this wallet can settle.'), {
				code: 'no_solana_requirement',
			});
		}
		const ceiling = Math.min(MAX_PAY_USD, args?.max_usd ?? Infinity);
		if (price.usd != null && price.usd > ceiling) {
			throw Object.assign(
				new Error(`Price $${price.usd} exceeds the cap $${ceiling}. Raise max_usd / MAX_PAY_USD to allow it.`),
				{ code: 'over_cap', price_usd: price.usd, cap_usd: ceiling },
			);
		}
		if (REQUIRE_CONFIRM && args?.confirm !== true) {
			return {
				ok: false,
				error: 'confirm_required',
				message: `This will spend up to $${price.usd ?? '?'} USDC on ${url}. Re-issue with confirm:true to proceed (or set REQUIRE_CONFIRM=0).`,
				price_usd: price.usd,
				url,
			};
		}

		const { payingFetch, address } = await buildPayingFetch(secret);
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
			price_usd: price.usd,
			settlement,
			result,
		};
	},
};
