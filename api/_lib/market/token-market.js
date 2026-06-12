// Multi-source token market data with sequential failover + stale cache.
//
// Sources, in priority order:
//   1. Birdeye (keyed) — richest: includes holders + circulating supply.
//   2. DexScreener (keyless) — price, 24h change, volume, liquidity, market cap.
//   3. GeckoTerminal (keyless) — price, market cap, volume, liquidity, supply.
//
// Each source is normalized to one shape; a fallback source that lacks a field
// (e.g. DexScreener has no holder count) leaves it null rather than failing the
// whole read. On a cold cache where every source is down/rate-limited we return
// the last good value for up to STALE_MAX_MS, then null — callers render what
// they can and never crash on a single upstream blip. This is the market-data
// analogue of the RPC failover layer.

const BIRDEYE_BASE = 'https://public-api.birdeye.so';
const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex/tokens';
const GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2/networks/solana/tokens';

const FETCH_TIMEOUT_MS = 6000;
const DEFAULT_TTL_MS = 30_000;
const STALE_MAX_MS = 5 * 60_000;

const _cache = new Map(); // mint → { value, expires, fetchedAt }
const _warnedAt = new Map();
const WARN_COOLDOWN_MS = 60_000;

// Circuit breaker: when a source reports an exhausted quota (Birdeye's monthly
// compute units) or rate-limits us, stop hitting it for a while instead of
// burning a doomed upstream call + warning on every read. Quota exhaustion
// only clears on the provider's billing cycle, so it gets a long cooldown.
const _sourceCooldown = new Map(); // source name → epoch ms to skip until
const QUOTA_COOLDOWN_MS = 6 * 3_600_000;
const RATE_LIMIT_COOLDOWN_MS = 10 * 60_000;

function cooldownFor(err) {
	const msg = String(err?.message || '');
	if (/usage limit exceeded|quota exceeded/i.test(msg)) return QUOTA_COOLDOWN_MS;
	if (/^429\b|rate ?limit/i.test(msg)) return RATE_LIMIT_COOLDOWN_MS;
	return 0;
}

function warnThrottled(key, msg) {
	const now = Date.now();
	if (now - (_warnedAt.get(key) || 0) < WARN_COOLDOWN_MS) return;
	_warnedAt.set(key, now);
	console.warn(msg);
}

async function fetchJson(url, opts = {}) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		const r = await fetch(url, { ...opts, signal: ctrl.signal });
		if (!r.ok) {
			const body = (await r.text().catch(() => '')).slice(0, 200);
			throw new Error(body ? `${r.status} ${body}` : `${r.status}`);
		}
		return await r.json();
	} finally {
		clearTimeout(timer);
	}
}

function shape(partial, source) {
	return {
		price_usd: null,
		price_change_24h: null,
		market_cap: null,
		volume_24h: null,
		holders: null,
		liquidity: null,
		supply: null,
		decimals: 6,
		source,
		...partial,
	};
}

