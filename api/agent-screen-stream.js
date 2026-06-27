// GET /api/agent-screen-stream?agentId=<uuid> — SSE stream of agent screen frames.
//
// Polls Redis for the latest frame pushed by the agent and emits it over SSE.
// No true pub/sub needed: the 500ms poll is fast enough for a live "watch them
// work" experience. Upstash REST doesn't hold LISTEN connections in serverless.
//
// Events:
//   event: open   — { agentId, agentName, ts }  emitted once on connect
//   event: frame  — { ts, data?, activity, type, agentId }  when a new frame arrives
//   event: log    — { entries: [{ts, activity, type}] }  initial activity history
//   event: dark   — {}  emitted when the agent's frame TTL expires (stream gone dark)
//   event: ping   — {}  keepalive every 15s
//
// The stream runs for up to 280s (Vercel limit 300s — budget for setup/teardown).
// Clients reconnect automatically via EventSource's built-in retry.

import { cors, method, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { getRedis } from './_lib/redis.js';
import { sql } from './_lib/db.js';

export const maxDuration = 300;

const MAX_DURATION_MS = 280_000;
const PING_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 500;

export default async function handleAgentScreenStream(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.mcpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
	const agentId = (url.searchParams.get('agentId') || '').trim();
	if (!agentId) {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'agentId is required' }));
		return;
	}

	// Resolve agent name for the open event
	const [agentRow] = await sql`
		SELECT name FROM agents WHERE id = ${agentId} LIMIT 1
	`.catch(() => []);
	if (!agentRow) {
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'agent not found' }));
		return;
	}

	const r = getRedis();

	res.writeHead(200, {
		'Content-Type': 'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-transform',
		Connection: 'keep-alive',
		'X-Accel-Buffering': 'no',
	});
	res.flushHeaders?.();

	let active = true;
	const send = (event, data) => {
		if (!active || res.writableEnded) return;
		try {
			res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
		} catch {
			active = false;
		}
	};

	req.on('close', () => { active = false; });

	// Emit open event immediately
	send('open', { agentId, agentName: agentRow.name, ts: Date.now() });

	// Emit activity log backfill
	if (r) {
		try {
			const logKey = `agent:screen:${agentId}:log`;
			const raw = await r.lrange(logKey, 0, 49);
			if (raw?.length) {
				const entries = raw
					.map((s) => { try { return JSON.parse(s); } catch { return null; } })
					.filter(Boolean)
					.reverse(); // oldest-first for display
				send('log', { entries });
			}
		} catch { /* non-fatal */ }
	}

	const frameKey = `agent:screen:${agentId}:frame`;
	let lastTs = 0;
	let wasDark = false;
	let deadline = Date.now() + MAX_DURATION_MS;
	let pingAt = Date.now() + PING_INTERVAL_MS;

	const loop = async () => {
		while (active && Date.now() < deadline) {
			const now = Date.now();

			// Keepalive ping
			if (now >= pingAt) {
				send('ping', {});
				pingAt = now + PING_INTERVAL_MS;
			}

			// Poll for new frame
			if (r) {
				try {
					const raw = await r.get(frameKey);
					if (raw) {
						const frame = typeof raw === 'string' ? JSON.parse(raw) : raw;
						if (frame?.ts && frame.ts !== lastTs) {
							lastTs = frame.ts;
							wasDark = false;
							send('frame', frame);
						}
					} else if (!wasDark) {
						// No frame in Redis — agent is dark. Emit once, including on the
						// very first poll (a viewer who connects to an already-offline
						// agent must get the "offline" state, not hang on "Connecting…").
						wasDark = true;
						send('dark', {});
					}
				} catch { /* Redis blip — keep polling */ }
			}

			// Yield to event loop before next poll
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		}

		if (!res.writableEnded) res.end();
	};

	loop().catch(() => { if (!res.writableEnded) res.end(); });
}
