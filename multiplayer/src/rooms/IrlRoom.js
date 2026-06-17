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
// Presence (live viewers) is D2 — onJoin adds a viewer at the cell centre +
// bounded jitter (NEVER precise GPS), heartbeats refresh it, and a reaper prunes
// the stale ones; Colyseus delta-broadcasts the `viewers` map so every client
// derives the "N viewing nearby" count and optional ghost markers for free.
// Interaction reactions are D3. Moderation / caps are D4.

import { Room } from '@colyseus/core';

import { IrlPin, IrlViewer, IrlState } from '../irl-schemas.js';
import { encodeGeohash, geohashNeighbors, decodeGeohashBounds, decodeGeohash } from '../geohash.js';
import { irlRegistry } from '../irl-registry.js';
import { multiplayerSecret } from '../irl-publish-auth.js';
import {
	isReactionType,
	reactionAllowed,
	pruneReactionLedger,
	REACTION_LEDGER_MAX,
} from '../irl-reactions.js';

// The three.ws API this server reads authoritative pins from. Mirrors
// persistence.js / WalkRoom's WORLD_API_BASE — the multiplayer process has no DB
// of its own; Neon is reached only through the Vercel API.
const API_BASE = (process.env.WORLD_API_BASE || 'https://three.ws').replace(/\/$/, '');

const GEOCELL_RE = /^[0-9bcdefghjkmnpqrstuvwxyz]{6}$/; // precision-6 base32 (no a/i/l/o)
const PATCH_RATE_MS = 100;        // 10 Hz delta flush — well under the ~1 s liveness target
const MAX_CLIENTS = 200;          // a busy real-world spot; viewers only receive broadcasts
const MAX_PINS = 500;             // hard ceiling on the synced set, guards the join-time sync
const PUBLISH_TYPES = new Set(['pin:add', 'pin:update', 'pin:remove']);

// ── D2 presence tuning ───────────────────────────────────────────────────────
const HEARTBEAT_STALE_MS = 30_000; // drop a viewer this long without a heartbeat
const REAPER_INTERVAL_MS = 10_000; // sweep cadence (≤ stale window, so a drop lands < HEARTBEAT_STALE_MS + this)
const MAX_VIEWERS = 200;           // cap the synced presence set (matches MAX_CLIENTS)
const GHOST_AVATAR_MAX = 1024;     // clamp a shared avatar URL, same ceiling as a pin's
// Fraction of a cell's half-extent to jitter a viewer's marker within. < 1 keeps
// the marker inside the cell it claims, while spreading co-located viewers apart
// so two ghosts never stack perfectly. The jitter is set once on join and never
// moves (a heartbeat only refreshes heading/tsServer), so a ghost holds still.
const VIEWER_JITTER_FRAC = 0.55;

// Normalize an arbitrary heading input to an integer compass bearing 0–359, or 0.
function coerceHeading(v) {
	const n = Number(v);
	return Number.isFinite(n) ? ((Math.round(n) % 360) + 360) % 360 : 0;
}

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
		...coerceRoom(raw),
	};
}

// Room-frame fields (append-only). Carried through realtime so a shared cluster
// renders from its exact relative offsets, not each pin's noisy GPS. Accepts the
// API's snake_case row (room load) or the webhook's camelCase wire (publish), and
// clamps the offset to a building-scale ceiling so the synced state can't be bent
// into a cross-map jump. A missing/empty roomId yields a legacy standalone pin.
const ROOM_ID_RE = /^[a-z0-9-]{1,64}$/;
const REL_MAX_M = 500;
function coerceRoom(raw) {
	const roomId = String(raw.roomId ?? raw.room_id ?? '').slice(0, 64);
	if (!roomId || !ROOM_ID_RE.test(roomId)) {
		return { roomId: '', relEast: 0, relNorth: 0, originLat: 0, originLng: 0, originYawDeg: 0 };
	}
	const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
	const clampRel = (v) => Math.max(-REL_MAX_M, Math.min(REL_MAX_M, num(v)));
	const oLat = num(raw.originLat ?? raw.origin_lat);
	const oLng = num(raw.originLng ?? raw.origin_lng);
	// An invalid origin demotes the pin to standalone rather than placing a room at 0,0.
	if (!(oLat >= -90 && oLat <= 90 && oLng >= -180 && oLng <= 180) || (oLat === 0 && oLng === 0)) {
		return { roomId: '', relEast: 0, relNorth: 0, originLat: 0, originLng: 0, originYawDeg: 0 };
	}
	return {
		roomId,
		relEast: clampRel(raw.relEast ?? raw.rel_east_m),
		relNorth: clampRel(raw.relNorth ?? raw.rel_north_m),
		originLat: oLat,
		originLng: oLng,
		originYawDeg: ((num(raw.originYawDeg ?? raw.origin_yaw_deg) % 360) + 360) % 360,
	};
}

