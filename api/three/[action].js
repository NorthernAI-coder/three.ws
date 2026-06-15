// $THREE pay-per-use rail — the canonical HTTP surface every paid compute action
// charges through. One endpoint, one currency.
//
//   GET  /api/three/catalog   — public price list (display)
//   POST /api/three/charge    — issue a $THREE quote, or settle a paid one (auth)
//   GET  /api/three/tier      — the signed-in holder's $THREE tier + perks (auth)
//   POST /api/three/tier-pass — mint a signed tier pass for world gating (auth)
//   GET  /api/three/earnings  — creator's settled $THREE earnings ledger (auth)
//   GET  /api/three/name-quote?name=… — rarity + $THREE floor price for a name
//
// The charge → settle handshake reuses api/_lib/pricing/charge-three.js, which
// wraps the token rail (quote → on-chain verify → settle). No action burns; every
// spend routes to treasury + the holder-rewards pool per its split policy.
//
// Lever-1 surfaces (Forge standard/high, voice clone, MCP-3D tools, Granite,
// selfie→avatar) are all catalog actions, so they charge through this one path.
// The always-free lanes (NVIDIA draft, free LLM chat, discovery, social) are on
// the free-forever allowlist and never reach here.

import { z } from 'zod';
import { getSessionUser } from '../_lib/auth.js';
import { cors, error, json, method, readJson, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { parse } from '../_lib/validate.js';
import { publicCatalog } from '../_lib/pricing/catalog.js';
import { requireThreePayment } from '../_lib/pricing/charge-three.js';
import { holderDiscountBps, resolveUserTier, signTierPass, TIERS } from '../_lib/three-tier.js';
import { creatorEarnings, economyStats } from '../_lib/token/index.js';
import { priceName, isValidLabel, RARITY_TIERS } from '../_lib/pricing/name-rarity.js';
import { quoteTokenForUsd } from '../_lib/token/price.js';
import { publicConfig } from '../_lib/token/config.js';

const SOLANA_ADDRESS = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'invalid Solana address');

// ── GET /api/three/catalog ─────────────────────────────────────────────────────

async function handleCatalog(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;
	const rl = await limits.tokenPriceIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);
	return json(res, 200, { actions: publicCatalog() });
}

// ── POST /api/three/charge ───────────────────────────────────────────────────────

const chargeSchema = z.object({
	action: z.string().min(1).max(64),
	// Per-call price for variable actions (auctions, marketplace listings). Ignored
	// for fixed-price catalog actions.
	usd: z.number().positive().optional(),
	seller_wallet: SOLANA_ADDRESS.optional(),
	ref_type: z.string().max(64).optional(),
	ref_id: z.string().max(128).optional(),
	network: z.enum(['mainnet', 'devnet']).default('mainnet'),
	// Present together to SETTLE a previously-issued quote.
	quote_token: z.string().min(40).optional(),
	tx_signature: z.string().min(80).max(100).optional(),
	payer_wallet: SOLANA_ADDRESS.optional(),
});

async function handleCharge(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const user = await getSessionUser(req, res);
	if (!user) return error(res, 401, 'unauthorized', 'sign in required');

	const body = parse(chargeSchema, await readJson(req));
	const settling = Boolean(body.quote_token && body.tx_signature);

	// Reuse the token-rail limiters: settle is the money-moving, on-chain-verifying
	// call (tight, fail-closed); charge issues a signed quote (slightly looser).
	const rl = settling ? await limits.tokenSettle(user.id) : await limits.tokenQuote(user.id);
	if (!rl.success) return rateLimited(res, rl);

	// Holder-tier fee discount (Lever 2): higher $THREE holders pay less on
	// fixed-price compute. Resolved from the user's on-chain balance; degrades to
	// no discount (full price) if the balance can't be priced — never blocks a charge.
	const discountBps = settling ? 0 : await holderDiscountBps(user);

	const result = await requireThreePayment({
		action: body.action,
		user,
		usd: body.usd,
		discountBps,
		sellerWallet: body.seller_wallet ?? null,
		refType: body.ref_type ?? null,
		refId: body.ref_id ?? null,
		network: body.network,
		settle: settling
			? {
					quoteToken: body.quote_token,
					txSignature: body.tx_signature,
					payerWallet: body.payer_wallet ?? user.wallet_address ?? null,
				}
			: null,
	});

	return json(res, result.paid ? 200 : 201, result);
}

// ── GET /api/three/tier ────────────────────────────────────────────────────────

