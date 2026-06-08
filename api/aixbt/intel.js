// GET /api/aixbt/intel — recent aixbt narrative intelligence items.
//
// Part of the three.ws ⇄ aixbt bridge. Public, read-only, cache-friendly. The
// aixbt API key stays server-side (api/_lib/aixbt.js); this endpoint is what
// the aixbt agent skills and the aixbt_intel MCP tool call.
//
// Query: ?limit=20&category=<cat>&chain=<chain>
// Response: { intel: [...], pagination } | { error, error_description, setup? }

import { wrap, cors, method, json, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { getIntel } from '../_lib/aixbt.js';
import { respondAixbtError } from './_shared.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.aixbtIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const limit = Number(url.searchParams.get('limit')) || 20;
	const category = url.searchParams.get('category') || undefined;
	const chain = url.searchParams.get('chain') || undefined;

	try {
		const result = await getIntel({ limit, category, chain });
		return json(res, 200, result, {
			'cache-control': 'public, s-maxage=120, stale-while-revalidate=300',
		});
	} catch (err) {
		return respondAixbtError(res, err);
	}
});
