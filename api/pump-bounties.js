// GET /api/pump-bounties — read-only mirror of pump.fun GO's public bounty list.
//
// Proxies livestream-api.pump.fun/bounties/tasks (public, no auth) through a
// short server cache so we hit pump.fun rarely and serve every visitor from
// cache. Pagination is cursor-based (pass `cursor` = the previous page's
// `nextCursor`); `status` filters; `limit` caps at 50.

import { cors, json, error, wrap, method } from './_lib/http.js';
import { cacheGet, cacheSet } from './_lib/cache.js';
import { listBounties, PumpGoError } from './_lib/pump-go.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const url = new URL(req.url, 'http://localhost');
	const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10), 1), 50);
	const cursor = url.searchParams.get('cursor') || null;
	const status = url.searchParams.get('status') || null;

	const cacheKey = `pumpgo:list:${limit}:${cursor || '_'}:${status || '_'}`;
	const cached = await cacheGet(cacheKey).catch(() => null);
	if (cached) {
		res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120');
		return json(res, 200, cached);
	}

	let data;
	try {
		data = await listBounties({ limit, cursor, status });
	} catch (e) {
		if (e instanceof PumpGoError) return error(res, e.status, e.code, e.message);
		throw e;
	}

	await cacheSet(cacheKey, data, 30).catch(() => {});
	res.setHeader('cache-control', 'public, s-maxage=30, stale-while-revalidate=120');
	return json(res, 200, data);
});
