// IrlRoom — the realtime broadcast hub for the three.ws /irl world (D1).
//
// Unlike WalkRoom, this room is NOT the source of truth. Neon (via the Vercel API
// at /api/irl/pins) owns the pins; this room is a live mirror of the pins inside
// one geocell window, so every viewer standing in that cell sees a place / move /
// remove the instant it happens instead of on their next poll.
//
// Data flow:
//   - onCreate loads the cell's current pins from the API into state.pins.
//   - A Vercel POST/PATCH/DELETE on a pin fires the signed /internal/irl-publish
//     webhook → irlRegistry.dispatch → this room's applyPublish() patches the
//     MapSchema → Colyseus delta-broadcasts to everyone in the room.
//   - A late joiner is handed the whole MapSchema on connect (schema sync), so it
//     never misses pins that were placed before it arrived.
//
// The room holds a 3×3 geocell window (centre + up to 8 neighbours) so a pin that
// straddles a cell edge within the client's nearby radius is still present in the
// stream; the client does the final per-viewer radius filtering.
//
// Presence (live viewers) is D2 — this room defines the `viewers` map but writes
// no entries yet. Interaction reactions are D3. Moderation / caps are D4.

import { Room } from '@colyseus/core';

import { IrlPin, IrlState } from '../irl-schemas.js';
import { encodeGeohash, geohashNeighbors, decodeGeohashBounds } from '../geohash.js';
import { irlRegistry } from '../irl-registry.js';

// The three.ws API this server reads authoritative pins from. Mirrors
// persistence.js / WalkRoom's WORLD_API_BASE — the multiplayer process has no DB
// of its own; Neon is reached only through the Vercel API.
const API_BASE = (process.env.WORLD_API_BASE || 'https://three.ws').replace(/\/$/, '');

const GEOCELL_RE = /^[0-9bcdefghjkmnpqrstuvwxyz]{6}$/; // precision-6 base32 (no a/i/l/o)
const PATCH_RATE_MS = 100;        // 10 Hz delta flush — well under the ~1 s liveness target
const MAX_CLIENTS = 200;          // a busy real-world spot; viewers only receive broadcasts
const MAX_PINS = 500;             // hard ceiling on the synced set, guards the join-time sync
const PUBLISH_TYPES = new Set(['pin:add', 'pin:update', 'pin:remove']);

// Coerce a pin from either the API's snake_case row projection (room load) or the
// webhook's camelCase wire object (publish) into the IrlPin field set, clamped so
// a single oversized field can't bloat the synced state handed to every viewer.
function coercePin(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const id = String(raw.id || '').slice(0, 64);
	if (!id) return null;
	const lat = Number(raw.lat);
	const lng = Number(raw.lng);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	const str = (v, max) => (v == null ? '' : String(v).slice(0, max));
	let placedAt = 0;
	if (Number.isFinite(Number(raw.placedAt))) placedAt = Number(raw.placedAt);
	else if (raw.placed_at) { const t = Date.parse(raw.placed_at); if (Number.isFinite(t)) placedAt = t; }
	const headingRaw = Number(raw.heading);
	return {
		id,
		lat,
		lng,
		heading: Number.isFinite(headingRaw) ? ((Math.round(headingRaw) % 360) + 360) % 360 : 0,
		avatarUrl: str(raw.avatarUrl ?? raw.avatar_url, 1024),
		avatarName: str(raw.avatarName ?? raw.avatar_name, 64),
		caption: str(raw.caption, 200),
		x402Endpoint: str(raw.x402Endpoint ?? raw.x402_endpoint, 512),
		agentId: str(raw.agentId ?? raw.agent_id, 64),
		placedAt,
	};
}

export class IrlRoom extends Room {
	constructor() {
		super();
		this.maxClients = MAX_CLIENTS;
		this.geocell = '';
		this.window = new Set(); // centre + neighbour cells this room mirrors
	}

	async onCreate(options) {
		const cell = String(options?.geocell || '').toLowerCase();
		this.geocell = GEOCELL_RE.test(cell) ? cell : '';

		this.setState(new IrlState());
		this.state.geocell = this.geocell;
		this.setPatchRate(PATCH_RATE_MS);
		this.autoDispose = true;

		// The cells this room is responsible for: its centre plus the 8 neighbours.
		this.window = new Set([this.geocell, ...geohashNeighbors(this.geocell)].filter(Boolean));

		// Register so the publish webhook can reach this room (by centre cell).
		if (this.geocell) irlRegistry.register(this.geocell, this);

		// Hydrate the current live pins for this window from the authoritative API
		// before the first client renders, so newcomers drop into the real world —
		// not an empty one that fills in only as future changes arrive.
		if (this.geocell) {
			try {
				await this._loadPins();
			} catch (err) {
				console.warn(`[irl_world ${this.roomId} cell=${this.geocell}] pin load failed:`, err?.message);
			}
		}

		console.log(`[irl_world ${this.roomId} cell=${this.geocell || 'invalid'}] created (${this.state.pins.size} pins)`);
	}