export class IrlRoom extends Room {
	constructor() {
		super();
		this.maxClients = MAX_CLIENTS;
		this.geocell = '';
		this.window = new Set(); // centre + neighbour cells this room mirrors
		// D3 debounce ledger: `${sessionId} ${pinId}` → lastTs of the last open/view
		// reaction, so a jittery tap can't spam every co-located phone (pay/message
		// bypass this entirely). Pruned when it crosses REACTION_LEDGER_MAX.
		this._reactionLedger = new Map();
	}

	async onCreate(options) {
		const cell = String(options?.geocell || '').toLowerCase();
		this.geocell = GEOCELL_RE.test(cell) ? cell : '';

		this.setState(new IrlState());
		this.state.geocell = this.geocell;
		this.setPatchRate(PATCH_RATE_MS);
		this.autoDispose = true;

		// D3 — a viewer interacted with a pin in this cell. Fan an ambient `reaction`
		// to everyone here so the agent visibly emotes for bystanders. This is the
		// flourish only; the durable record + owner notification ride the REST
		// `/api/irl/interactions` path, so we never write the DB here (no double count).
		this.onMessage('interaction', (client, payload) => this._handleInteraction(client, payload));

		// D2 presence — a heartbeat refreshes liveness + facing (so a backgrounded
		// tab that stops firing is reaped), and set_ghost flips a viewer's "appear to
		// others" opt-in live so the marker shows/hides without a reconnect.
		this.onMessage('heartbeat', (client, payload) => this._handleHeartbeat(client, payload));
		this.onMessage('set_ghost', (client, payload) => this._handleSetGhost(client, payload));

		// Reaper: drop viewers whose last heartbeat is stale. Covers silent
		// disconnects and backgrounded mobile tabs that never fire onLeave. The
		// clock is owned by the room and torn down automatically on dispose.
		this.clock.setInterval(() => this._reapStaleViewers(), REAPER_INTERVAL_MS);

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
		// The bbox feed is internal-only (it would otherwise be a bulk GPS-scrape
		// vector). Present the shared multiplayer secret so the API trusts this as
		// server-to-server room hydration rather than a public read.
		const res = await fetch(url, {
			headers: { accept: 'application/json', 'x-mp-internal': multiplayerSecret() },
		});
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
		pin.roomId = p.roomId;
		pin.relEast = p.relEast;
		pin.relNorth = p.relNorth;
		pin.originLat = p.originLat;
		pin.originLng = p.originLng;
		pin.originYawDeg = p.originYawDeg;
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
		pin.roomId = p.roomId;
		pin.relEast = p.relEast;
		pin.relNorth = p.relNorth;
		pin.originLat = p.originLat;
		pin.originLng = p.originLng;
		pin.originYawDeg = p.originYawDeg;
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
		// Room-frame fields move together on a room-origin calibrate (the whole
		// cluster shifts), so a pin:update carrying origin/rel re-merges them. Reuse
		// the same coerce/clamp; only overwrite when the payload actually re-states
		// a valid room (an empty/invalid room block leaves the existing frame intact).
		if (raw.roomId !== undefined || raw.relEast !== undefined || raw.originLat !== undefined) {
			const r = coerceRoom(raw);
			if (r.roomId) {
				pin.roomId = r.roomId;
				pin.relEast = r.relEast;
				pin.relNorth = r.relNorth;
				pin.originLat = r.originLat;
				pin.originLng = r.originLng;
				pin.originYawDeg = r.originYawDeg;
			}
		}
		// placedAt is immutable for a given pin; never patched.
	}

	// D3 — turn a viewer's interaction into an ambient reaction for the whole cell.
	// Validates the type, requires a pin this room actually mirrors, debounces the
	// noisy open/view types per (session, pin), then broadcasts a privacy-clean
	// { pinId, type, ts } to everyone in the room (the sender included, so their own
	// tap is driven by the same authoritative event the others see). No GPS, no
	// wallet, no actor identity ever rides this channel.
	_handleInteraction(client, payload) {
		const type = typeof payload?.type === 'string' ? payload.type : '';
		if (!isReactionType(type)) return;
		const pinId = String(payload?.pinId || '').slice(0, 64);
		if (!pinId || !this.state.pins.has(pinId)) return; // only react for pins we hold

		const now = Date.now();
		if (this._reactionLedger.size > REACTION_LEDGER_MAX) {
			pruneReactionLedger(this._reactionLedger, now);
		}
		if (!reactionAllowed(this._reactionLedger, client.sessionId, pinId, type, now)) return;

		this.broadcast('reaction', { pinId, type, ts: now }, { afterNextPatch: false });
	}

