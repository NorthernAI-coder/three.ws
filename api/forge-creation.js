/**
 * Forge creation — a single durable creation, fetched by id for sharing.
 *
 *   GET /api/forge-creation?id=<uuid>   → { enabled, creation }
 *
 * Unlike /api/forge-gallery (which is scoped to the requesting browser's
 * anonymous client key), this is a PUBLIC read: it returns any finished,
 * durably-stored creation by id so a share-link recipient — who never forged
 * the model and has no matching gallery row — can still view it in the full
 * forge UI. The share page (api/forge-share.js) lands real browsers on
 * /forge?share=<id>, and the page fetches this endpoint to open the model.
 *
 * Only finished creations with a durable glb_url are exposed; in-flight or
 * failed rows return { creation: null }. When persistence isn't configured the
 * endpoint returns { enabled: false, creation: null } so the page degrades
 * cleanly instead of showing a broken state.
 */

import { cors, json, method, wrap, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { getPublicCreation, forgeStoreEnabled } from './_lib/forge-store.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.mcp3dStatus(clientIp(req));
	if (!rl.success) {
		return rateLimited(res, rl);
	}

	if (!forgeStoreEnabled()) {
		return json(res, 200, { enabled: false, creation: null });
	}

	const url = new URL(req.url, 'http://localhost');
	const id = url.searchParams.get('id');
	if (!id || !UUID_RE.test(id)) {
		return json(res, 400, { enabled: true, creation: null, error: 'invalid id' });
	}

	const creation = await getPublicCreation({ id });
	if (!creation) {
		return json(res, 404, { enabled: true, creation: null });
	}
	return json(res, 200, { enabled: true, creation });
});
