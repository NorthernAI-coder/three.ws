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

// Every pump.fun mint keypair is ground to end in the literal suffix "pump". A
// mint that does not end in "pump" (or that is a known settlement token) has no
// bonding curve and never will — so we can reject it without touching RPC.
function isPumpMint(mint) {
	return typeof mint === 'string' && mint.endsWith('pump') && !NON_CURVE_MINTS.has(mint);
}

async function jupiterPriceFallback(mint) {
	try {
		const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mint}`);
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
		return error(res, 404, 'no_curve', 'no bonding curve found for that mint');
	}

	// Graduated coins have no bonding-curve price. Fall back to Jupiter so callers
	// always get a usable price even after migration to a DEX.
	let pricePayload = result.price ? serializeBNs(result.price) : null;
	let graduatedPrice = null;
	if (!pricePayload && result.curve?.complete) {
		graduatedPrice = await jupiterPriceFallback(mint);
	}

	return json(
		res,
		200,
		{
			mint,
			network,
			curve: result.curve,
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
