/**
 * GET /api/billing/receipts?purchase_id=<uuid>
 * Returns the signed receipt JSON for a confirmed purchase, auth-gated to the owning user.
 */

import { sql } from '../_lib/db.js';
import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { cors, error, json, method, wrap, rateLimited } from '../_lib/http.js';
import { clientIp, limits } from '../_lib/rate-limit.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	const userId = session?.id || bearer?.userId;
	if (!userId) return error(res, 401, 'unauthorized', 'sign in required');

	const rl = await limits.widgetRead(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const params = new URL(req.url, 'http://x').searchParams;
	const purchaseId = params.get('purchase_id');
	if (!purchaseId) return error(res, 400, 'bad_request', 'purchase_id required');

	// Verify ownership before returning receipt
	const [purchase] = await sql`
		SELECT id, user_id FROM skill_purchases
		WHERE id = ${purchaseId}
	`;
	if (!purchase) return error(res, 404, 'not_found', 'purchase not found');
	if (purchase.user_id !== userId) return error(res, 403, 'forbidden', 'not your purchase');

	const [receipt] = await sql`
		SELECT receipt_json, signature, created_at
		FROM purchase_receipts
		WHERE purchase_id = ${purchaseId}
	`;

	if (!receipt) return error(res, 404, 'not_found', 'receipt not found for this purchase');

	return json(res, 200, {
		data: {
			purchase_id: purchaseId,
			receipt: receipt.receipt_json,
			signature: receipt.signature,
			issued_at: receipt.created_at,
		},
	});
});