async function handleTier(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;
	const user = await getSessionUser(req, res);
	if (!user) return error(res, 401, 'unauthorized', 'sign in required');

	const { tier, usd, amount, priceUsd, next } = await resolveUserTier(user);
	return json(res, 200, {
		tier: { level: tier.level, id: tier.id, label: tier.label, discount_bps: tier.discountBps, perks: tier.perks },
		held_usd: usd,
		held_amount: amount,
		price_usd: priceUsd,
		next: next
			? { id: next.id, label: next.label, min_usd: next.minUsd, usd_to_go: Math.max(0, next.minUsd - usd) }
			: null,
		// The full ladder so the UI can render thresholds and what each tier unlocks.
		ladder: TIERS.map((t) => ({
			level: t.level,
			id: t.id,
			label: t.label,
			min_usd: t.minUsd,
			discount_bps: t.discountBps,
			rate_multiplier: t.rateMultiplier,
			perks: t.perks,
		})),
	});
}

// ── POST /api/three/tier-pass ─────────────────────────────────────────────────────

async function handleTierPass(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;
	const user = await getSessionUser(req, res);
	if (!user) return error(res, 401, 'unauthorized', 'sign in required');
	if (!user.wallet_address) {
		return error(res, 403, 'wallet_required', 'link a Solana wallet to mint a tier pass');
	}

	const { tier, usd } = await resolveUserTier(user);
	const pass = signTierPass({ wallet: user.wallet_address, level: tier.level, tierId: tier.id, usd });
	return json(res, 201, {
		pass,
		tier: { level: tier.level, id: tier.id, label: tier.label },
		held_usd: usd,
	});
}

// ── GET /api/three/earnings ────────────────────────────────────────────────────

async function handleEarnings(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;
	const user = await getSessionUser(req, res);
	if (!user) return error(res, 401, 'unauthorized', 'sign in required');
	if (!user.wallet_address) {
		return json(res, 200, { total_atomics: '0', sale_count: 0, mint: null, decimals: null, items: [], next_cursor: null });
	}
	const url = new URL(req.url, 'http://x');
	const page = await creatorEarnings({
		sellerWallet: user.wallet_address,
		limit: Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200),
		before: url.searchParams.get('before') || null,
	});
	return json(res, 200, page);
}

// ── GET /api/three/name-quote ──────────────────────────────────────────────────

async function handleNameQuote(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;
	const rl = await limits.tokenPriceIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const name = url.searchParams.get('name') || '';
	if (!isValidLabel(name)) {
		return error(res, 400, 'invalid_label', 'name must be a valid SNS label (a-z, 0-9, hyphen)');
	}
	const priced = priceName(name);
	// Common names are free; only quote $THREE for paid (rare) names.
	let three = null;
	if (!priced.free) {
		const q = await quoteTokenForUsd(priced.usd);
		three = { token_amount: q.tokenAmount, atomics: q.atomics.toString(), price_usd: q.priceUsd ?? null };
	}
	return json(res, 200, {
		...priced,
		full_name: `${priced.label}.threews.sol`,
		three,
		// The full rarity ladder so the UI can show where this name sits.
		ladder: RARITY_TIERS,
	});
}

// ── GET /api/three/stats ───────────────────────────────────────────────────────
// Public economy dashboard data: settled volume + the per-role flow (treasury,
// rewards, seller) over a window. Powers the /three economy page and /three-live.

async function handleStats(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;
	const rl = await limits.tokenPriceIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const sinceDays = url.searchParams.get('since_days');
	const stats = await economyStats({ sinceDays: sinceDays != null ? Number(sinceDays) : null });
	const cfg = publicConfig();
	return json(res, 200, {
		...stats,
		token: { mint: cfg.mint, symbol: cfg.symbol, decimals: cfg.decimals },
		treasury_configured: cfg.treasury_configured,
		rewards_configured: cfg.rewards_configured,
		// Make the no-burn policy explicit in the public data so the dashboard can
		// state it plainly: every spend reflects to holders / funds the treasury.
		burns: false,
	});
}

// ── dispatcher ────────────────────────────────────────────────────────────────────

const DISPATCH = {
	catalog: handleCatalog,
	charge: handleCharge,
	tier: handleTier,
	'tier-pass': handleTierPass,
	earnings: handleEarnings,
	'name-quote': handleNameQuote,
	stats: handleStats,
};

export default wrap(async (req, res) => {
	const action = req.query?.action ?? new URL(req.url, 'http://x').pathname.split('/').pop();
	const fn = DISPATCH[action];
	if (!fn) return error(res, 404, 'not_found', `unknown three action: ${action}`);
	return fn(req, res);
});
