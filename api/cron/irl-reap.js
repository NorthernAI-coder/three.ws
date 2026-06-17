// @ts-check
// GET /api/cron/irl-reap — IRL placement reaper (D4).
//
// Keeps the irl_pins table and every geocell density count lean by deleting dead
// rows the nearby/mine queries already filter out:
//
//   1. Expired anonymous pins, one day past expiry — long enough that a brief
//      clock skew or a viewer mid-session never loses a still-relevant pin, short
//      enough that ghosts don't accumulate. Signed-in permanent pins (expires_at
//      IS NULL) are NEVER reaped.
//   2. Reports tied to pins that no longer exist — once the pin is gone the report
//      trail is moot, so it's purged to keep irl_pin_reports bounded.
//
// Hidden pins are NOT deleted here: a moderation-hidden pin is queued for review +
// owner appeal, not garbage. It's reaped only when its own expiry passes (anon) or
// never (signed-in) — the same rule as any other pin.
//
// Runs hourly. Idempotent: re-running deletes nothing new once the table is clean.

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { sql } from '../_lib/db.js';

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) {
		error(res, 503, 'not_configured', 'CRON_SECRET unset');
		return false;
	}
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) {
		error(res, 401, 'unauthorized', 'invalid cron secret');
		return false;
	}
	return true;
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET'])) return;
	if (!requireCron(req, res)) return;

	// Expired anon pins, ≥ 1 day past expiry. expires_at IS NULL ⇒ permanent ⇒ kept.
	const reapedPins = await sql`
		DELETE FROM irl_pins
		WHERE expires_at IS NOT NULL
		  AND expires_at < NOW() - INTERVAL '1 day'
		RETURNING id
	`;

	// Orphaned reports — their pin is gone, so the trail is moot.
	const reapedReports = await sql`
		DELETE FROM irl_pin_reports r
		WHERE NOT EXISTS (SELECT 1 FROM irl_pins p WHERE p.id = r.pin_id)
		RETURNING r.id
	`;

	return json(res, 200, {
		ok: true,
		reapedPins: reapedPins.length,
		reapedReports: reapedReports.length,
		ts: Date.now(),
	});
});
