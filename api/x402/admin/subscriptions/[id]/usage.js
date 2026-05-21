// GET /api/x402/admin/subscriptions/<id>/usage
//
// Admin-only. Returns aggregate counts (granted vs. denied), per-route breakdown,
// and the most recent N access-log rows for the given subscription. Sourced
// from x402_access_log written by api/_lib/x402/access-control.js on every
// bypass / abort.

import { cors, json, error, method, wrap } from '../../../../_lib/http.js';
import { requireAdmin } from '../../../../_lib/admin.js';
import { getUsage } from '../../../../_lib/x402/api-keys.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const admin = await requireAdmin(req, res);
	if (!admin) return;

	const id = String(req.query?.id || '').trim();
	if (!id) return error(res, 400, 'missing_id', 'subscription id required');

	const recentRaw = parseInt(req.query?.limit, 10);
	const recentLimit = Number.isFinite(recentRaw) ? Math.min(Math.max(recentRaw, 1), 500) : 50;

	const usage = await getUsage(id, { recentLimit });
	if (!usage) return error(res, 404, 'not_found', 'subscription not found');

	return json(res, 200, { data: usage });
});
