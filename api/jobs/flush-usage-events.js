// @ts-check
// POST /api/jobs/flush-usage-events — QStash webhook that drains the usage event
// buffer from Redis and batch-inserts into Neon Postgres.
//
// Triggered two ways:
//   1. QStash job published by recordEvent() when BUFFER_FLUSH_THRESHOLD is crossed.
//   2. api/cron/flush-usage-events.js (1-minute cron) as a safety net.
//
// This file handles the QStash path; the cron handler is separate so it can
// keep its import graph lean and skip the signature verification overhead.
//
// Security: every inbound POST must carry a valid Upstash-Signature header
// signed by QStash. Requests without it are rejected 401.

import { error, json, method, wrap } from '../_lib/http.js';
import { verifyQstashSignature } from '../_lib/qstash.js';
import { flushUsageBuffer } from '../_lib/usage.js';

export default wrap(async (req, res) => {
	if (!method(req, res, ['POST'])) return;

	// Collect the raw body for signature verification.
	const raw = await new Promise((resolve, reject) => {
		const chunks = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});

	try {
		const origin = process.env.APP_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
		await verifyQstashSignature({
			signature: req.headers['upstash-signature'],
			body: raw,
			url: `${origin}/api/jobs/flush-usage-events`,
		});
	} catch {
		return error(res, 401, 'unauthorized', 'invalid qstash signature');
	}

	const result = await flushUsageBuffer({ limit: 500 });

	if (result.errors > 0) {
		console.warn('[usage-flush-job] completed with errors', result);
	}

	return json(res, 200, result);
});
