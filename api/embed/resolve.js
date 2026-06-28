/**
 * GET /api/embed/resolve?id=<spec>
 *
 * Resolves a flexible ID spec to the minimal payload an embed needs to render
 * an agent: { glbUrl, name, poster, kind, ...minimal metadata }.
 *
 * Supported ID specs (kept tiny on purpose):
 *   - "<chainId>:<agentId>"         → on-chain ERC-8004 agent  e.g. "8453:42"
 *   - "eip155:<chainId>:<agentId>"  → same, namespaced form    e.g. "eip155:8453:42"
 *   - "avatar:<uuid>"               → public avatar            e.g. "avatar:8e3...c1"
 *
 * Cross-origin by design (Access-Control-Allow-Origin: *). Cached aggressively
 * at the edge so an embed loading in 10k pages doesn't hammer the DB.
 *
 * Resolution logic lives in api/_lib/embed-asset.js so the token-gate verifier
 * can resolve the same shape behind an on-chain balance check.
 */

import { cors, method, wrap, error, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { resolveEmbedAsset, isEmbedAssetRef } from '../_lib/embed-asset.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const id = (url.searchParams.get('id') || '').trim();
	if (!id) return error(res, 400, 'validation_error', 'id is required');

	if (!isEmbedAssetRef(id)) {
		return error(
			res,
			400,
			'validation_error',
			'id must be "<chainId>:<agentId>", "eip155:<chainId>:<agentId>", or "avatar:<uuid>"',
		);
	}

	const payload = await resolveEmbedAsset(id);
	if (!payload) return error(res, 404, 'not_found', 'asset not found');

	return embedJson(res, payload);
});

function embedJson(res, payload) {
	res.statusCode = 200;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('access-control-allow-origin', '*');
	res.setHeader('cross-origin-resource-policy', 'cross-origin');
	res.setHeader(
		'cache-control',
		'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
	);
	res.end(JSON.stringify(payload));
}
