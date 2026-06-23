// Unified notification preference center.
//
//   GET /api/notifications/preferences
//     → { categories: [...], channels: [...], prefs: {...}, push: {...} }
//        the full resolved matrix + metadata the UI renders from.
//   PUT /api/notifications/preferences   { categories: {...}, telegram_chat_id }
//     → persist a sanitised sparse override; unknown keys are dropped.
//
// Defaults live in api/_lib/notify-prefs.js, so a user who has never saved gets
// a sensible matrix and new categories appear automatically.

import { z } from 'zod';
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { cors, json, method, wrap, error, readJson, rateLimited } from '../_lib/http.js';
import { requireCsrf } from '../_lib/csrf.js';
import { limits } from '../_lib/rate-limit.js';
import {
	CATEGORIES,
	CHANNELS,
	resolvePrefs,
	sanitizePrefs,
} from '../_lib/notify-prefs.js';

const putBody = z.object({
	categories: z.record(z.record(z.boolean())).optional(),
	telegram_chat_id: z.string().max(24).optional(),
});

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,PUT,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'PUT'])) return;

	const user = await getSessionUser(req);
	if (!user) return error(res, 401, 'unauthorized', 'sign in required');

	if (req.method === 'GET') {
		const prefs = await resolvePrefs(user.id);
		const [pushRow] = await sql`
			select count(*)::int as count from push_subscriptions where user_id = ${user.id}
		`;
		return json(res, 200, {
			categories: CATEGORIES,
			channels: CHANNELS,
			prefs,
			push: { subscribed_devices: pushRow?.count ?? 0 },
		});
	}

	if (!(await requireCsrf(req, res, user.id))) return;
	const rl = await limits.notifPrefsWrite(user.id);
	if (!rl.success) return rateLimited(res, rl);

	const body = parseSafe(await readJson(req));
	const clean = sanitizePrefs(body);

	await sql`
		insert into notification_preferences (user_id, prefs, updated_at)
		values (${user.id}, ${JSON.stringify(clean)}::jsonb, now())
		on conflict (user_id) do update set
			prefs = ${JSON.stringify(clean)}::jsonb,
			updated_at = now()
	`;

	return json(res, 200, { ok: true, prefs: await resolvePrefs(user.id) });
});

// Lenient parse: a malformed channel map shouldn't 400 the whole save — the
// sanitiser drops anything unrecognised. Validate only the coarse shape.
function parseSafe(raw) {
	const out = putBody.safeParse(raw);
	return out.success ? out.data : { categories: {} };
}
