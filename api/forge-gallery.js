/**
 * Forge gallery — the durable creations belonging to one anonymous client.
 *
 *   GET /api/forge-gallery   → { creations: [...], enabled }
 *
 * Reads the persisted (and durably stored) text→3D models for the browser
 * identified by the x-forge-client header, newest first. Powers the "Your
 * creations" strip on /forge so generated meshes are reusable instead of lost
 * the moment the tab closes.
 *
 * When persistence isn't configured on the deployment it returns
 * { enabled: false, creations: [] } so the page can hide the strip cleanly
 * rather than show a broken state.
 */

import { cors, json, method, wrap, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { hashClient, listCreations, forgeStoreEnabled } from './_lib/forge-store.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.mcp3dStatus(clientIp(req));
	if (!rl.success) {
		return rateLimited(res, rl);
	}

	if (!forgeStoreEnabled()) {
		return json(res, 200, { enabled: false, creations: [] });
	}

	const rawClient = req.headers['x-forge-client'];
	const clientKey = hashClient(Array.isArray(rawClient) ? rawClient[0] : rawClient);
	const url = new URL(req.url, 'http://localhost');
	const limit = Number(url.searchParams.get('limit')) || 24;

	const creations = await listCreations({ clientKey, limit });
	return json(res, 200, { enabled: true, creations });
});