	onJoin(client, options) {
		// Bind the join context: the device token (D4 moderation attribution) and the
		// agent this viewer embodies. Nothing here ever reaches the synced state.
		client.userData = {
			deviceToken: typeof options?.deviceToken === 'string' ? options.deviceToken.slice(0, 80) : '',
			agentId: typeof options?.agent === 'string' ? options.agent.slice(0, 64) : '',
		};

		// D2 presence — add this viewer to the synced map so everyone in the cell
		// gets the live count (and, if they opted in, a ghost marker). The position
		// is the viewer's OWN precision-6 cell centre plus bounded jitter, computed
		// here and the raw GPS immediately discarded: the only location that leaves
		// the server is "somewhere in this ~1 km cell." Guarded by MAX_VIEWERS so a
		// flood can't bloat the state handed to every client.
		if (this.state.viewers.size >= MAX_VIEWERS) return;
		const ghost = options?.ghost === true;
		const viewer = new IrlViewer();
		viewer.id = client.sessionId;
		const pos = this._coarseViewerPos(Number(options?.lat), Number(options?.lng));
		viewer.lat = pos.lat;
		viewer.lng = pos.lng;
		viewer.agentId = client.userData.agentId;
		viewer.heading = coerceHeading(options?.heading);
		viewer.ghost = ghost;
		// A viewer only reveals an avatar when they opted into being seen.
		viewer.avatar = ghost && typeof options?.avatar === 'string' ? options.avatar.slice(0, GHOST_AVATAR_MAX) : '';
		viewer.tsServer = Date.now();
		this.state.viewers.set(client.sessionId, viewer);
	}

	onLeave(client) {
		this.state.viewers.delete(client.sessionId);
	}

	// Heartbeat: prove the viewer is still here and refresh their facing. Updating
	// tsServer is what keeps the reaper from dropping them; heading rides along so a
	// shared ghost can be oriented. Never touches position — the join-time jitter is
	// the viewer's fixed coarse spot.
	_handleHeartbeat(client, payload) {
		const viewer = this.state.viewers.get(client.sessionId);
		if (!viewer) return;
		viewer.tsServer = Date.now();
		if (payload && payload.heading !== undefined) viewer.heading = coerceHeading(payload.heading);
	}

	// Live opt-in toggle: flip whether this viewer is rendered as a ghost for others
	// and carry the avatar to show (cleared the moment they opt out), so "Appear to
	// others nearby" takes effect immediately without a room rejoin.
	_handleSetGhost(client, payload) {
		const viewer = this.state.viewers.get(client.sessionId);
		if (!viewer) return;
		const ghost = payload?.ghost === true;
		viewer.ghost = ghost;
		viewer.avatar = ghost && typeof payload?.avatar === 'string' ? payload.avatar.slice(0, GHOST_AVATAR_MAX) : '';
		viewer.tsServer = Date.now();
	}

	// Snap a viewer's reported GPS to their own precision-6 cell centre and add
	// bounded jitter so the stored/broadcast coordinate is coarse by construction.
	// Falls back to this room's centre cell when the GPS is missing/invalid, so a
	// viewer with no fix still counts (at the cell centre) rather than at (0,0).
	_coarseViewerPos(lat, lng) {
		let cell = this.geocell;
		if (Number.isFinite(lat) && Number.isFinite(lng)) {
			const own = encodeGeohash(lat, lng, 6);
			if (GEOCELL_RE.test(own)) cell = own;
		}
		const c = decodeGeohash(cell || this.geocell || '');
		const jLat = (Math.random() * 2 - 1) * c.latErr * VIEWER_JITTER_FRAC;
		const jLng = (Math.random() * 2 - 1) * c.lngErr * VIEWER_JITTER_FRAC;
		return { lat: c.lat + jLat, lng: c.lng + jLng };
	}

	// Drop viewers whose last heartbeat is older than the stale window. The client
	// heartbeats every 15 s, so a live viewer never trips this; only a silent drop
	// (closed laptop, backgrounded tab that stopped firing) does, within one sweep.
	_reapStaleViewers() {
		const cutoff = Date.now() - HEARTBEAT_STALE_MS;
		for (const [id, viewer] of this.state.viewers) {
			if (viewer.tsServer < cutoff) this.state.viewers.delete(id);
		}
	}

	onDispose() {
		if (this.geocell) irlRegistry.unregister(this.geocell, this);
		this._reactionLedger.clear();
		console.log(`[irl_world ${this.roomId} cell=${this.geocell || 'invalid'}] disposed`);
	}
}

// Re-exported so callers (and tests) can derive a centre cell without importing
// geohash separately. Keeps the room's precision the single source of truth.
export { encodeGeohash };
