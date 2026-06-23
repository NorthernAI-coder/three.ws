/**
 * GET /api/signals/feed?slug=<slug>&network=mainnet
 *
 * One feed's public detail page: the publisher's verified track record, the
 * feed's proven signal accuracy (hit-rate, avg realized ROI, follower ROI,
 * emit→fill latency), pricing, and the recent emission log — every signal with
 * its realized outcome and a link to the on-chain tx that proves it.
 */

import { cors, json, error, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { getFeedDetail } from '../_lib/signal-engine.js';
import { normNetwork } from './_common.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const slug = url.searchParams.get('slug');
	if (!slug) return error(res, 400, 'invalid_slug', 'slug required');
	const network = normNetwork(url.searchParams.get('network'));

	const detail = await getFeedDetail({ slug, network });
	if (!detail) return error(res, 404, 'not_found', 'feed not found');

	res.setHeader('cache-control', 'public, max-age=10, stale-while-revalidate=30');
	return json(res, 200, { feed: detail });
});
