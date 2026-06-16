// GET /api/pump/price-history?mint=<mint>&interval=15m&from=<unix>&to=<unix>
// --------------------------------------------------------------------------
// OHLCV proxy with automatic fallback chain:
//   1. Birdeye (paid, quota-limited)  — best data quality
//   2. GeckoTerminal (free, no key)   — pool lookup then candles
//
// On any upstream failure the next source is tried transparently.
// Never fabricates candles.
//
// Response: { data: [ { t, o, h, l, c, v } ], source?: 'birdeye'|'gecko' }

import { cors, json, method, wrap, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { fetchBirdeyeOhlcv, birdeyeConfigured } from '../_lib/birdeye.js';

const VALID_INTERVALS = new Set([
	'1m',
	'3m',
	'5m',
	'15m',
	'30m',
	'1H',
	'2H',
	'4H',
	'6H',
	'8H',
	'12H',
	'1D',
	'3D',
	'1W',
	'1M',
]);

// Birdeye uses uppercase hour/day codes (1H, 1D). Accept the common lowercase
// forms from the client and normalize so callers don't have to care.
function normalizeInterval(raw) {
	if (!raw) return '15m';
	const map = {
		'1h': '1H',
		'2h': '2H',
		'4h': '4H',
		'6h': '6H',
		'8h': '8H',
		'12h': '12H',
		'1d': '1D',
		'3d': '3D',
		'1w': '1W',
	};
	const v = map[raw] || raw;
	return VALID_INTERVALS.has(v) ? v : '15m';
}

function isPlausibleMint(s) {
	return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

// ──────────────────────────────────────────────────────────────────────────────
// GeckoTerminal fallback — completely free, no API key required.
// Step 1: resolve the top liquidity pool for the token.
// Step 2: fetch OHLCV for that pool.
// ──────────────────────────────────────────────────────────────────────────────
const GECKO_API = 'https://api.geckoterminal.com/api/v2';
const GECKO_HEADERS = { accept: 'application/json', 'x-api-version': '20230302' };

// Map our normalized Birdeye intervals to GeckoTerminal (timeframe, aggregate).
function geckoParams(interval) {
	const map = {
		'1m': ['minute', 1],
		'3m': ['minute', 3],
		'5m': ['minute', 5],
		'15m': ['minute', 15],
		'30m': ['minute', 30],
		'1H': ['hour', 1],
		'2H': ['hour', 2],
		'4H': ['hour', 4],
		'6H': ['hour', 6],
		'8H': ['hour', 8],
		'12H': ['hour', 12],
		'1D': ['day', 1],
		'3D': ['day', 3],
		'1W': ['day', 7],
		'1M': ['day', 30],
	};
	return map[interval] || ['minute', 15];
}

async function fetchGeckoPoolAddress(mint) {
	const url = `${GECKO_API}/networks/solana/tokens/${mint}/pools?page=1`;
	const resp = await fetch(url, { headers: GECKO_HEADERS, signal: AbortSignal.timeout(7000) });
	if (!resp.ok) return null;
	const body = await resp.json().catch(() => null);
	const pools = body?.data;
	if (!Array.isArray(pools) || !pools.length) return null;
	// Prefer the pool with the most volume (first = highest by GeckoTerminal default ranking).
	return pools[0]?.attributes?.address ?? null;
}

async function fetchGeckoOhlcv({ mint, interval, from, to }) {
	const poolAddress = await fetchGeckoPoolAddress(mint);
	if (!poolAddress) throw new Error('No pool found on GeckoTerminal for this mint');

	const [timeframe, aggregate] = geckoParams(interval);
	// GeckoTerminal returns candles *before* before_timestamp (exclusive, descending).
	// We ask for the maximum (1000) and filter to our window.
	const url =
		`${GECKO_API}/networks/solana/pools/${poolAddress}/ohlcv/${timeframe}` +
		`?aggregate=${aggregate}&before_timestamp=${to + 1}&limit=1000&currency=usd&token=base`;

	const resp = await fetch(url, { headers: GECKO_HEADERS, signal: AbortSignal.timeout(10_000) });
	if (!resp.ok) {
		throw new Error(`GeckoTerminal ${resp.status}`);
	}
	const body = await resp.json().catch(() => null);
	const list = body?.data?.attributes?.ohlcv_list;
	if (!Array.isArray(list)) throw new Error('GeckoTerminal returned unexpected payload');

	// Format: [timestamp_sec, open, high, low, close, volume] — GeckoTerminal returns
	// descending so we reverse and filter to the requested window.
	return list
		.map(([t, o, h, l, c, v]) => ({ t: Number(t), o: Number(o), h: Number(h), l: Number(l), c: Number(c), v: Number(v) }))
		.filter((d) => Number.isFinite(d.t) && Number.isFinite(d.c) && d.t >= from && d.t <= to)
		.sort((a, b) => a.t - b.t);
}

// ──────────────────────────────────────────────────────────────────────────────
// Cache — shared across both sources. Key includes interval + time window.
// ──────────────────────────────────────────────────────────────────────────────
const _cache = new Map(); // key → { value, source, expiresAt }
const TTL_MS = 30_000;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, 'http://x').searchParams;
	const mint = (params.get('mint') || '').trim();
	if (!isPlausibleMint(mint)) {
		return error(res, 400, 'bad_mint', 'mint must be a base58 Solana address (32–44 chars)');
	}
	const interval = normalizeInterval(params.get('interval'));

	const nowSec = Math.floor(Date.now() / 1000);
	const to = Math.min(nowSec, parseInt(params.get('to') || String(nowSec), 10) || nowSec);
	const defaultFrom = nowSec - 24 * 3600;
	let from = parseInt(params.get('from') || String(defaultFrom), 10);
	if (!Number.isFinite(from) || from <= 0 || from >= to) from = defaultFrom;
	if (to - from > 30 * 86400) from = to - 30 * 86400;

	const key = `${mint}:${interval}:${from}:${to}`;
	const now = Date.now();
	const hit = _cache.get(key);
	if (hit && hit.expiresAt > now) {
		return json(
			res,
			200,
			{ data: hit.value, source: hit.source },
			{ 'cache-control': 'public, max-age=15, s-maxage=30' },
		);
	}

	// ── Attempt 1: Birdeye ─────────────────────────────────────────────────────
	if (birdeyeConfigured()) {
		try {
			const data = await fetchBirdeyeOhlcv({ mint, interval, from, to });
			_cache.set(key, { value: data, source: 'birdeye', expiresAt: now + TTL_MS });
			if (_cache.size > 256) _cache.delete(_cache.keys().next().value);
			return json(res, 200, { data, source: 'birdeye' }, { 'cache-control': 'public, max-age=15, s-maxage=30' });
		} catch {
			// Fall through to GeckoTerminal.
		}
	}

	// ── Attempt 2: GeckoTerminal (free, no API key) ───────────────────────────
	try {
		const data = await fetchGeckoOhlcv({ mint, interval, from, to });
		_cache.set(key, { value: data, source: 'gecko', expiresAt: now + TTL_MS });
		if (_cache.size > 256) _cache.delete(_cache.keys().next().value);
		return json(res, 200, { data, source: 'gecko' }, { 'cache-control': 'public, max-age=15, s-maxage=30' });
	} catch {
		// Both sources exhausted.
	}

	return error(res, 502, 'upstream_error', 'Price history is unavailable for this coin right now');
});