const num = (v) => {
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

async function fromBirdeye(mint) {
	const key = process.env.BIRDEYE_API_KEY;
	if (!key) return null;
	// Birdeye requires the x-chain header; omitting it is a 400, not a default.
	const data = await fetchJson(`${BIRDEYE_BASE}/defi/token_overview?address=${mint}`, {
		headers: { 'X-API-KEY': key, 'x-chain': 'solana', accept: 'application/json' },
	});
	const ov = data?.data;
	if (!ov || !(num(ov.price) > 0)) return null;
	return shape(
		{
			price_usd: num(ov.price),
			price_change_24h: num(ov.priceChange24hPercent),
			market_cap: num(ov.mc ?? ov.marketCap),
			volume_24h: num(ov.v24hUSD ?? ov.volume24h),
			holders: num(ov.holder ?? ov.uniqueWallet30m),
			liquidity: num(ov.liquidity),
			supply: num(ov.supply),
			decimals: num(ov.decimals) ?? 6,
		},
		'birdeye',
	);
}

async function fromDexScreener(mint) {
	const data = await fetchJson(`${DEXSCREENER_BASE}/${mint}`);
	const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
	if (!pairs.length) return null;
	// The deepest-liquidity pair is the canonical market for price/volume.
	const best = pairs.reduce((a, b) => ((b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a));
	const price = num(best.priceUsd);
	if (!(price > 0)) return null;
	const marketCap = num(best.marketCap ?? best.fdv);
	return shape(
		{
			price_usd: price,
			price_change_24h: num(best.priceChange?.h24),
			market_cap: marketCap,
			volume_24h: num(best.volume?.h24),
			liquidity: num(best.liquidity?.usd),
			// supply ≈ marketCap / price when the source omits it explicitly
			supply: marketCap && price ? marketCap / price : null,
		},
		'dexscreener',
	);
}

async function fromGeckoTerminal(mint) {
	const data = await fetchJson(`${GECKOTERMINAL_BASE}/${mint}`);
	const a = data?.data?.attributes;
	const price = num(a?.price_usd);
	if (!(price > 0)) return null;
	const decimals = num(a.decimals) ?? 6;
	const totalSupplyAtomic = num(a.total_supply);
	return shape(
		{
			price_usd: price,
			market_cap: num(a.market_cap_usd) ?? num(a.fdv_usd),
			volume_24h: num(a.volume_usd?.h24),
			liquidity: num(a.total_reserve_in_usd),
			supply: totalSupplyAtomic != null ? totalSupplyAtomic / 10 ** decimals : null,
			decimals,
		},
		'geckoterminal',
	);
}

const SOURCES = [fromBirdeye, fromDexScreener, fromGeckoTerminal];

/**
 * Normalized market data for a mint, with multi-source failover and a stale
 * cache. Returns null only when every source fails and no recent value exists.
 * @param {string} mint
 * @param {{ fresh?: boolean, ttlMs?: number }} [opts]
 */
export async function fetchTokenMarketData(mint, { fresh = false, ttlMs = DEFAULT_TTL_MS } = {}) {
	const now = Date.now();
	const hit = _cache.get(mint);
	if (!fresh && hit && hit.expires > now) return hit.value;

	for (const src of SOURCES) {
		if ((_sourceCooldown.get(src.name) || 0) > now) continue;
		try {
			const result = await src(mint);
			if (result && result.price_usd > 0) {
				_cache.set(mint, { value: result, expires: now + ttlMs, fetchedAt: now });
				if (_cache.size > 256) _cache.delete(_cache.keys().next().value);
				return result;
			}
		} catch (err) {
			const cooldown = cooldownFor(err);
			if (cooldown) {
				_sourceCooldown.set(src.name, now + cooldown);
				warnThrottled(`${src.name}:cooldown`, `[market] ${src.name} quota/rate-limited — skipping it for ${Math.round(cooldown / 60_000)}min: ${err?.message}`);
			} else {
				warnThrottled(`${mint}:${src.name}`, `[market] ${src.name} failed for ${mint.slice(0, 6)}…: ${err?.message}`);
			}
		}
	}

	// Every source failed — serve the last good value if it's still fresh enough.
	if (hit && now - hit.fetchedAt < STALE_MAX_MS) {
		warnThrottled(`${mint}:stale`, `[market] all sources failed for ${mint.slice(0, 6)}… — serving stale (${Math.round((now - hit.fetchedAt) / 1000)}s old)`);
		hit.expires = now + Math.min(ttlMs, 15_000); // brief backoff before retrying upstreams
		return hit.value;
	}
	return null;
}

/** Just the USD price — convenience for the price/quote path. */
export async function fetchTokenPriceUsd(mint, opts) {
	const md = await fetchTokenMarketData(mint, opts);
	return md?.price_usd ?? null;
}

/** Test seam: clear the in-memory caches between cases. */
export function __resetMarketCache() {
	_cache.clear();
	_warnedAt.clear();
	_sourceCooldown.clear();
}
