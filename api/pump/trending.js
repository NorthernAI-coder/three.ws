// GET /api/pump/trending?limit=25
// -------------------------------
// Trending Solana tokens for the dashboard chart picker and every other live
// market surface (home card, communities, constellation, visualizer).
//
// Primary source is Birdeye (keeps BIRDEYE_API_KEY server-side). When Birdeye is
// unconfigured, rate-limited, or down, we fall back to pump.fun's public frontend
// feed — same response shape — so the market surfaces degrade to live pump.fun
// data instead of a hard error. Only errors when both sources are unavailable.
//
// Response: { data: [ { mint, symbol, name, logo, price_usd, rank } ] }

import { cors, json, method, wrap, error } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { normalizeGatewayURL } from '../../src/ipfs.js';

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const PUMP_FRONTEND_BASE = 'https://frontend-api-v3.pump.fun';

// Process-local cache. Trending shifts slowly; many tabs polling on nav into the
// dashboard would otherwise hammer the upstreams. Warm-starts share this map.
let _cache = { value: null, expiresAt: 0, limit: 0 };
const TTL_MS = 30_000;

// Primary: Birdeye trending feed. Returns null (not throws) on any failure so the
// caller can transparently fall back.
async function fetchBirdeye(limit) {
	if (!BIRDEYE_API_KEY) return null;
	const url =
		`https://public-api.birdeye.so/defi/token_trending` +
		`?sort_by=rank&sort_type=asc&offset=0&limit=${limit}`;
	let upstream;
	try {
		upstream = await fetch(url, {
			headers: { 'X-API-KEY': BIRDEYE_API_KEY, 'x-chain': 'solana', accept: 'application/json' },
			signal: AbortSignal.timeout(8000),
		});
	} catch {
		return null;
	}
	if (!upstream.ok) return null;
	const payload = await upstream.json().catch(() => null);
	const tokens = payload?.data?.tokens;
	if (!Array.isArray(tokens)) return null;
	const data = tokens
		.map((t) => ({
			mint: t.address,
			symbol: t.symbol || '?',
			name: t.name || t.symbol || '',
			logo: t.logoURI || null,
			price_usd: typeof t.price === 'number' ? t.price : null,
			rank: typeof t.rank === 'number' ? t.rank : null,
		}))
		.filter((t) => typeof t.mint === 'string' && t.mint.length >= 32);
	return data.length ? data : null;
}

// Fallback: pump.fun's public frontend feed (no API key). Mapped into the exact
// same shape so every consumer keeps working. pump.fun doesn't expose a clean
// per-token USD price here, so price_usd is left null rather than fabricated.
async function fetchPumpFun(limit) {
	const url = new URL('/coins', PUMP_FRONTEND_BASE);
	url.searchParams.set('offset', '0');
	url.searchParams.set('limit', String(limit));
	url.searchParams.set('sort', 'market_cap');
	url.searchParams.set('order', 'DESC');
	url.searchParams.set('includeNsfw', 'false');
	let upstream;
	try {
		upstream = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
	} catch {
		return null;
	}
	if (!upstream.ok) return null;
	const body = await upstream.json().catch(() => null);
	const coins = Array.isArray(body) ? body : Array.isArray(body?.coins) ? body.coins : null;
	if (!Array.isArray(coins)) return null;
	const data = coins
		.map((c, i) => ({
			mint: c.mint || c.address || '',
			symbol: c.symbol || '?',
			name: c.name || c.symbol || '',
			logo: normalizeGatewayURL(c.image_uri || c.image || '') || null,
			price_usd: null,
			rank: i + 1,
		}))
		.filter((t) => typeof t.mint === 'string' && t.mint.length >= 32);
	return data.length ? data : null;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return error(res, 429, 'rate_limited', 'too many requests');

	const raw = Number(new URL(req.url, 'http://x').searchParams.get('limit') || '25');
	const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 25));

	const now = Date.now();
	if (_cache.value && _cache.limit >= limit && _cache.expiresAt > now) {
		return json(res, 200, { data: _cache.value.slice(0, limit) }, {
			'cache-control': 'public, max-age=15, s-maxage=30',
		});
	}

	let data = await fetchBirdeye(limit);
	if (!data) data = await fetchPumpFun(limit);
	if (!data) {
		return error(res, 502, 'upstream_error', 'Trending market data is temporarily unavailable');
	}

	_cache = { value: data, expiresAt: now + TTL_MS, limit };
	return json(res, 200, { data }, { 'cache-control': 'public, max-age=15, s-maxage=30' });
});
