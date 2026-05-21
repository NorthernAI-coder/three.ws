// /api/x402/admin/subscriptions/<id>
//   DELETE → revoke. Idempotent — re-revoking a revoked sub is a 200.
//
// Admin-only. Audit-trailed via api/_lib/audit.js. Usage stats for a given
// subscription live at /api/x402/admin/subscriptions/<id>/usage.

import { cors, json, error, method, wrap } from '../../../_lib/http.js';
import { requireAdmin } from '../../../_lib/admin.js';
import { logAudit } from '../../../_lib/audit.js';
import { revokeSubscription } from '../../../_lib/x402/api-keys.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'DELETE,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['DELETE'])) return;

	const admin = await requireAdmin(req, res);
	if (!admin) return;

	const id = String(req.query?.id || '').trim();
	if (!id) return error(res, 400, 'missing_id', 'subscription id required');

	const row = await revokeSubscription(id);
	if (!row) return error(res, 404, 'not_found', 'subscription not found');

	logAudit({
		userId: admin.id,
		action: 'x402.subscription.revoke',
		resourceId: id,
		meta: { name: row.name },
	});

	return json(res, 200, { data: row });
});
