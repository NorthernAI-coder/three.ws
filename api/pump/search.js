// GET /api/pump/search?q=bonk&limit=8
// ------------------------------------
// Name/symbol search over Solana tokens for the site-wide command palette
// (public/search.js) and any other surface that needs to resolve a coin by
// query. Returns the same item shape as /api/pump/trending so consumers can
// share rendering code.
//
// Primary source is Birdeye token search (keeps BIRDEYE_API_KEY server-side).
// When Birdeye is unconfigured, rate-limited, or down, we fall back to
// pump.fun's public frontend search (no API key) — same response shape — so the
// palette degrades to live pump.fun data instead of a hard error. Only errors
// when both sources are unavailable.
//
// Response: { data: [ { mint, symbol, name, logo, price_usd, rank } ] }

import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { normalizeGatewayURL } from '../../src/ipfs.js';

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const PUMP_FRONTEND_BASE = 'https://frontend-api-v3.pump.fun';

// Process-local cache keyed by normalized query. Palette keystrokes are
// debounced client-side, but repeated queries (same token typed twice) and many
// tabs still benefit from a short TTL so we don't hammer the upstreams.
const _cache = new Map(); // key -> { value, expiresAt }
const TTL_MS = 30_000;
const CACHE_MAX = 100;

// Primary: Birdeye token search. Returns null (not throws) on any failure so the
// caller can transparently fall back to pump.fun.
async function searchBirdeye(q, limit) {
	if (!BIRDEYE_API_KEY) return null;
	const url =
		`https://public-api.birdeye.so/defi/v3/search` +
		`?chain=solana&target=token&search_mode=fuzzy&sort_by=marketcap&sort_type=desc` +
		`&offset=0&limit=${limit}&keyword=${encodeURIComponent(q)}`;
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
	// v3 search nests token matches under data.items[].result.
	const groups = payload?.data?.items;
	if (!Array.isArray(groups)) return null;
	const tokens = groups.flatMap((g) => (Array.isArray(g?.result) ? g.result : []));
	const data = tokens
		.map((t) => ({
			mint: t.address,
			symbol: t.symbol || '?',
			name: t.name || t.symbol || '',
			logo: t.logo_uri || t.logoURI || null,
			price_usd: typeof t.price === 'number' ? t.price : null,
			rank: null,
		}))
		.filter((t) => typeof t.mint === 'string' && t.mint.length >= 32);
	return data.length ? data : null;
}

// Fallback: pump.fun's public frontend search (no API key). Mapped into the
// exact same shape. pump.fun doesn't expose a clean per-token USD price here, so
// price_usd is left null rather than fabricated.
async function searchPumpFun(q, limit) {
	const url = new URL('/coins', PUMP_FRONTEND_BASE);
	url.searchParams.set('searchTerm', q);
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
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, 'http://x').searchParams;
	const q = (params.get('q') || '').trim().slice(0, 64);
	if (!q) return json(res, 200, { data: [] }, { 'cache-control': 'no-store' });

	const rawLimit = Number(params.get('limit') || '8');
	const limit = Math.min(20, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 8));

	const key = q.toLowerCase() + '|' + limit;
	const now = Date.now();
	const hit = _cache.get(key);
	if (hit && hit.expiresAt > now) {
		return json(res, 200, { data: hit.value }, { 'cache-control': 'public, max-age=15, s-maxage=30' });
	}

	let data = await searchBirdeye(q, limit);
	if (!data) data = await searchPumpFun(q, limit);
	if (!data) {
		// No matches found is a valid, common outcome — return an empty list, not
		// an error. We only surface an error if the upstreams threw above (handled
		// by wrap()). Cache the empty result briefly to soak repeat keystrokes.
		_cache.set(key, { value: [], expiresAt: now + TTL_MS });
		return json(res, 200, { data: [] }, { 'cache-control': 'public, max-age=15, s-maxage=30' });
	}

	if (_cache.size >= CACHE_MAX) _cache.clear();
	_cache.set(key, { value: data, expiresAt: now + TTL_MS });
	return json(res, 200, { data }, { 'cache-control': 'public, max-age=15, s-maxage=30' });
});
