// GET /api/aixbt/projects — momentum-ranked projects from aixbt.
//
// Part of the three.ws ⇄ aixbt bridge. Public, read-only, cache-friendly.
//
// Query: ?limit=20&page=1&names=<comma list>&chain=<chain>
// Response: { projects: [...], pagination } | { error, error_description }

import { wrap, cors, method, json, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { getProjects } from '../_lib/aixbt.js';
import { respondAixbtError } from './_shared.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.aixbtIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const limit = Number(url.searchParams.get('limit')) || 20;
	const page = Number(url.searchParams.get('page')) || 1;
	const names = url.searchParams.get('names') || undefined;
	const chain = url.searchParams.get('chain') || undefined;

	try {
		const result = await getProjects({ limit, page, names, chain });
		return json(res, 200, result, {
			'cache-control': 'public, s-maxage=90, stale-while-revalidate=240',
		});
	} catch (err) {
		return respondAixbtError(res, err);
	}
});
