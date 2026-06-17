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
//   3. Interactions (taps/views/messages/pays) whose pin is gone, and interactions
//      older than the retention window regardless of pin state. An interaction row
//      is a record that "device X was at coordinate Y at time T" (it snapshots the
//      pin's lat/lng + a viewer_device), so it is exactly the location trail data
//      minimization should not let accumulate. We cascade-delete it the moment its
//      pin dies, and age it out at INTERACTION_RETENTION_DAYS so even a permanent
//      (signed-in) pin's encounter trail can't grow unbounded.
//
// Retention window — interactions: 180 days. Rationale: long enough that an owner's
// dashboard inbox + the earnings history a `pay` row backs stay useful across a
// reasonable review horizon, short enough that the location trail has a hard, known
// ceiling. The geo-bearing columns (lat/lng) duplicate the pin's own location and
// are kept only for the lifetime of the row precisely because the row is bounded by
// this window + the orphan cascade; we age out the raw row rather than null its
// coordinates so nothing about a months-old encounter survives. `pay` rows age out
// on the same clock — the durable earnings signal an owner cares about is recent,
// and a 180-day-old settlement is already on-chain (the source of truth), so we do
// not keep a stale geo-tagged copy of it indefinitely.
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

	// Both tables are created lazily by their write endpoints (irl_pins by
	// api/irl/pins.js, irl_pin_reports by api/irl/report.js), so on a fresh
	// deployment — or before the first pin is placed / first report is filed —
	// they may not exist yet. A reaper that hard-depended on them would throw
	// `relation does not exist` and 500 the hourly cron. Probe with to_regclass
	// and treat a missing table as "nothing to reap" rather than an error.
	const [{ pins, reports, interactions }] = await sql`
		SELECT
			to_regclass('public.irl_pins')         AS pins,
			to_regclass('public.irl_pin_reports')  AS reports,
			to_regclass('public.irl_interactions') AS interactions
	`;

	// Expired anon pins, ≥ 1 day past expiry. expires_at IS NULL ⇒ permanent ⇒ kept.
	const reapedPins = pins
		? await sql`
			DELETE FROM irl_pins
			WHERE expires_at IS NOT NULL
			  AND expires_at < NOW() - INTERVAL '1 day'
			RETURNING id
		`
		: [];

	// Orphaned reports — their pin is gone, so the trail is moot. If the pins
	// table itself is absent, every report is an orphan, so purge them all.
	let reapedReports = [];
	if (reports) {
		reapedReports = pins
			? await sql`
				DELETE FROM irl_pin_reports r
				WHERE NOT EXISTS (SELECT 1 FROM irl_pins p WHERE p.id = r.pin_id)
				RETURNING r.id
			`
			: await sql`DELETE FROM irl_pin_reports RETURNING id`;
	}

	// Interactions — the location trail. Two sweeps, both existence-guarded so a
	// fresh DB never 500s:
	//   a. orphaned — the pin is gone, so the encounter record is moot (mirrors the
	//      report orphan sweep). With no pins table at all, every interaction is an
	//      orphan, so purge them all.
	//   b. aged-out — older than the retention window regardless of pin state, so a
	//      permanent pin's trail can't accumulate forever.
	// A single re-run after a clean sweep deletes nothing new (idempotent): both
	// predicates are empty once the table holds only live, in-window rows.
	let reapedInteractions = [];
	if (interactions) {
		const orphaned = pins
			? await sql`
				DELETE FROM irl_interactions ix
				WHERE NOT EXISTS (SELECT 1 FROM irl_pins p WHERE p.id = ix.pin_id)
				RETURNING ix.id
			`
			: await sql`DELETE FROM irl_interactions RETURNING id`;
		const aged = await sql`
			DELETE FROM irl_interactions
			WHERE created_at < NOW() - INTERVAL '180 days'
			RETURNING id
		`;
		reapedInteractions = [...orphaned, ...aged];
	}

	return json(res, 200, {
		ok: true,
		reapedPins: reapedPins.length,
		reapedReports: reapedReports.length,
		reapedInteractions: reapedInteractions.length,
		ts: Date.now(),
	});
});
