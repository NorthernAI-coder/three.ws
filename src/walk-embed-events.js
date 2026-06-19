// walk-embed-events.js — the bi-directional postMessage contract between a host
// page and the three.ws walk-embed iframe.
//
// This is the single source of truth for the event protocol. Both sides of the
// boundary import (or, for the standalone SDK, mirror) the constants and helpers
// here so the wire format can never drift between the iframe and the host.
//
// ── Envelope ───────────────────────────────────────────────────────────────
// Every message is a plain object:
//   {
//     channel: 'three-walk',   // namespace guard — ignore anything else
//     v: 1,                    // protocol version
//     type: 'walk:moved',      // see INBOUND / OUTBOUND below
//     id?: '<correlation id>', // echoes a command id on its result event
//     ...payload               // type-specific fields
//   }
// The legacy flat `{ type: 'walk:*' }` shape (no channel/version) is still
// accepted on the inbound side for backward compatibility with embeds shipped
// before this module existed — see isWalkMessage().
//
// ── Handshake ──────────────────────────────────────────────────────────────
//   iframe → host : walk:loaded            (once, when the avatar is ready)
//   host   → iframe: walk:ping  (optional) → iframe replies walk:loaded again
// A host that mounts the iframe after it has already loaded can fire walk:ping
// to re-trigger the ready event instead of racing the initial walk:loaded.

export const CHANNEL = 'three-walk';
export const PROTOCOL_VERSION = 1;

// Commands a host sends INTO the iframe.
export const INBOUND = Object.freeze({
	PING: 'walk:ping',
	MOVE: 'walk:move', // { x, y, run? } analog vector, OR { dir, meters? } discrete
	GESTURE: 'walk:gesture', // { gesture: 'wave' | 'jump' | 'idle' | 'walk' | 'run' }
	SAY: 'walk:say', // { text, durationMs? }
	SET_ENVIRONMENT: 'walk:setEnvironment', // { env }
	SET_AVATAR: 'walk:setAvatar', // { id }
	SET_CONFIG: 'walk:config', // { speed? }
	RESET: 'walk:reset',
});

// Events the iframe emits OUT to the host.
export const OUTBOUND = Object.freeze({
	LOADED: 'walk:loaded', // { avatar }
	MOVED: 'walk:moved', // { x, z, yaw, motion }
	SPOKE: 'walk:spoke', // { text }
	GESTURE: 'walk:gestured', // { gesture }
	ENVIRONMENT: 'walk:environment', // { env }
	AVATAR_CHANGED: 'walk:avatarChanged', // { id }
	ERROR: 'walk:error', // { error, code? }
});

// ── Legacy aliases ───────────────────────────────────────────────────────────
// Older embeds spoke walk:ready / walk:position / walk:narrate / walk:setEnv /
// walk:setMotion. We accept those names on input and (for the two outbound ones
// hosts may already listen for) also emit them, so no existing integration
// breaks when this contract lands.
const INBOUND_ALIASES = Object.freeze({
	'walk:setEnv': INBOUND.SET_ENVIRONMENT,
	'walk:setMotion': INBOUND.GESTURE,
	'walk:narrate': INBOUND.SAY,
	'walk:resetPose': INBOUND.RESET,
});

const ALL_INBOUND = new Set([...Object.values(INBOUND), ...Object.keys(INBOUND_ALIASES)]);
const ALL_OUTBOUND = new Set(Object.values(OUTBOUND));
const ALL_TYPES = new Set([...ALL_INBOUND, ...ALL_OUTBOUND, 'walk:ready', 'walk:position', 'walk:narrateEnd']);

// ── Origin allow-listing ─────────────────────────────────────────────────────
// The walk embed is designed to be dropped onto ANY origin (it ships
// `frame-ancestors *`), so the host page's origin can be anything. We therefore
// cannot allow-list the host. What we DO validate is the message *source*: the
// iframe only accepts messages whose source window is its own parent, and the
// host SDK only accepts messages whose source is the iframe it mounted. That
// source check (done by the caller) is the real authentication; the optional
// `allowedOrigins` list below is a belt-and-suspenders filter a security-
// conscious integrator can opt into when they know the embed's exact origin.
export function makeOriginAllowList(origins) {
	if (!origins || origins === '*') return () => true;
	const set = new Set((Array.isArray(origins) ? origins : [origins]).map(normalizeOrigin));
	return (origin) => origin === 'null' /* sandboxed/file iframe */ || set.has(normalizeOrigin(origin));
}

