// In-process screen-frame publisher for first-party API flows.
//
// /api/agent-screen-push is the HTTP path external casters use. Some flows run
// INSIDE the API (the a2a-hire orchestrator) and publish a frame without a
// round-trip to themselves. This is a thin wrapper over the shared store
// (agent-screen-store.js — the single source of truth for the Redis keys, TTLs,
// log cap, and active-set bookkeeping) that adds the two things a server-internal
// narration frame needs:
//
//   • A bounded structured `meta` sidecar (the hire visualizer's phase payload).
//   • Image preservation: a text/meta-only frame must NOT blank the agent's last
//     screenshot, so we carry the previous frame's image forward.

import { getRedis } from './redis.js';
import { writeScreenFrame as storeFrame } from './agent-screen-store.js';

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

const FRAME_TYPES = ['screenshot', 'activity', 'trade', 'analysis'];

// Publish a frame for `agentId`. Fire-and-forget by contract: returns true when
// written, false when Redis is down or the input is unusable, and NEVER throws —
// callers must never let a frame write block or fail real work (e.g. settlement).
export async function writeScreenFrame(agentId, frame = {}, { nowMs, preserveImage = true } = {}) {
	try {
		const r = getRedis();
		if (!r || !agentId || typeof agentId !== 'string') return false;

		const activity = String(frame.activity || '').slice(0, 320);
		const type = FRAME_TYPES.includes(frame.type) ? frame.type : 'activity';
		const meta = safeMeta(frame.meta);

		// Preserve the agent's last screenshot when this frame carries no image, so a
		// text/meta narration never blanks a live caster's screen.
		let data = typeof frame.data === 'string' ? frame.data : null;
		if (!data && preserveImage) {
			try {
				const prevRaw = await r.get(`agent:screen:${agentId}:frame`);
				const prev = prevRaw ? (typeof prevRaw === 'string' ? JSON.parse(prevRaw) : prevRaw) : null;
				if (prev?.data) data = prev.data;
			} catch {
				/* no prior frame — publish image-less */
			}
		}

		await storeFrame(r, agentId, { data, activity, type, meta }, nowMs || Date.now());
		return true;
	} catch {
		return false;
	}
}
