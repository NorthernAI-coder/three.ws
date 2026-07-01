// GET/POST /api/admin/flags — read and flip runtime feature flags without a
// redeploy. Flags are DB-backed switches (api/_lib/flags.js, table app_flags)
// that crons and request paths read live.
//
//   GET  → every known + set flag with its effective state, the env var it
//          falls back to, and when it was last changed.
//   POST → { key, enabled, value? } upserts one flag. `key` must be a known
//          flag (see KNOWN_FLAGS) so a typo can't strand a dead row.
//
// Auth: a real admin session OR `Bearer $CRON_SECRET` (for ops tooling), the
// same contract as /api/admin/launcher.

import { requireAdmin } from '../_lib/admin.js';
import { cors, json, error, method, readJson, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { logAudit } from '../_lib/audit.js';
import { listFlags, setFlag, KNOWN_FLAGS } from '../_lib/flags.js';

function isCronAuth(req) {
	const auth = req.headers.authorization || '';
	const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
	return !!env.CRON_SECRET && constantTimeEquals(bearer, env.CRON_SECRET);
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	let adminId = null;
	if (isCronAuth(req)) {
		adminId = null; // ops tooling — no user id to attribute
	} else {
		const admin = await requireAdmin(req, res);
		if (!admin) return; // requireAdmin already wrote 401/403
		adminId = admin.id;
	}

	if (req.method === 'GET') {
		return json(res, 200, { ok: true, flags: await listFlags() });
	}

	const body = await readJson(req, 64 * 1024);
	const key = typeof body?.key === 'string' ? body.key.trim() : '';
	if (!key || !Object.prototype.hasOwnProperty.call(KNOWN_FLAGS, key)) {
		return error(
			res,
			400,
			'unknown_flag',
			`key must be one of: ${Object.keys(KNOWN_FLAGS).join(', ')}`,
		);
	}
	if (typeof body.enabled !== 'boolean') {
		return error(res, 400, 'invalid_request', 'enabled must be a boolean');
	}

	const row = await setFlag(key, {
		enabled: body.enabled,
		value: body.value ?? null,
		updatedBy: adminId,
	});

	// Best-effort audit trail (fire-and-forget; never blocks or fails the toggle).
	logAudit({
		userId: adminId,
		action: 'flag-set',
		resourceId: key,
		meta: { enabled: body.enabled },
		req,
	});

	return json(res, 200, { ok: true, flag: row, env_fallback: KNOWN_FLAGS[key]?.env ?? null });
});
