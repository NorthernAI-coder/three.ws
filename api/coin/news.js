// GET /api/coin/news?q=<coin name>&limit=8
// ---------------------------------------------------------------------------
// Related-news rail for the /coin/:id page. Proxies the live cryptocurrency.cv
// aggregator (same team, 12+ first-party sources) and slims each article to
// the fields the card renders. Cached 300s at the CDN — news freshness at the
// minute level is plenty for a coin profile.

import { cors, json, method, wrap, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';

const NEWS_BASE = 'https://cryptocurrency.cv/api/news';

const _cache = new Map(); // key → { value, expiresAt }
const TTL_MS = 300_000;

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, 'http://x').searchParams;
	const q = (params.get('q') || '').trim().slice(0, 64);
	if (!q) return error(res, 400, 'bad_query', 'q is required');
	const limit = Math.min(Math.max(1, parseInt(params.get('limit') || '8', 10) || 8), 20);

	const key = `${q.toLowerCase()}:${limit}`;
	const now = Date.now();
	const hit = _cache.get(key);
	if (hit && hit.expiresAt > now) {
		return json(res, 200, hit.value, {
			'cache-control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=900',
		});
	}

	try {
		const resp = await fetch(`${NEWS_BASE}?search=${encodeURIComponent(q)}&limit=${limit}`, {
			headers: { accept: 'application/json', 'user-agent': 'three.ws/1.0' },
			signal: AbortSignal.timeout(8000),
		});
		if (!resp.ok) throw new Error(`news upstream ${resp.status}`);
		const raw = await resp.json();
		const articles = (raw?.articles || [])
			.filter((a) => str(a?.title) && str(a?.link))
			.slice(0, limit)
			.map((a) => ({
				title: a.title.trim(),
				link: a.link.trim(),
				description: str(a.description)?.slice(0, 280) ?? null,
				image: str(a.imageUrl),
				source: str(a.source),
				category: str(a.category),
				published_at: str(a.pubDate),
			}));
		const value = { articles, source: 'cryptocurrency.cv' };
		_cache.set(key, { value, expiresAt: now + TTL_MS });
		if (_cache.size > 128) _cache.delete(_cache.keys().next().value);
		return json(res, 200, value, {
			'cache-control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=900',
		});
	} catch {
		return error(res, 502, 'upstream_error', 'related news is unavailable right now');
	}
});
