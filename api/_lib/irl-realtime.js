// IRL realtime fan-out — the single server-side emit point for pin lifecycle
// events that co-located viewers react to in real time.
//
// Epic D owns the actual WS/geohash transport. Until it lands, this is a hook,
// not a live channel: it computes the geohash room a change belongs to and the
// minimal payload a viewer needs to swap a pin's rendered GLB in place, then
// hands them to whatever transport is wired (none yet). The DURABLE contract is
// the poll path — src/irl.js loadNearbyPins diffs avatar_version on its next
// cycle and swaps the GLB — so propagation is correct with or without D1; this
// hook only makes it feel instant once realtime exists.
//
// Wiring D1: implement publishPinEvent() to push `event` to room `irl:<room>`
// (e.g. d1.publish(`irl:${room}`, event)). Every caller already routes through
// here, so that one function is the only thing realtime has to fill in.

import { encodeGeohash } from './geohash.js';

// ~1.2 km cells (precision 6) — coarse enough that a viewer within the 150 m
// nearby radius always shares (or borders) the changed pin's room, fine enough
// that a city-wide change doesn't wake every client. The transport can fan a
// change out to the cell plus its 8 neighbours when it lands; the poll fallback
// covers any edge a single cell misses.
const ROOM_PRECISION = 6;

function roomFor(lat, lng) {
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return encodeGeohash(lat, lng, ROOM_PRECISION) || null;
}

// D1 transport: a re-skin is a PARTIAL pin:update carrying only the new
// avatar_url, so the geocell room swaps the GLB without disturbing the pin's
// other live fields. Best-effort — the import is lazy so this file stays cheap to
// load, and any transport error is swallowed by the caller (Rule 9: a realtime
// hiccup must never fail the owner's save; the poll path still propagates).
async function publishPinEvent(room, event) {
	if (!room || !event?.id) return false;
	const pin = { id: event.id };
	if (event.avatar_url) pin.avatarUrl = event.avatar_url;
	const { publishIrlPin } = await import('./irl-publish.js');
	const res = await publishIrlPin('pin:update', room, pin);
	return !!res?.delivered;
}

/**
 * Emit a `pin_updated` event so co-located viewers swap a re-skinned pin's GLB
 * without waiting for their next nearby poll. Best-effort and non-throwing —
 * the caller never awaits propagation, and the poll path is authoritative.
 *
 * @param {object} pin { id, lat, lng, avatar_url, avatar_version }
 * @returns {{ room: string|null, event: object }} the room + payload that was emitted
 */
export function emitPinUpdated(pin) {
	const room = roomFor(Number(pin?.lat), Number(pin?.lng));
	const event = {
		type: 'pin_updated',
		id: pin?.id,
		avatar_url: pin?.avatar_url ?? null,
		avatar_version: Number(pin?.avatar_version) || 0,
	};
	if (room) {
		// Fire-and-forget; swallow transport errors (Rule 9 — a realtime hiccup
		// must never fail the owner's save, and the poll fallback still propagates).
		Promise.resolve(publishPinEvent(room, event)).catch(() => {});
	}
	return { room, event };
}