function normalizeOrigin(o) {
	try {
		return new URL(o).origin;
	} catch {
		return String(o || '');
	}
}

// ── Envelope helpers ──────────────────────────────────────────────────────────
export function makeMessage(type, payload = {}, { id } = {}) {
	const msg = { channel: CHANNEL, v: PROTOCOL_VERSION, type, ...payload };
	if (id) msg.id = id;
	return msg;
}

// Is this a message we should handle at all? Accepts the new channelled
// envelope AND the legacy flat `walk:*` shape so old hosts keep working.
export function isWalkMessage(data) {
	if (!data || typeof data !== 'object') return false;
	if (data.channel === CHANNEL) return typeof data.type === 'string';
	// Legacy: any object whose `type` is a known walk event.
	return typeof data.type === 'string' && ALL_TYPES.has(data.type);
}

// Normalize an inbound command to its canonical type, resolving legacy aliases.
export function canonicalInboundType(type) {
	if (INBOUND_ALIASES[type]) return INBOUND_ALIASES[type];
	return ALL_INBOUND.has(type) ? type : null;
}

// ── Inbound command validation (runs inside the iframe) ──────────────────────
// Returns { type, payload } on success or { error } describing the rejection.
// Trusts nothing: clamps numbers, bounds strings, rejects unknown shapes. This
// is the boundary between the untrusted host page and the embed's runtime.
const ENV_IDS = new Set(['studio', 'void', 'beach', 'sunset', 'night', 'grid']);
const GESTURES = new Set(['idle', 'walk', 'run', 'wave', 'jump']);
const DIRECTIONS = new Set(['forward', 'back', 'left', 'right']);
const SAY_MAX = 280;

export function validateInbound(raw) {
	const type = canonicalInboundType(raw?.type);
	if (!type) return { error: `unknown command: ${raw?.type}` };
	const id = typeof raw.id === 'string' ? raw.id.slice(0, 64) : undefined;

	switch (type) {
		case INBOUND.PING:
		case INBOUND.RESET:
			return { type, id, payload: {} };

		case INBOUND.MOVE: {
			// Two accepted shapes: analog { x, y, run } or discrete { dir, meters }.
			if (typeof raw.dir === 'string') {
				if (!DIRECTIONS.has(raw.dir)) return { error: `move.dir must be one of ${[...DIRECTIONS].join('/')}` };
				const meters = clamp(num(raw.meters, 1), 0, 12);
				return { type, id, payload: { dir: raw.dir, meters } };
			}
			const x = clamp(num(raw.x, 0), -1, 1);
			const y = clamp(num(raw.y, 0), -1, 1);
			const run = raw.run === true;
			return { type, id, payload: { x, y, run } };
		}

		case INBOUND.GESTURE: {
			const g = raw.gesture ?? raw.motion; // legacy walk:setMotion used `motion`
			if (!GESTURES.has(g)) return { error: `gesture must be one of ${[...GESTURES].join('/')}` };
			return { type, id, payload: { gesture: g } };
		}

		case INBOUND.SAY: {
			const text = typeof raw.text === 'string' ? raw.text.slice(0, SAY_MAX) : '';
			if (!text.trim()) return { error: 'say.text required' };
			const durationMs = raw.durationMs == null ? undefined : clamp(num(raw.durationMs, 0), 800, 20000);
			return { type, id, payload: { text, durationMs } };
		}

		case INBOUND.SET_ENVIRONMENT: {
			const e = String(raw.env || '').toLowerCase();
			if (!ENV_IDS.has(e)) return { error: `env must be one of ${[...ENV_IDS].join('/')}` };
			return { type, id, payload: { env: e } };
		}

		case INBOUND.SET_AVATAR: {
			const avatarId = typeof raw.id === 'string' ? raw.id : (typeof raw.avatar === 'string' ? raw.avatar : '');
			// `id` here is the avatar id, which doubles as the correlation id slot —
			// keep them separate: avatar id can be a URL/uuid, correlation id is short.
			if (!avatarId || avatarId.length > 2048) return { error: 'setAvatar.id required' };
			return { type, id: undefined, payload: { id: avatarId } };
		}

		case INBOUND.SET_CONFIG: {
			const payload = {};
			if (raw.speed != null) payload.speed = clamp(num(raw.speed, 1), 0.3, 3);
			return { type, id, payload };
		}

		default:
			return { error: `unhandled command: ${type}` };
	}
}

function num(v, fallback) {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : fallback;
}
function clamp(n, lo, hi) {
	return Math.min(hi, Math.max(lo, n));
}
