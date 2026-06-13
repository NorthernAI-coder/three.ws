// @ts-check
// GET /api/cron/flush-usage-events — 1-minute safety-net cron for the usage
// event buffer.
//
// recordEvent() pushes to a Redis list and triggers a QStash job when the
// buffer crosses a threshold. This cron catches everything else: low-traffic
// periods where the threshold is never crossed, QStash outages, and any events
// that slipped through while QStash was unavailable.
//
// Kept as a concrete file (not [name].js) so the import graph stays minimal —
// no shared SDK, skills, or data bundles needed for a telemetry flush.

import { error, json, method, wrap } from '../_lib/http.js';
import { env } from '../_lib/env.js';
import { constantTimeEquals } from '../_lib/crypto.js';
import { flushUsageBuffer } from '../_lib/usage.js';
import { sendOpsAlert } from '../_lib/alerts.js';

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

	const result = await flushUsageBuffer({ limit: 1000 });

	if (result.errors > 0) {
		sendOpsAlert(
			'usage buffer flush errors',
			`${result.errors} inserts failed. flushed=${result.flushed} remaining=${result.remaining}`,
			{ signature: 'usage-flush-errors' },
		);
	}

	if (result.remaining > 500) {
		sendOpsAlert(
			'usage buffer backlog',
			`${result.remaining} events still queued after flush. Check Neon write latency.`,
			{ signature: 'usage-buffer-backlog' },
		);
	}

	return json(res, 200, result);
});
