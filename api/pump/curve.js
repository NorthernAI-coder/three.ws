// GET /api/pump/curve?mint=<mint>[&network=mainnet|devnet]
// ----------------------------------------------------------
// Public, read-only bonding-curve view. Combines @nirholas/pump-sdk reads via
// our RpcFallback + sdk-bridge helpers and returns:
//   - bonding curve raw state
//   - current price + market cap
//   - graduation progress
//
// Cached at the edge for 10s — the curve only changes per trade so a few
// seconds of staleness is acceptable and keeps RPC cost down on hot mints.

import { cors, json, method, wrap, error } from '../_lib/http.js';
import {
	rpcFallbackFromEnv,
	getBondingCurveState,
	getTokenPrice,
	getGraduationProgress,
} from '../_lib/solana/index.js';

// Mints that can never carry a pump.fun bonding curve. These are coin-agnostic
// payment-rail / native tokens, listed only so we can *exclude* them from curve
// lookups — never to promote them. (USDC mainnet+devnet, wrapped SOL.)
const NON_CURVE_MINTS = new Set([
	'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC (mainnet)
	'4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC (devnet)
	'So11111111111111111111111111111111111111112', // wrapped SOL
]);

// pump.fun mints a fixed total supply of exactly 1B tokens, the whole of which
// is sold through the curve and then seeded into the AMM pool on graduation. For
// these tokens fully-diluted value therefore equals market cap.
const PUMP_TOTAL_SUPPLY = 1_000_000_000;

// Every pump.fun mint keypair is ground to end in the literal suffix "pump". A
// mint that does not end in "pump" (or that is a known settlement token) has no
// bonding curve and never will — so we can reject it without touching RPC.
function isPumpMint(mint) {
	return typeof mint === 'string' && mint.endsWith('pump') && !NON_CURVE_MINTS.has(mint);
}

async function jupiterPriceFallback(mint) {
	try {
		const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mint}`, { signal: AbortSignal.timeout(6000) });
		if (!r.ok) return null;
		const data = await r.json();
		const usd = data?.[mint]?.usdPrice ?? data?.[mint]?.price;
		const n = Number(usd);
		return Number.isFinite(n) && n > 0 ? { priceUsd: n, source: 'jupiter' } : null;
	} catch {
		return null;
	}
}

function readMint(req) {
	try {
		const u = new URL(req.url, 'http://x');
		return {
			mint: (u.searchParams.get('mint') || '').trim(),
			network: u.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet',
		};
	} catch {
		return { mint: '', network: 'mainnet' };
	}
}

function isPlausibleMint(s) {
	return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const { mint, network } = readMint(req);
	if (!mint || !isPlausibleMint(mint)) {
		return error(res, 400, 'bad_mint', 'mint query param must be a base58 Solana address');
	}

	// Short-circuit mints that cannot have a bonding curve (settlement tokens,
	// non-"pump" mints) *before* any Solana RPC call. This kills the 404 + RPC-429
	// storm a misconfigured (e.g. USDC) widget mount would otherwise trigger: no
	// cold start, no RPC reads, no warning spam. The negative-cache header lets the
	// CDN edge serve repeat probes so the function isn't hit at all. The client's
	// existing stop-on-404 path fires on this exactly as it does for a real 404.
	if (!isPumpMint(mint)) {
		return json(
			res,
			404,
			{ error: 'not_a_pump_mint', error_description: 'mint has no pump.fun bonding curve' },
			{ 'cache-control': 'public, s-maxage=300, max-age=300' },
		);
	}

	const rpc = rpcFallbackFromEnv({ network });
	const result = await rpc.withFallback(async (connection) => {
		const [curve, price, grad] = await Promise.all([
			getBondingCurveState(connection, mint),
			getTokenPrice(connection, mint),
			getGraduationProgress(connection, mint),
		]);
		return { curve, price, graduation: grad };
	});

	if (!result.curve) {
		// No on-chain bonding curve account. Two cases to disambiguate:
		//   1. Graduated coin — the curve account is closed once a coin migrates
		//      to its AMM pool, but the token still trades with a live DEX price.
		//      Fall back to Jupiter and return a 200 "graduated" view so callers
		//      render the real price instead of a dead 404. (Our own $THREE lives
		//      here post-migration.)
		//   2. A mint that never had a curve — Jupiter has nothing either, so the
		//      404 stands and the client's stop-on-404 path fires as before.
		const graduatedPrice = await jupiterPriceFallback(mint);
		if (graduatedPrice) {
			// pump.fun mints a fixed 1B supply entirely into the curve/pool, so
			// fully-diluted value equals market cap. Compute it once here so every
			// consumer gets a meaningful market cap without re-deriving supply.
			const marketCapUsd = graduatedPrice.priceUsd * PUMP_TOTAL_SUPPLY;
			return json(
				res,
				200,
				{
					mint,
					network,
					curve: null,
					graduated: true,
					price: null,
					graduation: { isGraduated: true, progressBps: 10_000 },
					graduatedPrice: { ...graduatedPrice, marketCapUsd },
				},
				{ 'cache-control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=60' },
			);
		}
		return error(res, 404, 'no_curve', 'no bonding curve found for that mint');
	}

	// Graduated coins have no bonding-curve price. A coin can graduate yet leave
	// its on-chain curve account behind (closed, reserves zeroed, complete=true) —
	// this is exactly the case for our own $THREE. Fall back to Jupiter so callers
	// always get a usable price even after migration to a DEX, and surface the same
	// `graduated: true` + market-cap-enriched `graduatedPrice` shape as the
	// curve-gone path above so every consumer renders graduated coins identically.
	let pricePayload = result.price ? serializeBNs(result.price) : null;
	const curveComplete = Boolean(result.curve?.complete);
	let graduatedPrice = null;
	if (!pricePayload && curveComplete) {
		const jup = await jupiterPriceFallback(mint);
		if (jup) {
			// Fixed 1B supply minted entirely into the curve/pool ⇒ FDV == market cap.
			graduatedPrice = { ...jup, marketCapUsd: jup.priceUsd * PUMP_TOTAL_SUPPLY };
		}
	}

	return json(
		res,
		200,
		{
			mint,
			network,
			curve: result.curve,
			...(curveComplete ? { graduated: true } : {}),
			price: pricePayload,
			graduation: result.graduation ? serializeBNs(result.graduation) : null,
			...(graduatedPrice ? { graduatedPrice } : {}),
		},
		{ 'cache-control': 'public, max-age=5, s-maxage=10, stale-while-revalidate=30' },
	);
});

function serializeBNs(obj) {
	if (obj == null || typeof obj !== 'object') return obj;
	const out = Array.isArray(obj) ? [] : {};
	for (const [k, v] of Object.entries(obj)) {
		if (
			v &&
			typeof v === 'object' &&
			typeof v.toString === 'function' &&
			(v.constructor?.name === 'BN' || typeof v.toNumber === 'function')
		) {
			out[k] = v.toString();
		} else if (v && typeof v === 'object') {
			out[k] = serializeBNs(v);
		} else {
			out[k] = v;
		}
	}
	return out;
}
