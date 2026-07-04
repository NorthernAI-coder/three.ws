// GET /api/coin/news?q=<coin name>&limit=8
// ---------------------------------------------------------------------------
// Related-news rail for the /coin/:id page. Primary source is the live
// cryptocurrency.cv aggregator (same team, 12+ first-party sources). When that
// deployment is unreachable, this falls back to reading the same upstream RSS
// feeds it aggregates (CoinDesk, Cointelegraph, Decrypt, The Block) directly
// and filtering by the query — real articles either way, never fabricated.
// Cached 300s in-memory + CDN.

import { XMLParser } from 'fast-xml-parser';
import { cors, json, method, wrap, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';

const NEWS_BASE = 'https://cryptocurrency.cv/api/news';

// Feed list mirrors the cryptocurrency.cv source registry (src/lib/crypto-news.ts).
const RSS_FEEDS = [
	{ source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
	{ source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
	{ source: 'Decrypt', url: 'https://decrypt.co/feed' },
	{ source: 'The Block', url: 'https://www.theblock.co/rss.xml' },
];

const _cache = new Map(); // key → { value, expiresAt }
const TTL_MS = 300_000;

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function stripHtml(s) {
	return String(s || '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

async function fromAggregator(q, limit) {
	const resp = await fetch(`${NEWS_BASE}?search=${encodeURIComponent(q)}&limit=${limit}`, {
		headers: { accept: 'application/json', 'user-agent': 'three.ws/1.0' },
		signal: AbortSignal.timeout(6000),
	});
	if (!resp.ok) throw new Error(`news upstream ${resp.status}`);
	const raw = await resp.json();
	const articles = (raw?.articles || [])
		.filter((a) => str(a?.title) && str(a?.link))
		.slice(0, limit)
		.map((a) => ({
			title: a.title.trim(),
			link: a.link.trim(),
			description: str(a.description) ? stripHtml(a.description).slice(0, 280) : null,
			image: str(a.imageUrl),
			source: str(a.source),
			published_at: str(a.pubDate),
		}));
	if (!articles.length) throw new Error('aggregator returned no articles');
	return { articles, source: 'cryptocurrency.cv' };
}

function parseFeed(xml, source) {
	const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });
	const doc = parser.parse(xml);
	// RSS 2.0 (rss.channel.item) and Atom (feed.entry) both appear in this set.
	const items = doc?.rss?.channel?.item || doc?.feed?.entry || [];
	return (Array.isArray(items) ? items : [items]).map((it) => {
		const link =
			str(it?.link) ||
			str(it?.link?.['@href']) ||
			(Array.isArray(it?.link) ? str(it.link.find((l) => l?.['@href'])?.['@href']) : null);
		const media = it?.['media:content']?.['@url'] || it?.enclosure?.['@url'] || null;
		return {
			title: stripHtml(str(it?.title?.['#text']) || str(it?.title) || ''),
			link,
			description: stripHtml(str(it?.description) || str(it?.summary) || '').slice(0, 280) || null,
			image: str(media),
			source,
			published_at: str(it?.pubDate) || str(it?.published) || str(it?.updated),
		};
	});
}

async function fromRss(q, limit) {
	const results = await Promise.allSettled(
		RSS_FEEDS.map(async ({ source, url }) => {
			const resp = await fetch(url, {
				headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': 'three.ws/1.0' },
				signal: AbortSignal.timeout(7000),
			});
			if (!resp.ok) throw new Error(`${source} ${resp.status}`);
			return parseFeed(await resp.text(), source);
		}),
	);
	const needle = q.toLowerCase();
	const articles = results
		.filter((r) => r.status === 'fulfilled')
		.flatMap((r) => r.value)
		.filter((a) => a.title && a.link)
		.filter((a) => `${a.title} ${a.description || ''}`.toLowerCase().includes(needle))
		.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
		.slice(0, limit);
	return { articles, source: 'rss' };
}

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

	let value;
	try {
		value = await fromAggregator(q, limit);
	} catch {
		try {
			value = await fromRss(q, limit);
		} catch {
			return error(res, 502, 'upstream_error', 'related news is unavailable right now');
		}
	}

	_cache.set(key, { value, expiresAt: now + TTL_MS });
	if (_cache.size > 128) _cache.delete(_cache.keys().next().value);
	return json(res, 200, value, {
		'cache-control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=900',
	});
});
