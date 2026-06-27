// /api/x402/admin/subscriptions
//   GET  → list active subscriptions (?includeInactive=1 → revoked / expired too)
//   POST → issue a new subscription. Returns the plaintext API key ONCE.
//
// Admin-only (api/_lib/admin.js requireAdmin gate). Backing tables and the
// runtime hook live in api/_lib/x402/api-keys.js + access-control.js.

import { z } from 'zod';
import { cors, json, error, method, readJson, wrap } from '../../_lib/http.js';
import { requireAdmin } from '../../_lib/admin.js';
import { parse } from '../../_lib/validate.js';
import { logAudit } from '../../_lib/audit.js';
import { constantTimeEquals } from '../../_lib/crypto.js';
import { createSubscription, listSubscriptions } from '../../_lib/x402/api-keys.js';

// Internal-service read access. Server-side jobs (the x402 autonomous loop's
// Subscription Status Health Check) enumerate subscriptions over HTTP with the
// shared INTERNAL_API_KEY rather than a browser session. The bypass is GET-only
// (read), constant-time compared, and never grants the mutating POST path —
// issuing a key still requires a real admin session. Returns false (no bypass)
// when the header is absent or the key is unconfigured, so the requireAdmin gate
// always runs for ordinary callers.
function isInternalServiceRequest(req) {
	const provided = req.headers['x-api-key'] || req.headers['X-API-Key'];
	const expected = process.env.INTERNAL_API_KEY;
	if (!provided || !expected) return false;
	return constantTimeEquals(String(provided), String(expected));
}

const createSchema = z.object({
	name: z.string().trim().min(1).max(120),
	rate_limit_per_minute: z.number().int().min(1).max(100_000).optional().default(60),
	expires_at: z.string().datetime().optional().nullable(),
	meta: z.record(z.unknown()).optional().nullable(),
	id: z
		.string()
		.trim()
		.regex(/^[a-z0-9_-]{3,64}$/i, 'id must be 3-64 chars, alphanumeric/underscore/dash')
		.optional(),
});

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	// Internal-service read bypass (GET only) — see isInternalServiceRequest.
	if (req.method === 'GET' && isInternalServiceRequest(req)) {
		const includeInactive =
			req.query?.includeInactive === '1' || req.query?.includeInactive === 'true';
		const rows = await listSubscriptions({ includeInactive });
		return json(res, 200, { data: rows, caller: 'internal-service' });
	}

	const admin = await requireAdmin(req, res);
	if (!admin) return;

	if (req.method === 'GET') {
		const includeInactive =
			req.query?.includeInactive === '1' || req.query?.includeInactive === 'true';
		const rows = await listSubscriptions({ includeInactive });
		return json(res, 200, { data: rows });
	}

	// POST — create
	const body = parse(createSchema, await readJson(req));
	let created;
	try {
		created = await createSubscription({
			name: body.name,
			id: body.id,
			rateLimitPerMinute: body.rate_limit_per_minute,
			expiresAt: body.expires_at ?? null,
			meta: body.meta ?? null,
			createdBy: admin.id,
		});
	} catch (err) {
		if (err?.code === '23505' || /duplicate/i.test(err?.message || '')) {
			return error(res, 409, 'duplicate_subscription', 'id already exists');
		}
		return error(res, err.status || 500, err.code || 'internal_error', err.message);
	}

	logAudit({
		userId: admin.id,
		action: 'x402.subscription.create',
		resourceId: created.id,
		meta: { name: created.name, rate_limit_per_minute: created.rate_limit_per_minute },
	});

	// The token field is the ONLY time we ever surface the plaintext key.
	// Operators must store it on their side immediately.
	return json(res, 201, { data: created });
});
