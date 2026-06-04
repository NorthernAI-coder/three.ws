/**
 * Forge feedback — capture the human verdict on a generated 3D model.
 *
 *   POST /api/forge-feedback   { creation_id, outcome?, downloaded?, rating?, note? }
 *
 * This is the labeled half of the text→3D data flywheel. /forge stores every
 * (prompt → reference image → mesh) triple; this endpoint attaches whether a
 * human kept it, threw it away, downloaded it, or rated it — the signal a future
 * in-house reconstruction model trains and evaluates against.
 *
 * Auth-free like the rest of /forge: writes are scoped to the anonymous client
 * key (x-forge-client header) so a verdict can only be recorded against a row
 * the same browser created. When the store is unconfigured the endpoint returns
 * a clean { ok: false, stored: false } instead of failing.
 */

import { cors, json, method, readJson, wrap } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { hashClient, recordFeedback, forgeStoreEnabled } from './_lib/forge-store.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS' })) return;
	if (!method(req, res, ['POST'])) return;

	const rl = await limits.mcp3dStatus(clientIp(req));
	if (!rl.success) {
		return json(res, 429, {
			error: 'rate_limited',
			retry_after: Math.ceil((rl.reset - Date.now()) / 1000),
		});
	}

	if (!forgeStoreEnabled()) {
		return json(res, 200, { ok: false, stored: false, reason: 'persistence_unconfigured' });
	}

	const body = await readJson(req, 8_000).catch(() => null);
	const creationId = typeof body?.creation_id === 'string' ? body.creation_id.trim() : '';
	if (!UUID_RE.test(creationId)) {
		return json(res, 400, { error: 'invalid_creation', message: 'creation_id must be a uuid.' });
	}

	const rawClient = req.headers['x-forge-client'];
	const clientKey = hashClient(Array.isArray(rawClient) ? rawClient[0] : rawClient);

	const stored = await recordFeedback({
		id: creationId,
		clientKey,
		outcome: body?.outcome,
		downloaded: body?.downloaded === true,
		rating: Number.isInteger(body?.rating) ? body.rating : undefined,
		note: typeof body?.note === 'string' ? body.note : undefined,
	});

	// `stored: false` means no row matched this client+id (or nothing to write) —
	// not an error worth surfacing to the user, but honest to the caller.
	return json(res, 200, { ok: true, stored });
});
