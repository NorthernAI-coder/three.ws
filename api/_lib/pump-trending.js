// Shared "trending tokens" fetch + cache — the thin
// { mint, symbol, name, logo, price_usd, rank } projection used by every free
// trending consumer: GET /api/pump/trending (home card, communities,
// constellation, dashboard chart picker) and the free GET /api/v1/pump/trending.
// One fetch+cache+fallback path, two doors.
//
// Primary source is Birdeye (BIRDEYE_API_KEY, kept server-side). When Birdeye is
// unconfigured, rate-limited, or down, falls back to pump.fun's public frontend
// feed — same shape — so consumers degrade to live pump.fun data instead of a
// hard error. A short-lived stale cache survives a brief outage on BOTH sources.

import { normalizeGatewayURL } from '../../src/ipfs.js';

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;
const PUMP_FRONTEND_BASE = 'https://frontend-api-v3.pump.fun';

// Process-local cache. Trending shifts slowly; many tabs polling on nav into the
// dashboard would otherwise hammer the upstreams. Warm-starts share this map.
// `storedAt` lets us serve the value as STALE (past its TTL) when every live
// upstream is down — a slowly-changing market feed is far better shown a few
// minutes old than blanked out with a 502 during an upstream blip.
let _cache = { value: null, storedAt: 0, expiresAt: 0, limit: 0 };
const TTL_MS = 30_000;
// How long a cached feed may be served as a stale fallback after every live
// upstream has failed. Bounds how old the market data can get during an outage.
const STALE_MAX_MS = 10 * 60_000;
// Upstream fetch timeout. Trending is a fast feed behind a 30s cache + stale
// fallback, so a long wait buys nothing — fail fast and fall through.
const UPSTREAM_TIMEOUT_MS = 5000;
// Birdeye circuit breaker: after a failure, skip Birdeye entirely for a cooldown
// so an influx during a Birdeye outage stops paying the per-request timeout on
// the way to the pump.fun fallback. Auto-recovers when the cooldown elapses.
const BIRDEYE_COOLDOWN_MS = 60_000;
let _birdeyeCooldownUntil = 0;

// Serve a cached feed past its TTL when live upstreams are down. Returns the
// sliced value if the slot holds enough items and is within the stale window,
// else null.
function serveStale(limit, now) {
	if (!_cache.value || _cache.limit < limit) return null;
	if (now - _cache.storedAt > STALE_MAX_MS) return null;
	return _cache.value.slice(0, limit);
}

// Primary: Birdeye trending feed. Returns null (not throws) on any failure so the
// caller can transparently fall back.
async function fetchBirdeye(limit) {
	if (!BIRDEYE_API_KEY) return null;
	// Circuit open: a recent Birdeye failure put it in cooldown — skip straight to
	// the fallback instead of paying the timeout again.
	if (Date.now() < _birdeyeCooldownUntil) return null;
	const url =
		`https://public-api.birdeye.so/defi/token_trending` +
		`?sort_by=rank&sort_type=asc&offset=0&limit=${limit}`;
	let upstream;
	try {
		upstream = await fetch(url, {
			headers: { 'X-API-KEY': BIRDEYE_API_KEY, 'x-chain': 'solana', accept: 'application/json' },
			signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
		});
	} catch {
		_birdeyeCooldownUntil = Date.now() + BIRDEYE_COOLDOWN_MS;
		return null;
	}
	if (!upstream.ok) {
		// 429 / 5xx — trip the breaker so the next requests skip the timeout.
		_birdeyeCooldownUntil = Date.now() + BIRDEYE_COOLDOWN_MS;
		return null;
	}
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
		upstream = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
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

/**
 * Get up to `limit` trending tokens (thin projection), cached 30s with a stale
 * fallback across a Birdeye→pump.fun failover.
 *
 * @param {number} limit
 * @returns {Promise<{ data: object[]|null, stale: boolean }>}
 *   `data: null` only when both live sources are down AND no usable stale cache
 *   exists — callers translate that into their own 502/503 envelope.
 */
export async function getTrendingSlim(limit) {
	const now = Date.now();
	if (_cache.value && _cache.limit >= limit && _cache.expiresAt > now) {
		return { data: _cache.value.slice(0, limit), stale: false };
	}

	let data = await fetchBirdeye(limit);
	if (!data) data = await fetchPumpFun(limit);
	if (!data) {
		const stale = serveStale(limit, now);
		if (stale) return { data: stale, stale: true };
		return { data: null, stale: false };
	}

	_cache = { value: data, storedAt: now, expiresAt: now + TTL_MS, limit };
	return { data, stale: false };
}
