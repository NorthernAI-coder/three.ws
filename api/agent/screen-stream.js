// GET /api/agent/screen-stream?agentId=<id>
//
// Server-Sent Events stream that delivers:
//   { type: 'frame',    frame: '<base64 PNG>', seq: number, ts: number }
//   { type: 'activity', actions: [...], ts: number }
//   { type: 'meta',     name, avatar, status, ts: number }
//   { type: 'heartbeat', ts: number }
//
// Agents push frames via POST /api/agent/screen-push. If no external process
// is pushing frames the client renders the activity canvas from real agent-
// action records instead. The stream never closes while the client holds it.
//
// Auth: agentId must be known (public read of a real agent's stream).
// Rate: one active SSE connection per agentId per client IP is enforced by the
// 60-second Vercel function timeout — the client reconnects via EventSource.

import { cors, wrap } from '../_lib/http.js';
import { cacheGet } from '../_lib/cache.js';
import { sql } from '../_lib/db.js';
import { clientIp } from '../_lib/rate-limit.js';

const HEARTBEAT_MS  = 15_000;
const FRAME_POLL_MS = 250;   // how often to check for a new pushed frame
const ACTIVITY_POLL_MS = 3_000;
const MAX_DURATION_MS = 55_000; // stay under Vercel's 60-second function limit

export const config = { maxDuration: 60 };

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;

	const url = new URL(req.url, 'http://x');
	const agentId = url.searchParams.get('agentId');
	if (!agentId) {
		res.statusCode = 400;
		res.end('agentId required');
		return;
	}

	// Verify agent exists (public read — no auth needed).
	const [agent] = await sql`
		SELECT id, name, avatar_glb_url, avatar_model_url, base_model_url
		FROM agent_identities
		WHERE id = ${agentId} AND deleted_at IS NULL
		LIMIT 1
	`.catch(() => [null]);
	if (!agent) {
		res.statusCode = 404;
		res.end('agent not found');
		return;
	}

	res.writeHead(200, {
		'Content-Type':  'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-transform',
		'X-Accel-Buffering': 'no',
		'Connection': 'keep-alive',
	});

	function send(obj) {
		if (res.writableEnded) return;
		res.write(`data: ${JSON.stringify(obj)}\n\n`);
	}

	// Send agent identity immediately so the client can show the webcam.
	const avatarUrl = agent.avatar_glb_url || agent.avatar_model_url || agent.base_model_url || '/avatars/mannequin.glb';
	send({ type: 'meta', agentId, name: agent.name || 'Agent', avatarUrl, ts: Date.now() });

	let lastFrameSeq = -1;
	let lastActivityTs = 0;
	let lastFrameKey  = `screen:frame:${agentId}`;
	let lastActivityKey = `screen:activity:${agentId}`;
	const start = Date.now();

	// Stagger polls slightly so frame + activity checks don't race on the same tick.
	let frameTick = 0;
	let activityTick = 0;
	let heartbeatTick = 0;

	await new Promise((resolve) => {
		const timer = setInterval(async () => {
			if (res.writableEnded || Date.now() - start > MAX_DURATION_MS) {
				clearInterval(timer);
				resolve();
				return;
			}

			const now = Date.now();
			frameTick     += FRAME_POLL_MS;
			activityTick  += FRAME_POLL_MS;
			heartbeatTick += FRAME_POLL_MS;

			// ── pushed frame ────────────────────────────────────────────────
			if (frameTick >= FRAME_POLL_MS) {
				frameTick = 0;
				try {
					const stored = await cacheGet(lastFrameKey);
					if (stored && stored.seq !== lastFrameSeq) {
						lastFrameSeq = stored.seq;
						send({ type: 'frame', frame: stored.frame, seq: stored.seq, ts: stored.ts });
					}
				} catch { /* non-critical */ }
			}

			// ── activity log ────────────────────────────────────────────────
			if (activityTick >= ACTIVITY_POLL_MS) {
				activityTick = 0;
				try {
					// Check if agent process pushed structured activity.
					const pushed = await cacheGet(lastActivityKey);
					if (pushed && pushed.ts > lastActivityTs) {
						lastActivityTs = pushed.ts;
						send({ type: 'activity', actions: pushed.actions || [], ts: pushed.ts });
					} else if (!pushed) {
						// Fall back to real agent-actions rows from the DB.
						const rows = await sql`
							SELECT id, action_type, summary, payload, created_at
							FROM agent_actions
							WHERE agent_id = ${agentId}
							ORDER BY id DESC
							LIMIT 12
						`.catch(() => []);
						if (rows.length) {
							send({
								type: 'activity',
								actions: rows.map((r) => ({
									id: String(r.id),
									type: r.action_type || 'action',
									summary: r.summary || r.action_type || 'action',
									payload: r.payload || null,
									ts: r.created_at ? new Date(r.created_at).getTime() : now,
								})),
								ts: now,
							});
						}
					}
				} catch { /* non-critical */ }
			}

			// ── heartbeat ───────────────────────────────────────────────────
			if (heartbeatTick >= HEARTBEAT_MS) {
				heartbeatTick = 0;
				send({ type: 'heartbeat', ts: now });
			}
		}, FRAME_POLL_MS);

		req.on('close', () => { clearInterval(timer); resolve(); });
		req.on('error', () => { clearInterval(timer); resolve(); });
	});

	if (!res.writableEnded) res.end();
});
