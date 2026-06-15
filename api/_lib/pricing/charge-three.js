// charge-three — the one helper every paid surface uses to charge in $THREE.
//
// It wraps the token rail (api/_lib/token: issueQuote → verifyAndSettlePayment)
// so an endpoint never reimplements quoting or on-chain verification. Two phases:
//
//   1. CHARGE  — no payment yet → price the action from the catalog, issue a
//                signed $THREE quote, return { paid:false, quote }. The client
//                pays it (src/token-pay.js builds the multi-leg tx) and retries
//                with the quote token + tx signature.
//   2. SETTLE  — payment present → verify the on-chain tx satisfies the quote,
//                record it, return { paid:true, payment }. Only then does the
//                endpoint do the real (costly) work.
//
// FREE-FOREVER GUARDRAIL: a hard allowlist of growth surfaces that must NEVER be
// gated. requireThreePayment() refuses to gate any of them — a misconfiguration
// that tries to charge for one throws a loud developer error rather than quietly
// putting a paywall in front of the funnel.

import { issueQuote, verifyAndSettlePayment } from '../token/index.js';
import { catalogEntry, priceForAction, POLICY } from './catalog.js';

// Surfaces that are free forever (the growth funnel). These are NOT catalog
// actions — they have no price — but they're listed explicitly so the guardrail
// is self-documenting and a stray charge attempt fails fast and obviously.
export const FREE_SURFACES = Object.freeze(
	new Set([
		// Creation & configuration
		'agent.create',
		'agent.configure',
		// Discovery
		'marketplace.browse',
		'gallery.browse',
		'launches.feed',
		'community.browse',
		'agent.lookup',
		'visualizer.view',
		// Embedding
		'embed.web_component',
		'widget.studio',
		'examples.view',
		// Social
		'friends',
		'presence',
		'dm',
		'chat.free', // the free LLM tier (Groq / free-first)
		// Basic worlds (baseline access)
		'world.walk',
		'world.city',
		'world.communities',
		// Free generation lane (NVIDIA NIM draft) — the always-free draft tier
		'forge.draft',
		'mcp3d.generate.free',
		// Developer surfaces
		'docs',
		'tutorials',
		'sdk',
		'openapi',
		'status',
		'vanity.grinder',
		// Common (non-rare) names mint free; only rare names are auctioned.
		'name.common',
	]),
);

/** True when the surface is on the free-forever allowlist. */
export function isFreeSurface(surfaceId) {
	return FREE_SURFACES.has(surfaceId);
}

/**
 * Charge (or settle) a $THREE payment for a catalog action.
 *
 * @param {object} params
 * @param {string} params.action            a CATALOG key (api/_lib/pricing/catalog.js)
 * @param {object|null} [params.user]       the authenticated session user
 * @param {number} [params.usd]             per-call price for variable actions (usd:null in catalog)
 * @param {number} [params.discountBps]     holder-tier fee discount in bps (Lever 2 supplies this)
 * @param {string|null} [params.sellerWallet]  required for POLICY.MARKETPLACE actions
 * @param {string|null} [params.refType]    audit link (e.g. 'forge', 'skill')
 * @param {string|null} [params.refId]      audit id (e.g. the job / listing id)
 * @param {'mainnet'|'devnet'} [params.network]
 * @param {{ quoteToken?: string, txSignature?: string, payerWallet?: string }} [params.settle]
 *        when present with both fields, verifies + records the on-chain payment.
 * @returns {Promise<
 *   | { paid: false, quote: object }
 *   | { paid: true, payment: object }
 * >}
 */
export async function requireThreePayment({
	action,
	user = null,
	usd,
	discountBps = 0,
	sellerWallet = null,
	refType = null,
	refId = null,
	network = 'mainnet',
	settle = null,
}) {
	// Guardrail: never gate a free-forever surface, even by mistake.
	if (FREE_SURFACES.has(action)) {
		throw Object.assign(
			new Error(
				`[charge-three] refusing to gate "${action}" — it is on the free-forever allowlist. ` +
					'Free surfaces must never require payment.',
			),
			{ status: 500, code: 'free_surface_gated' },
		);
	}

	const entry = catalogEntry(action); // throws 404 unknown_action for non-catalog ids
	const priced = priceForAction(action, { usd, discountBps });
	const requiresSeller = entry.policy === POLICY.MARKETPLACE;
	if (requiresSeller && !sellerWallet) {
		throw Object.assign(new Error(`action ${action} requires a seller wallet`), {
			status: 400,
			code: 'seller_required',
		});
	}

	// ── SETTLE phase ────────────────────────────────────────────────────────────
	if (settle && settle.quoteToken && settle.txSignature) {
		const result = await verifyAndSettlePayment({
			quoteToken: settle.quoteToken,
			txSignature: settle.txSignature,
			payerWallet: settle.payerWallet ?? user?.wallet_address ?? null,
			userId: user?.id ?? null,
			network,
		});
		return { paid: true, payment: result };
	}

	// ── CHARGE phase ──────────────────────────────────────────────────────────────
	const { token, quote, expiresAt } = await issueQuote({
		purpose: action,
		usd: priced.usd,
		splitPolicy: priced.policy,
		sellerWallet,
		network,
		refType: refType ?? action,
		refId,
	});

	return {
		paid: false,
		quote: {
			quote_token: token,
			action,
			label: priced.label,
			category: priced.category,
			policy: priced.policy,
			network: quote.network,
			mint: quote.mint,
			symbol: quote.symbol,
			decimals: quote.decimals,
			usd: quote.usd,
			price_usd: quote.priceUsd,
			price_source: quote.priceSource,
			total_atomics: quote.total,
			legs: quote.legs,
			memo: quote.nonce,
			expires_at: expiresAt,
		},
	};
}
