// GET /api/aixbt/grounding — hourly structured market context (crypto + tradfi).
//
// Part of the three.ws ⇄ aixbt bridge. Public, read-only. Updates hourly
// upstream, so it is cached aggressively.
//
// Response: { grounding, source } | { error, error_description }

import { wrap, cors, method, json, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { getGrounding } from '../_lib/aixbt.js';
import { respondAixbtError } from './_shared.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.aixbtIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	try {
		const result = await getGrounding();
		return json(res, 200, result, {
			'cache-control': 'public, s-maxage=600, stale-while-revalidate=1800',
		});
	} catch (err) {
		return respondAixbtError(res, err);
	}
});
