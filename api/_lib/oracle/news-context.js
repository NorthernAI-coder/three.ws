// Oracle — live news context from cryptocurrency.cv.
//
// Fetches a window of recent crypto headlines (no API key required — public
// endpoint) and matches them against a coin's name/symbol/tags. When a coin is
// clearly riding a live headline, the narrative classifier gets that context in
// the LLM prompt so it can write a precise thesis ("rides today's Trump tariff
// announcement") instead of guessing. The virality boost applied here is REAL
// signal: a coin whose ticker appears in a trending headline right now has
// genuine attention behind it.
//
// Two tiers:
//   1. fetchRelevantHeadlines(meta)  — fetch + filter in one call. Returns the
//      top 3 matching headlines (or [] if none). Used by classifyNarrative().
//   2. fetchTrending()               — the raw trending topics; used by the cron
//      to pre-warm the headline cache before a scoring batch.
//
// Both degrade gracefully: network failure, bad JSON, or any exception returns
// the safe fallback so the narrative pipeline never stalls.

const BASE = 'https://cryptocurrency.cv';
const CACHE_TTL_MS = 90_000; // 90s — fresh enough for live news, lenient on rate limits

/** Module-level news cache so one Vercel invocation shares it across coin scorings. */
const _cache = { headlines: null, trending: null, fetchedAt: 0 };

async function fetchWithTimeout(url, ms = 5000) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	try {
		const res = await fetch(url, {
			signal: ctrl.signal,
			headers: { 'User-Agent': 'three.ws-oracle/1.0' },
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Fetch recent headlines from cryptocurrency.cv, filtered to categories most
 * relevant to pump.fun launches. Returns array of { title, category, published_at }
 * or [] on failure. Results cached for CACHE_TTL_MS.
 */
async function fetchHeadlines() {
	const now = Date.now();
	if (_cache.headlines && now - _cache.fetchedAt < CACHE_TTL_MS) return _cache.headlines;

	// Parallel fetch of the most relevant categories for pump.fun culture.
	const cats = ['general', 'solana', 'bitcoin', 'defi', 'altl1'];
	const results = await Promise.allSettled(
		cats.map((cat) =>
			fetchWithTimeout(`${BASE}/api/news?category=${cat}&limit=20&quality=any`, 5000),
		),
	);

	const headlines = [];
	const seen = new Set();
	for (const r of results) {
		if (r.status !== 'fulfilled' || !r.value) continue;
		const items = r.value?.articles || r.value?.data || r.value?.items || [];
		for (const item of items) {
			const title = String(item?.title || item?.headline || '').trim();
			if (!title || seen.has(title)) continue;
			seen.add(title);
			headlines.push({
				title,
				category: item?.category || 'general',
				published_at: item?.published_at || item?.publishedAt || item?.date || null,
				source: item?.source || null,
			});
		}
	}

	if (headlines.length) {
		_cache.headlines = headlines;
		_cache.fetchedAt = now;
	}
	return _cache.headlines || [];
}

/**
 * Fetch trending topics from cryptocurrency.cv. Returns array of strings.
 */
export async function fetchTrending() {
	if (_cache.trending && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) return _cache.trending;
	const data = await fetchWithTimeout(`${BASE}/api/trending?limit=20`, 4000);
	const topics = (data?.topics || data?.trending || data?.items || [])
		.map((t) => (typeof t === 'string' ? t : String(t?.name || t?.topic || '')))
		.filter(Boolean);
	if (topics.length) _cache.trending = topics;
	return _cache.trending || [];
}

// Tokenize a string into lowercase word-level tokens for fuzzy matching.
function tokens(str) {
	return String(str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
}

// Score how well a headline matches coin metadata. Returns 0–100.
function matchScore(headline, coinTokens) {
	const hTokens = tokens(headline.title);
	let hits = 0;
	for (const ct of coinTokens) {
		if (ct.length < 2) continue;
		for (const ht of hTokens) {
			if (ht === ct || (ct.length >= 4 && ht.includes(ct))) { hits++; break; }
		}
	}
	return hits;
}

/**
 * Return the top matching recent headlines for a coin. Empty array if none match.
 * Threshold: at least 1 token overlap.
 *
 * @param {{ name?: string, symbol?: string, description?: string, tags?: string[] }} meta
 * @param {number} [maxResults=3]
 * @returns {Promise<Array<{title:string, category:string, published_at:string|null}>>}
 */
export async function fetchRelevantHeadlines(meta = {}, maxResults = 3) {
	try {
		const headlines = await fetchHeadlines();
		if (!headlines.length) return [];

		const coinTokens = tokens(`${meta.name || ''} ${meta.symbol || ''} ${(meta.tags || []).join(' ')}`);
		if (!coinTokens.length) return [];

		const scored = headlines
			.map((h) => ({ ...h, _score: matchScore(h, coinTokens) }))
			.filter((h) => h._score > 0)
			.sort((a, b) => b._score - a._score)
			.slice(0, maxResults);

		return scored.map(({ _score: _, ...h }) => h);
	} catch {
		return [];
	}
}

/**
 * Compute a virality bonus (0–30) from live news context.
 * Called inside classifyNarrative to adjust the base LLM-estimated virality.
 *
 * @param {Array<{title:string}>} headlines matching headlines
 * @returns {number}
 */
export function viralityBonus(headlines) {
	if (!headlines.length) return 0;
	// First match: strong bonus. Additional matches add diminishing signal.
	return Math.min(30, headlines.length * 10 + 5);
}
