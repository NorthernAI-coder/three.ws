// Server-internal screen-frame writer.
//
// /api/agent-screen-push is the HTTP path agents use to publish frames. Some
// first-party flows (the a2a-hire orchestrator) run INSIDE the API and need to
// publish a frame without a round-trip to themselves — this writes the same
// Redis records the push endpoint does, so a viewer subscribed to
// /api/agent-screen-stream receives it identically.
//
// Two differences from the HTTP path, both deliberate:
//   • It carries a structured `meta` sidecar on the frame + log entry (the hire
//     visualizer reads it). The HTTP endpoint also accepts `meta` now.
//   • A text/meta-only frame PRESERVES the agent's last screenshot image rather
//     than blanking it: we don't want a hire narration to wipe a live caster's
//     screen. When no prior image exists the frame is image-less (the viewer's
//     hire panel is the content during a hire).

import { getRedis } from './redis.js';

const FRAME_TTL = 90; // seconds — mirrors agent-screen-push.js
const LOG_CAP = 50;
const ACTIVITY_MAX = 320;
const FRAME_TYPES = ['screenshot', 'activity', 'trade', 'analysis'];

// Bound the meta sidecar so a caller can't push an unbounded blob into Redis.
function safeMeta(meta) {
	if (!meta || typeof meta !== 'object') return null;
	try {
		const s = JSON.stringify(meta);
		if (s.length > 4000) return null;
		return JSON.parse(s);
	} catch {
		return null;
	}
}

// Publish a frame for `agentId` directly to Redis. Returns true when written,
// false when Redis is unavailable or the input is unusable. Never throws — the
// caller treats publishing as fire-and-forget and must never let it block real
// settlement.
export async function writeScreenFrame(agentId, frame = {}, { nowMs, preserveImage = true } = {}) {
	const r = getRedis();
	if (!r || !agentId || typeof agentId !== 'string') return false;

	const now = nowMs || Date.now();
	const activity = String(frame.activity || '').slice(0, ACTIVITY_MAX);
	const type = FRAME_TYPES.includes(frame.type) ? frame.type : 'activity';
	const meta = safeMeta(frame.meta);

	const frameKey = `agent:screen:${agentId}:frame`;
	const logKey = `agent:screen:${agentId}:log`;

	// Preserve the agent's last screenshot when this frame carries no image, so a
	// text/meta narration never blanks a live caster's screen.
	let data = typeof frame.data === 'string' ? frame.data : null;
	if (!data && preserveImage) {
		try {
			const prevRaw = await r.get(frameKey);
			const prev = prevRaw ? (typeof prevRaw === 'string' ? JSON.parse(prevRaw) : prevRaw) : null;
			if (prev?.data) data = prev.data;
		} catch {
			/* no prior frame — fine, publish image-less */
		}
	}

	const frameRecord = JSON.stringify({ ts: now, data, activity, type, meta, agentId });
	const logEntry = JSON.stringify({ ts: now, activity, type, meta });

	try {
		await Promise.all([
			r.set(frameKey, frameRecord, { ex: FRAME_TTL }),
			r.lpush(logKey, logEntry).then(() => r.ltrim(logKey, 0, LOG_CAP - 1)),
			r.expire(logKey, FRAME_TTL * 5),
			r.zadd('agent:screen:active', { score: now, member: agentId }),
			r.zremrangebyscore('agent:screen:active', 0, now - 120_000),
			r.expire('agent:screen:active', FRAME_TTL * 3),
		]);
		return true;
	} catch {
		return false;
	}
}