	async _loadPins() {
		// Bounding box of the 3×3 window (centre + neighbours). A box query reuses the
		// API's lat/lng index and needs no geohash decode server-side — the window is
		// a coarse pre-filter; the client does the final per-viewer radius filtering.
		const bbox = this._windowBounds();
		if (!bbox) return;
		const url = `${API_BASE}/api/irl/pins?bbox=${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
		const res = await fetch(url, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = await res.json();
		const pins = Array.isArray(body?.pins) ? body.pins : [];
		for (const raw of pins) {
			if (this.state.pins.size >= MAX_PINS) break;
			const p = coercePin(raw);
			if (p && !this.state.pins.has(p.id)) this.state.pins.set(p.id, this._toSchema(p));
		}
	}

	// Union of the decoded bounds of every cell in this room's window → the lat/lng
	// box the API hydration query selects.
	_windowBounds() {
		let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
		for (const cell of this.window) {
			const b = decodeGeohashBounds(cell);
			if (b.latMin < minLat) minLat = b.latMin;
			if (b.lngMin < minLng) minLng = b.lngMin;
			if (b.latMax > maxLat) maxLat = b.latMax;
			if (b.lngMax > maxLng) maxLng = b.lngMax;
		}
		if (!Number.isFinite(minLat)) return null;
		return { minLat, minLng, maxLat, maxLng };
	}

	_toSchema(p) {
		const pin = new IrlPin();
		pin.id = p.id;
		pin.lat = p.lat;
		pin.lng = p.lng;
		pin.heading = p.heading;
		pin.avatarUrl = p.avatarUrl;
		pin.avatarName = p.avatarName;
		pin.caption = p.caption;
		pin.x402Endpoint = p.x402Endpoint;
		pin.agentId = p.agentId;
		pin.placedAt = p.placedAt;
		return pin;
	}

	// Apply a publish webhook to the synced state. Called by irlRegistry.dispatch
	// for every room whose window covers the pin's cell. A remove deletes the entry;
	// an add (re)writes the full pin; an update on an EXISTING pin is a partial merge
	// — only the fields present in the payload change, so a re-skin that carries just
	// { id, avatarUrl } can't blank the caption/name. Colyseus then delta-broadcasts
	// only what actually changed. (The placer's own client filters its own pin out,
	// see src/irl.js.)
	applyPublish(type, raw) {
		if (!PUBLISH_TYPES.has(type)) return;

		if (type === 'pin:remove') {
			const id = String(raw?.id || '').slice(0, 64);
			if (id) this.state.pins.delete(id);
			return;
		}

		const id = String(raw?.id || '').slice(0, 64);
		if (!id) return;
		const existing = this.state.pins.get(id);

		// Full write: a fresh placement, or an update for a pin this room hasn't seen
		// yet (it joined the window between this room's load and now).
		if (type === 'pin:add' || !existing) {
			const p = coercePin(raw);
			if (!p) return;
			if (existing) { this._assignFull(existing, p); return; }
			if (this.state.pins.size >= MAX_PINS) return; // guard the synced set
			this.state.pins.set(id, this._toSchema(p));
			return;
		}

		// Partial update of an existing pin — only the provided fields move.
		this._applyPartial(existing, raw);
	}

	_assignFull(pin, p) {
		pin.lat = p.lat;
		pin.lng = p.lng;
		pin.heading = p.heading;
		pin.avatarUrl = p.avatarUrl;
		pin.avatarName = p.avatarName;
		pin.caption = p.caption;
		pin.x402Endpoint = p.x402Endpoint;
		pin.agentId = p.agentId;
		pin.placedAt = p.placedAt;
	}

	// Merge only the fields actually present in a partial pin:update wire object
	// (camelCase, as the API's pinWire emits), clamped the same way as a full coerce.
	_applyPartial(pin, raw) {
		const lat = Number(raw.lat);
		const lng = Number(raw.lng);
		if (Number.isFinite(lat)) pin.lat = lat;
		if (Number.isFinite(lng)) pin.lng = lng;
		if (raw.heading !== undefined) {
			const h = Number(raw.heading);
			if (Number.isFinite(h)) pin.heading = ((Math.round(h) % 360) + 360) % 360;
		}
		if (raw.avatarUrl !== undefined) pin.avatarUrl = String(raw.avatarUrl || '').slice(0, 1024);
		if (raw.avatarName !== undefined) pin.avatarName = String(raw.avatarName || '').slice(0, 64);
		if (raw.caption !== undefined) pin.caption = String(raw.caption || '').slice(0, 200);
		if (raw.x402Endpoint !== undefined) pin.x402Endpoint = String(raw.x402Endpoint || '').slice(0, 512);
		if (raw.agentId !== undefined) pin.agentId = String(raw.agentId || '').slice(0, 64);
		// placedAt is immutable for a given pin; never patched.
	}

	onJoin(client, options) {
		// Bind the join context for D2 presence (lat/lng → cell-jittered marker) and
		// so a future moderation pass (D4) can attribute actions. D1 only reads pins,
		// so we store it but write nothing to the synced state yet.
		client.userData = {
			deviceToken: typeof options?.deviceToken === 'string' ? options.deviceToken.slice(0, 80) : '',
			agentId: typeof options?.agent === 'string' ? options.agent.slice(0, 64) : '',
		};
	}

	onDispose() {
		if (this.geocell) irlRegistry.unregister(this.geocell, this);
		console.log(`[irl_world ${this.roomId} cell=${this.geocell || 'invalid'}] disposed`);
	}
}

// Re-exported so callers (and tests) can derive a centre cell without importing
// geohash separately. Keeps the room's precision the single source of truth.
export { encodeGeohash };
