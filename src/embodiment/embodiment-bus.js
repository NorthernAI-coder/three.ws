// The Embodiment bus — a focused, typed surface over the ONE Living-Agents
// nervous system (`src/agents/agent-bus.js`), NOT a second bus. Forking the bus
// would mean the avatar/companion/Mind-Palace couldn't see the body's events and
// vice-versa; instead the embodiment events are registered on the same singleton
// (see AGENT_EVENTS in agent-bus.js) so replay, backlog, the wildcard tap, and
// the `?agentbus=1` debug overlay all work for body events for free.
//
// This module gives Tasks 02–08 an ergonomic, autocompleting way to emit/observe
// the embodiment slice without re-importing the whole event catalog or
// hand-writing the `{ agentId, bodyId, ts }` envelope every time. Every helper
// requires a server/device-sourced `ts` (or stamps a last-resort fallback),
// matching the bus's honesty rule for cross-surface ordering.

import { agentBus, EVENTS } from '../agents/agent-bus.js';

/** The embodiment slice of the shared event catalog. */
export const EMBODIMENT_EVENTS = Object.freeze([
	'robot:linked',
	'robot:unlinked',
	'robot:telemetry',
	'robot:fault',
	'embodiment:granted',
	'embodiment:revoked',
	'motion:played',
	'face:expressed',
	'mind:synced',
	'estop',
]);

/** Re-exported so callers don't reach past this facade to the raw bus. */
export { agentBus };

function envelope(detail) {
	const payload = { ...detail };
	if (!payload.ts) payload.ts = new Date().toISOString();
	return payload;
}

/**
 * Subscribe to one embodiment event (or '*' for all). Thin pass-through to the
 * shared bus so `replay`, `throttleMs`, and `signal` options all apply.
 * @param {string} type
 * @param {(payload: Object, type?: string) => void} handler
 * @param {Object} [opts]
 * @returns {() => void} unsubscribe
 */
export function onEmbodiment(type, handler, opts) {
	return agentBus.on(type, handler, opts);
}

/** Last seen payload for an embodiment event, or null. */
export function lastEmbodiment(type) {
	return agentBus.last(type);
}

// ── Typed emitters ──────────────────────────────────────────────────────────
// Each takes a detail object carrying at least `{ agentId, bodyId }` and an
// optional server/device `ts`; the helper fills the envelope and delegates.

export const emitRobotLinked = (detail) => agentBus.emit(EVENTS.ROBOT_LINKED, envelope(detail));
export const emitRobotUnlinked = (detail) => agentBus.emit(EVENTS.ROBOT_UNLINKED, envelope(detail));
export const emitRobotTelemetry = (detail) => agentBus.emit(EVENTS.ROBOT_TELEMETRY, envelope(detail));
export const emitRobotFault = (detail) => agentBus.emit(EVENTS.ROBOT_FAULT, envelope(detail));
export const emitEmbodimentGranted = (detail) => agentBus.emit(EVENTS.EMBODIMENT_GRANTED, envelope(detail));
export const emitEmbodimentRevoked = (detail) => agentBus.emit(EVENTS.EMBODIMENT_REVOKED, envelope(detail));
export const emitMotionPlayed = (detail) => agentBus.emit(EVENTS.MOTION_PLAYED, envelope(detail));
export const emitFaceExpressed = (detail) => agentBus.emit(EVENTS.FACE_EXPRESSED, envelope(detail));
export const emitMindSynced = (detail) => agentBus.emit(EVENTS.MIND_SYNCED, envelope(detail));
export const emitEstop = (detail) => agentBus.emit(EVENTS.ESTOP, envelope(detail));

export default {
	EMBODIMENT_EVENTS,
	on: onEmbodiment,
	last: lastEmbodiment,
	emitRobotLinked,
	emitRobotUnlinked,
	emitRobotTelemetry,
	emitRobotFault,
	emitEmbodimentGranted,
	emitEmbodimentRevoked,
	emitMotionPlayed,
	emitFaceExpressed,
	emitMindSynced,
	emitEstop,
};
