/**
 * IRL pin reports — community moderation for placed agents (D4).
 *
 * POST /api/irl/report  { pinId, reason, deviceToken? }
 *   Files a report against a public pin. Reports are de-duped per distinct
 *   reporter (a session user, else the device token, else the caller IP) so one
 *   actor can't inflate the count by re-submitting. When a pin crosses
 *   REPORT_HIDE_THRESHOLD *distinct* reporters it is hidden (hidden_at = NOW()):
 *   it vanishes from every nearby/mine query and stops accepting interactions.
 *   Hidden, never deleted — the row survives for owner appeal + later review.
 *
 *   Owner-protected: a single reporter can never hide a pin, and the owner's own
 *   reports against their own pin are ignored. This is a queue-at-threshold gate,
 *   not an instant delete — report-bombing is bounded by the distinct-reporter
 *   dedup, real abuse is taken down once enough independent people flag it.
 *
 * References no coin and no third-party token; $THREE is the only coin three.ws
 * references. When the threshold hides a pin we publish a D1 pin:remove into its
 * geocell room so already-loaded viewers see it vanish live; the hidden_at filter
 * on every nearby/mine/bbox read is the durable backstop if that push ever drops.
 */

import { cors, json, wrap, rateLimited } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { publishIrlPin } from '../_lib/irl-publish.js';
import { encodeGeohash } from '../_lib/geohash.js';

// Distinct reporters required before a pin is queued out of public view.
const REPORT_HIDE_THRESHOLD = 3;
// The irl_world realtime room is keyed by a precision-6 geocell (~1.2 km) — match
// REALTIME_PRECISION in api/irl/pins.js so a hide publishes into the same live room
// the pin's add/update/delete events used.
const REALTIME_PRECISION = 6;
const MAX_REASON_LEN = 240;
// Canonical reasons the UI offers; anything else collapses to 'other'. Kept as a
// closed set so the (future) review console can triage by category.
const REASONS = new Set(['spam', 'harassment', 'impersonation', 'scam', 'sexual', 'other']);

let _tableReady = false;
async function ensureTable() {
	if (_tableReady) return;
	await sql`
		CREATE TABLE IF NOT EXISTS irl_pin_reports (
			id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
			pin_id         UUID NOT NULL,
			reporter_token TEXT NOT NULL,
			reason         TEXT,
			created_at     TIMESTAMPTZ DEFAULT NOW()
		)
	`;
	// One report per (pin, reporter) — the dedup that makes report-bombing inert.
	await sql`CREATE UNIQUE INDEX IF NOT EXISTS irl_pin_reports_uniq ON irl_pin_reports (pin_id, reporter_token)`;
	await sql`CREATE INDEX IF NOT EXISTS irl_pin_reports_pin ON irl_pin_reports (pin_id)`;
	_tableReady = true;
}

export default wrap(async (req, res) => {
	cors(req, res, { methods: ['POST', 'OPTIONS'] });
	if (req.method === 'OPTIONS') return res.end();

	if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });

	const ip = clientIp(req);
	const rl = await limits.irlReportIp(ip);
	if (!rl.success) return rateLimited(res, rl);

	await ensureTable();

	const body  = req.body ?? {};
	const pinId = body.pinId;
	if (!pinId) return json(res, 400, { error: 'pinId required' });

	const reason = REASONS.has(body.reason) ? body.reason : 'other';
	const detail = typeof body.detail === 'string'
		? body.detail.trim().slice(0, MAX_REASON_LEN) || null
		: null;
	const reasonStored = detail ? `${reason}: ${detail}` : reason;

	const session     = await getSessionUser(req).catch(() => null);
	const deviceToken = (typeof body.deviceToken === 'string' && body.deviceToken.length)
		? body.deviceToken : null;

	// The pin must exist and still be live. A 404 here is honest — you can't report
	// a pin that isn't there (already expired, deleted, or never existed).
	const [pin] = await sql`
		SELECT id, user_id, device_token, hidden_at, lat, lng
		FROM irl_pins
		WHERE id = ${pinId}
		  AND (expires_at IS NULL OR expires_at > NOW())
		LIMIT 1
	`;
	if (!pin) return json(res, 404, { error: 'pin not found' });

	// Distinct-reporter identity, most-accountable first: the signed-in user, else
	// the placing device, else the caller IP. IP fallback means many anonymous
	// reporters behind one NAT count as one — the safe direction (it makes hiding
	// HARDER to abuse, never easier).
	const reporterToken = session?.id
		? `user:${session.id}`
		: deviceToken || `ip:${ip}`;

	// Owner reporting their own pin is a no-op — not an independent flag. (A signed-in
	// owner or the placing device both count as the owner.)
	const isOwner =
		(!!session?.id && !!pin.user_id && session.id === pin.user_id) ||
		(!!deviceToken && !!pin.device_token && deviceToken === pin.device_token);
	if (isOwner) {
		return json(res, 200, { ok: true, self: true });
	}

	// Already hidden — accept the report idempotently (still record it for the
	// review trail) but report the terminal state to the client.
	// Insert is dedup'd by the unique (pin_id, reporter_token) index.
	await sql`
		INSERT INTO irl_pin_reports (pin_id, reporter_token, reason)
		VALUES (${pinId}, ${reporterToken}, ${reasonStored})
		ON CONFLICT (pin_id, reporter_token) DO NOTHING
	`;

	if (pin.hidden_at) {
		return json(res, 200, { ok: true, hidden: true });
	}

	// Count DISTINCT reporters and hide once the threshold is crossed. The hide is
	// guarded on hidden_at IS NULL so concurrent reports can't double-fire it.
	const [{ n }] = await sql`
		SELECT count(DISTINCT reporter_token)::int AS n
		FROM irl_pin_reports
		WHERE pin_id = ${pinId}
	`;

	let hidden = false;
	if (n >= REPORT_HIDE_THRESHOLD) {
		const rows = await sql`
			UPDATE irl_pins
			SET hidden_at = NOW()
			WHERE id = ${pinId} AND hidden_at IS NULL
			RETURNING id
		`;
		hidden = rows.length > 0;
		// Realtime (D1): the first reporter to cross the threshold pushes a pin:remove
		// into the pin's geocell room, so every co-located viewer who already has it
		// loaded sees it vanish within ~1 s — not just on their next nearby re-fetch.
		// Guarded on the conditional UPDATE above so concurrent reports fire it once.
		// Fire-and-forget: the hide is already persisted and the hidden_at filter on
		// every read path is the durable contract if the push drops.
		const plat = Number(pin.lat);
		const plng = Number(pin.lng);
		if (hidden && Number.isFinite(plat) && Number.isFinite(plng)) {
			void publishIrlPin(
				'pin:remove',
				encodeGeohash(plat, plng, REALTIME_PRECISION),
				{ id: pinId },
			);
		}
	}

	return json(res, 200, { ok: true, reports: n, hidden });
});
