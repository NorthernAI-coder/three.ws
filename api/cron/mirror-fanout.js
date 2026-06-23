// GET /api/cron/mirror-fanout — drive the custodial copy-trade (mirror) engine.
//
// For every active follow edge whose leader has made a NEW confirmed trade since
// the edge's cursor, size the trade for the follower and execute it through the
// task-05 engine inside the follower's spend policy (api/_lib/agent-mirror.js).
// Idempotent end to end: the agent_mirror_fills unique key and the custody
// idempotency key both prevent double-mirroring, so re-running this cron (or
// overlapping with an owner "Sync now") never double-spends.
//
// Bounded so a 2-minute cron can never run away: only edges with a leader trade
// in the recent window are scanned, and each edge processes at most N events.

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { sql } from '../_lib/db.js';
import { syncFollow } from '../_lib/agent-mirror.js';

const NETWORKS = ['mainnet', 'devnet'];
const MAX_FOLLOWS_PER_RUN = 120;
const MAX_EVENTS_PER_FOLLOW = 15;

function requireCron(req, res) {
	const secret = process.env.CRON_SECRET || env.CRON_SECRET;
	if (!secret) { error(res, 503, 'not_configured', 'CRON_SECRET unset'); return false; }
	const auth = req.headers['authorization'] || '';
	const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
	if (!constantTimeEquals(presented, secret)) { error(res, 401, 'unauthorized', 'invalid cron secret'); return false; }
	return true;
}

async function fanout(network, stats) {
	// Candidate edges: enabled, not killed by the follower's agent-wide switch, and
	// whose leader has at least one confirmed trade newer than the edge cursor.
	const follows = await sql`
		SELECT f.*, la.name AS leader_name
		FROM agent_mirror_follows f
		JOIN agent_identities fa ON fa.id = f.follower_agent_id AND fa.deleted_at IS NULL
		JOIN agent_identities la ON la.id = f.leader_agent_id AND la.deleted_at IS NULL
		WHERE f.enabled = true
		  AND f.network = ${network}
		  AND COALESCE(fa.meta->>'mirror_killed', 'false') <> 'true'
		  AND EXISTS (
		    SELECT 1 FROM agent_custody_events e
		    WHERE e.agent_id = f.leader_agent_id
		      AND e.network = ${network}
		      AND e.category = 'trade'
		      AND e.status = 'confirmed'
		      AND e.id > f.last_leader_event_id
		      AND e.created_at > now() - interval '20 minutes'
		  )
		ORDER BY f.updated_at ASC
		LIMIT ${MAX_FOLLOWS_PER_RUN}
	`;
	if (!follows.length) return;
	stats.edges = (stats.edges || 0) + follows.length;

	for (const f of follows) {
		try {
			const r = await syncFollow(f, { maxEvents: MAX_EVENTS_PER_FOLLOW });
			for (const res of r.results) {
				stats[res.status] = (stats[res.status] || 0) + 1;
			}
		} catch (err) {
			stats.error = (stats.error || 0) + 1;
			stats.last_error = (err?.message || 'error').slice(0, 160);
		}
	}
}

export default wrap(async (req, res) => {
	if (!method(req, res, ['GET', 'POST'])) return;
	if (!requireCron(req, res)) return;

	const stats = {};
	for (const network of NETWORKS) {
		try { await fanout(network, stats); }
		catch (err) { stats[`error_${network}`] = (err?.message || 'error').slice(0, 160); }
	}
	return json(res, 200, { ok: true, ...stats });
});
