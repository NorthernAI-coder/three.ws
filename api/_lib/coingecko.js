// Shared CoinGecko fetch for the global coin pages (/coins, /coin/:id).
//
// One place for the base URL, the optional demo API key, timeouts, and a small
// per-instance memory cache so the three read endpoints (api/coin/detail.js,
// api/coin/ohlc.js, api/coin/markets.js) don't each reimplement them. Works
// key-free; a COINGECKO_API_KEY (demo tier) lifts the public rate limit.
// CDN caching on the endpoints absorbs most traffic — this cache only shields
// the upstream from concurrent cold-instance misses.

export const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const _cache = new Map(); // key → { value, expiresAt }
const MAX_ENTRIES = 256;

function headers() {
	const h = { accept: 'application/json', 'user-agent': 'three.ws/1.0' };
	const key = (process.env.COINGECKO_API_KEY || '').trim();
	if (key) h['x-cg-demo-api-key'] = key;
	return h;
}

/**
 * GET a CoinGecko path (must start with '/'), JSON-parsed, memory-cached.
 * Throws an Error with .status = upstream HTTP status on a non-OK response so
 * callers can distinguish 404 (unknown coin) from 429/5xx (upstream trouble).
 */
export async function geckoFetch(path, { ttlMs = 60_000, timeoutMs = 8000 } = {}) {
	const now = Date.now();
	const hit = _cache.get(path);
	if (hit && hit.expiresAt > now) return hit.value;

	const resp = await fetch(`${COINGECKO_BASE}${path}`, {
		headers: headers(),
		signal: AbortSignal.timeout(timeoutMs),
	});
	if (!resp.ok) {
		const err = new Error(`CoinGecko ${resp.status} for ${path}`);
		err.status = resp.status;
		throw err;
	}
	const value = await resp.json();
	_cache.set(path, { value, expiresAt: now + ttlMs });
	if (_cache.size > MAX_ENTRIES) _cache.delete(_cache.keys().next().value);
	return value;
}

/** CoinGecko coin ids are lowercase slugs: letters, digits, hyphens (a few underscores). */
export function isPlausibleCoinId(s) {
	return typeof s === 'string' && /^[a-z0-9][a-z0-9_-]{0,99}$/.test(s);
}

/** Strip HTML to plain text: tags out, entities decoded, whitespace collapsed per paragraph. */
export function htmlToText(html) {
	if (!html || typeof html !== 'string') return '';
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
