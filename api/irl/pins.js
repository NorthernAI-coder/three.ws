/**
 * IRL GPS Pins — place 3D agents at real-world GPS coordinates.
 *
 * GET    /api/irl/pins?lat=&lng=&radius=150        nearby pins (public)
 * GET    /api/irl/pins/mine?deviceToken=           my pins (device token or auth)
 * GET    /api/irl/pins?mine=1                      my pins (auth required)
 * POST   /api/irl/pins  { lat, lng, heading, avatarUrl, avatarName, caption, agentId }
 * PATCH  /api/irl/pins  { id, caption, avatarUrl, avatarName, lat, lng }  edit pin (auth required)
 * PATCH  /api/irl/pins  { id, deviceToken, calibrate:{ lat, lng, anchorYawDeg, anchorHeightM } }
 *                                                  owner-gated, bounds-checked pose nudge (A3)
 * DELETE /api/irl/pins?id=                         remove own pin (device_token or auth)
 * POST   /api/irl/pins/interact { pinId, event, deviceToken }  log a tap/view
 */

import { cors, json, wrap, rateLimited } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { WORD_BLACKLIST } from '../../src/profanity.js';
import { guardianConfig, assess, decide } from '../_lib/granite-guardian.js';
import { encodeGeohash } from '../_lib/geohash.js';
import { publishIrlPin } from '../_lib/irl-publish.js';
import { validateAppearance } from '../_lib/accessories.js';
import { emitPinUpdated } from '../_lib/irl-realtime.js';

// ── Moderation, safety & density caps (D4) ──────────────────────────────────
// Everything below makes the public, shared IRL world safe to launch: content
// gating on caption/name, a $THREE-only coin guard, an x402 endpoint allow-list,
// per-area density caps, and per-owner active-pin caps. Each rejection returns a
// designed error code the client surfaces as an actionable message.

const CAPTION_MAX = 140;          // public caption hard length cap
const NAME_MAX    = 40;           // avatar name hard length cap
const GEOCELL_PRECISION = 7;      // ~153m × 153m density cell
const MAX_PINS_PER_CELL = 40;     // density ceiling per geocell7
const MAX_PINS_PER_OWNER_ANON   = 20;  // active pins for an anonymous device
const MAX_PINS_PER_OWNER_SIGNED = 60;  // higher ceiling once accountable (signed in)

// $THREE is the only coin three.ws references (contract below). The off-brand
// guard is written generically — it never names a competing ticker — so this
// codebase stays clean of other coins while still rejecting shills.
const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

// Always-on hard gate: lower-case substring match against the shared slur/severe
// list. No external dependency, fails closed and fast — the floor under the
// smarter Guardian tier. Reused verbatim from the pump.fun feed filter.
export function hardBlocked(text) {
	const t = String(text || '').toLowerCase();
	return WORD_BLACKLIST.some((w) => t.includes(w));
}

// Off-brand-coin guard: reject text that shills a token other than $THREE — a
// `$TICKER` cashtag that isn't $THREE, or a pump.fun-style mint address (…pump)
// that isn't the $THREE contract. Generic by construction so no competitor is
// ever written into source; $THREE (cashtag or contract) is explicitly allowed.
export function namesOffBrandCoin(text) {
	const t = String(text || '');
	const cashtags = t.match(/\$[A-Za-z][A-Za-z0-9]{1,9}\b/g) || [];
	if (cashtags.some((c) => c.slice(1).toUpperCase() !== 'THREE')) return true;
	const tokens = t.match(/\b[1-9A-HJ-NP-Za-km-z]{32,48}\b/g) || [];
	if (tokens.some((m) => /pump$/.test(m) && m !== THREE_MINT)) return true;
	return false;
}

// Tier-1 content decision over caption + name. Returns the offending field +
// reason, or null when clean. Pure string work — the cheapest, most decisive gate.
function contentReject(caption, name) {
	if (hardBlocked(caption)) return { field: 'caption', reason: 'blocked' };
	if (hardBlocked(name))    return { field: 'avatarName', reason: 'blocked' };
	if (namesOffBrandCoin(caption)) return { field: 'caption', reason: 'coin' };
	if (namesOffBrandCoin(name))    return { field: 'avatarName', reason: 'coin' };
	return null;
}

// Tier-2 AI content risk over the free-text caption — Granite Guardian. Best-
// effort by design (Rule 9): when watsonx isn't configured, or the classifier
// errors/times out, we DON'T block — the always-on wordlist already caught the
// hard cases, and a missing key must never 500 a placement. Bounded to 4s so a
// slow upstream can't stall the POST.
async function guardianFlags(caption) {
	const text = String(caption || '').trim();
	if (!text) return false;
	const cfg = guardianConfig();
	if (!cfg.configured) return false;
	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 4000);
		try {
			const verdicts = await assess(cfg, {
				input: text,
				risks: ['harm', 'social_bias', 'violence', 'sexual_content'],
				signal: ctrl.signal,
			});
			return decide(verdicts).decision === 'block';
		} finally {
			clearTimeout(timer);
		}
	} catch (err) {
		console.warn('[irl/pins] guardian content check degraded:', err?.message || err);
		return false;
	}
}

// x402 pay-endpoint allow-list (D4). A pin's advertised "pay" target is handed to
// every nearby viewer's Pay button, so an arbitrary external URL is a drain/scam
// vector. On top of safeRemoteUrl's https + no-private-host checks, the host must
// be first-party three.ws infrastructure (or an operator-extended allow-list via
// IRL_X402_ALLOWED_HOSTS). Relative same-origin paths are always first-party.
// Registered-agent endpoints still flow to the Pay button via the trusted
// server-resolved agent-card path (card.x402_endpoint), which this never gates.
const X402_ALLOWED_HOSTS = (
	process.env.IRL_X402_ALLOWED_HOSTS || 'three.ws,www.three.ws,3d-agent.vercel.app,3d.irish'
)
	.split(',')
	.map((h) => h.trim().toLowerCase())
	.filter(Boolean);

export function safePaymentEndpoint(raw) {
	// allowRelative so a same-origin path (unambiguously first-party three.ws)
	// passes; safeRemoteUrl still enforces https + no-private-host on absolute URLs.
	const base = safeRemoteUrl(raw, { allowRelative: true });
	if (!base.ok) return { ok: false };
	if (base.value == null) return { ok: true, value: null };
	if (base.value.startsWith('/')) return { ok: true, value: base.value };
	let host;
	try { host = new URL(base.value).hostname.toLowerCase(); } catch { return { ok: false }; }
	const allowed = X402_ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
	return allowed ? { ok: true, value: base.value } : { ok: false };
}

// Validate a URL that will be handed to every nearby viewer's browser — the
// avatar GLB (→ GLTFLoader) and the x402 pay endpoint (→ Pay button). Same-origin
// relative paths (avatars live under /api/avatars/…) are always allowed; absolute
// URLs must be https and must not point at localhost / private / loopback hosts,
// so a placement can't aim other users' devices at an internal or attacker host.
// Returns { ok: true, value } or { ok: false }. `value` is the normalized string.
function safeRemoteUrl(raw, { allowRelative = true } = {}) {
	if (raw == null || raw === '') return { ok: true, value: null };
	const v = String(raw).trim();
	if (!v) return { ok: true, value: null };
	if (allowRelative && v.startsWith('/') && !v.startsWith('//')) return { ok: true, value: v };
	let u;
	try { u = new URL(v); } catch { return { ok: false }; }
	if (u.protocol !== 'https:') return { ok: false };
	if (u.username || u.password) return { ok: false };
	const host = u.hostname.toLowerCase();
	if (
		host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
		host === '0.0.0.0' || host === '::1' ||
		/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
		/^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
	) return { ok: false };
	return { ok: true, value: u.toString() };
}

// Haversine distance in meters between two GPS points
function haversineDist(lat1, lng1, lat2, lng2) {
	const R = 6371000;
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
		Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let _tableReady = false;
async function ensureTable() {
	if (_tableReady) return;
	await sql`
		CREATE TABLE IF NOT EXISTS irl_pins (
			id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
			user_id       UUID,
			agent_id      UUID,
			device_token  TEXT,
			lat           DOUBLE PRECISION NOT NULL,
			lng           DOUBLE PRECISION NOT NULL,
			heading       FLOAT DEFAULT 0,
			avatar_url    TEXT,
			avatar_name   TEXT,
			caption       TEXT,
			x402_endpoint TEXT,
			placed_at     TIMESTAMPTZ DEFAULT NOW(),
			expires_at    TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
		)
	`;
	await sql`CREATE INDEX IF NOT EXISTS irl_pins_lat_lng ON irl_pins (lat, lng)`;
	await sql`CREATE INDEX IF NOT EXISTS irl_pins_expires ON irl_pins (expires_at)`;
	// view_count — deduplicated visitor count; incremented by /api/irl/interactions
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS view_count BIGINT NOT NULL DEFAULT 0`;
	// Anchor pose — added 2026-06 for IRL-Live world anchoring (A2). Persisting the
	// full pose (floor height, orientation, GPS-fix trust) is the prerequisite for
	// WebXR anchors (A1), shared-spot reconciliation (A3), and gyro-lock replay (A4).
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS anchor_height_m DOUBLE PRECISION`;
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS anchor_yaw_deg  DOUBLE PRECISION`;
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS anchor_quat     JSONB`;            // [x,y,z,w], optional richer orientation
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS gps_accuracy_m  DOUBLE PRECISION`;
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS altitude_m      DOUBLE PRECISION`;
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS anchor_source   TEXT`;             // 'webxr' | 'gyro-gps'
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS vps_provider    TEXT`;             // reserved for visual positioning
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS vps_id          TEXT`;             // reserved
	// Moderation + density (D4). geocell7 is the ~150m density key (precision-7
	// geohash); hidden_at marks a pin queued out of public view after enough
	// distinct reporters — set, never deleted, so the owner can appeal and the
	// review console can restore it.
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS geocell7  TEXT`;
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ`;
	await sql`CREATE INDEX IF NOT EXISTS irl_pins_geocell7 ON irl_pins (geocell7) WHERE hidden_at IS NULL`;
	// Remote outfit change (C6) — a placed agent owns its look independent of the
	// source avatar so an owner can re-skin it for EVERY nearby viewer.
	//   avatar_manifest : the editable appearance — { colors, hidden, accessories }
	//                     (the same shape the avatar studio produces).
	//   avatar_base_url : the un-dressed GLB the manifest bakes ONTO, captured once
	//                     on the first outfit edit. Re-baking always starts from this
	//                     clean base so garment hides / accessories never stack across
	//                     edits (avatar_url stays the derived, baked GLB served today).
	//   avatar_version  : bumped on every outfit change — the cheap signal the nearby
	//                     feed/viewer diffs to swap a re-skinned pin's GLB, and a
	//                     cache-bust companion to the hash-keyed baked URL.
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS avatar_manifest JSONB`;
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS avatar_base_url TEXT`;
	await sql`ALTER TABLE irl_pins ADD COLUMN IF NOT EXISTS avatar_version  INTEGER NOT NULL DEFAULT 0`;
	_tableReady = true;
}

// ── Calibration bounds (A3) ─────────────────────────────────────────────────
// A nudge is a fine-tune, never a teleport. The client clamps to ±3 m / ±45°;
// the server re-validates with a small margin so a corrected pose can never be
// abused to move someone's agent across the map. Diagonal of a 3 m N + 3 m E
// drag is ~4.24 m, so 5 m is the tightest ceiling that never rejects a legit nudge.
const CAL_MAX_MOVE_M  = 5;    // ground-move ceiling, metres
const CAL_MAX_YAW_DEG = 46;   // yaw-nudge ceiling, degrees
const CAL_MAX_RISE_M  = 3;    // floor-height nudge ceiling, metres

// Smallest signed distance between two compass bearings, 0–180°.
function circularYawDelta(a, b) {
	let d = ((a - b) % 360 + 360) % 360;
	if (d > 180) d -= 360;
	return Math.abs(d);
}

// Owner-gated, bounds-checked pose correction. Mutates the A2 pose columns so the
// re-fetch every nearby viewer already runs picks up the corrected spot. (Pushing
// the correction to already-loaded viewers in realtime rides on D1; a re-fetch
// suffices here.) Calibration touches no coin and no third-party token.
async function handleCalibrate(res, { id, session, body }) {
	const cal = (body.calibrate && typeof body.calibrate === 'object') ? body.calibrate : {};

	const [pin] = await sql`
		SELECT id, user_id, device_token, lat, lng, heading, anchor_yaw_deg, anchor_height_m
		FROM irl_pins
		WHERE id = ${id}
	`;
	if (!pin) return json(res, 404, { error: 'not found' });

	// Ownership: the authenticated owner (user_id) or the anonymous device that
	// placed it (device_token). Anything else is denied — never silently allowed.
	const owns =
		(!!session?.id && !!pin.user_id && pin.user_id === session.id) ||
		(!!pin.device_token && !!body.deviceToken && pin.device_token === body.deviceToken);
	if (!owns) return json(res, 403, { error: 'only the owner can calibrate this agent' });

	// New ground position — required, validated, range-checked.
	const newLat = parseFloat(cal.lat);
	const newLng = parseFloat(cal.lng);
	if (!isFinite(newLat) || newLat < -90 || newLat > 90 ||
		!isFinite(newLng) || newLng < -180 || newLng > 180) {
		return json(res, 400, { error: 'invalid calibrate coordinates' });
	}
	const moved = haversineDist(pin.lat, pin.lng, newLat, newLng);
	if (moved > CAL_MAX_MOVE_M) {
		return json(res, 422, { error: 'calibration move too large', max_m: CAL_MAX_MOVE_M });
	}

	// New yaw — optional; bounded against the stored bearing.
	let newYaw = null;
	if (Number.isFinite(cal.anchorYawDeg)) {
		newYaw = ((cal.anchorYawDeg % 360) + 360) % 360;
		const storedYaw = Number.isFinite(pin.anchor_yaw_deg) ? pin.anchor_yaw_deg : (pin.heading ?? 0);
		if (circularYawDelta(newYaw, storedYaw) > CAL_MAX_YAW_DEG) {
			return json(res, 422, { error: 'calibration rotation too large', max_deg: CAL_MAX_YAW_DEG });
		}
	}

	// New floor height — optional; bounded against the stored height.
	let newHeight = null;
	if (Number.isFinite(cal.anchorHeightM)) {
		newHeight = cal.anchorHeightM;
		const baseH = Number.isFinite(pin.anchor_height_m) ? pin.anchor_height_m : 0;
		if (Math.abs(newHeight - baseH) > CAL_MAX_RISE_M || Math.abs(newHeight) > 50) {
			return json(res, 422, { error: 'calibration height too large', max_m: CAL_MAX_RISE_M });
		}
	}

	// Persist. heading stays in sync with anchor_yaw_deg so legacy clients (which
	// only read `heading`) still render the corrected bearing.
	const headingToStore = newYaw != null ? Math.round(newYaw) : null;
	const [row] = await sql`
		UPDATE irl_pins SET
			lat             = ${newLat},
			lng             = ${newLng},
			anchor_yaw_deg  = COALESCE(${newYaw}, anchor_yaw_deg),
			heading         = COALESCE(${headingToStore}, heading),
			anchor_height_m = COALESCE(${newHeight}, anchor_height_m)
		WHERE id = ${id}
		RETURNING id, lat, lng, heading, anchor_yaw_deg, anchor_height_m, gps_accuracy_m
	`;
	// Realtime (D1): a calibrate is a partial pin:update of position + heading, so
	// every nearby viewer sees the corrected spot move live instead of on re-fetch.
	void publishIrlPin('pin:update', realtimeCell(row.lat, row.lng), pinWire(row));
	return json(res, 200, { pin: row, calibrated: true });
}

// ── Remote outfit change (C6) ───────────────────────────────────────────────
// Re-skin a placed agent for EVERY nearby viewer. The owner sends the appearance
// manifest ({ colors, hidden, accessories }); we validate it against the same
// slot/preset allow-list the studio uses, bake a new GLB onto the pin's clean
// BASE avatar (never the prior bake — so layers/accessories can't stack), store
// it on the first-party CDN, bump avatar_version, and persist. Every nearby
// viewer's loadNearbyPins poll then diffs the version and swaps the GLB; D1
// (emitPinUpdated) pushes it instantly once realtime lands. A null/empty
// manifest reverts the pin to its bare base avatar.
async function handleOutfitChange(res, { id, session, body }) {
	const manifest = body.avatar_manifest ?? body.avatarManifest ?? null;
	if (manifest !== null && (typeof manifest !== 'object' || Array.isArray(manifest))) {
		return json(res, 400, { error: 'avatar_manifest must be an object or null' });
	}
	// Validate shape + preset/slot allow-list BEFORE baking, so an invented slot
	// or preset is a clean 400 and never burns a bake.
	if (manifest) {
		const err = validateAppearance(manifest);
		if (err) return json(res, 400, { error: err });
	}

	// Owner-gated: only the authenticated owner re-skins their agent. (Appearance
	// is never editable from an anonymous device token — same stance as the
	// avatar/location edits below.)
	const [pin] = await sql`
		SELECT id, user_id, avatar_url, avatar_base_url, avatar_version
		FROM irl_pins
		WHERE id = ${id}
	`;
	if (!pin) return json(res, 404, { error: 'not found' });
	if (!pin.user_id || pin.user_id !== session.id) {
		return json(res, 403, { error: "only the owner can change this agent's outfit" });
	}

	// The base GLB the manifest dresses. Captured once (the agent as it looked
	// before any outfit edit) so re-bakes always start from a clean model.
	const baseUrl = pin.avatar_base_url || pin.avatar_url;
	if (!baseUrl) return json(res, 422, { error: 'this agent has no avatar to dress' });

	let newAvatarUrl = baseUrl;
	try {
		// Lazy import: irl-bake → bake.js pulls in sharp (native libvips). Loading
		// it only on this path keeps every other pins route alive even where the
		// native module can't load.
		const { bakePinOutfit, isBakeable } = await import('../_lib/irl-bake.js');
		if (manifest && isBakeable(manifest)) {
			const baked = await bakePinOutfit({ pinId: id, baseUrl, manifest });
			newAvatarUrl = baked.url;
		}
		// else: cleared / empty manifest → serve the bare base GLB again.
	} catch (err) {
		console.error('[irl/pins] outfit bake failed', { pinId: id, message: err?.message });
		return json(res, 502, { error: 'could not bake the new outfit', detail: err?.message });
	}

	const [row] = await sql`
		UPDATE irl_pins SET
			avatar_manifest = ${manifest ? JSON.stringify(manifest) : null}::jsonb,
			avatar_base_url = COALESCE(avatar_base_url, ${baseUrl}),
			avatar_url      = ${newAvatarUrl},
			avatar_version  = avatar_version + 1
		WHERE id = ${id} AND user_id = ${session.id}
		RETURNING id, lat, lng, avatar_url, avatar_manifest, avatar_version
	`;
	if (!row) return json(res, 404, { error: 'not found' });

	// Realtime fan-out (D1) — co-located viewers swap the GLB within seconds
	// without waiting for their next poll. No-op until D1 lands; the poll path
	// (avatar_version diff) is the durable contract either way.
	emitPinUpdated(row);

	return json(res, 200, { pin: row });
}

// ── Realtime publish helpers (D1) ───────────────────────────────────────────
// The irl_world room is keyed by a precision-6 geocell (~1.2 km), the coarse cell
// every nearby viewer joins. Matches src/irl-net.js and multiplayer/src/rooms/
// IrlRoom.js so a publish always lands in the right live room. (The committed
// geocell7/GEOCELL_PRECISION column is the FINER precision-7 cell used for the D4
// density cap — a different lattice; both derive from the same encoder.)
const REALTIME_PRECISION = 6;
function realtimeCell(lat, lng) {
	return encodeGeohash(Number(lat), Number(lng), REALTIME_PRECISION);
}

// Build the camelCase wire object the room consumes from a DB row, including ONLY
// the columns the row actually has. An add returns the full row (RETURNING *) so
// every field rides; an update / calibrate returns a narrow column set, so only
// those become a partial pin:update — the room never zeroes a field the caller
// didn't touch.
function pinWire(row) {
	const w = { id: row.id };
	if ('lat' in row) w.lat = Number(row.lat);
	if ('lng' in row) w.lng = Number(row.lng);
	if ('heading' in row) w.heading = Number(row.heading) || 0;
	if ('avatar_url' in row) w.avatarUrl = row.avatar_url ?? '';
	if ('avatar_name' in row) w.avatarName = row.avatar_name ?? '';
	if ('caption' in row) w.caption = row.caption ?? '';
	if ('x402_endpoint' in row) w.x402Endpoint = row.x402_endpoint ?? '';
	if ('agent_id' in row) w.agentId = row.agent_id ?? '';
	if ('placed_at' in row) w.placedAt = row.placed_at ? Date.parse(row.placed_at) || 0 : 0;
	return w;
}

export default wrap(async (req, res) => {
	cors(req, res, { methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
	if (req.method === 'OPTIONS') return res.end();

	await ensureTable();

	// ── GET — my pins by device token (anonymous) or session (auth) ──────────
	// Path: /api/irl/pins/mine?deviceToken=…  — lets a visitor browse and manage
	// the pins they placed from this device even after a reload, without login.
	if (req.method === 'GET' && req.url?.includes('/mine')) {
		const deviceToken = req.query.deviceToken;
		const session     = await getSessionUser(req).catch(() => null);
		if (!deviceToken && !session) {
			return json(res, 400, { error: 'deviceToken required' });
		}
		const rows = await sql`
			SELECT id, lat, lng, avatar_name, caption, placed_at, expires_at, view_count
			FROM irl_pins
			WHERE (device_token = ${deviceToken ?? ''} OR user_id = ${session?.id ?? null})
			  AND hidden_at IS NULL
			  AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY placed_at DESC
			LIMIT 20
		`;
		return json(res, 200, { pins: rows });
	}

	// ── GET — my pins (auth, query-param form) ────────────────────────────────
	if (req.method === 'GET' && req.query.mine === '1') {
		const session = await getSessionUser(req).catch(() => null);
		if (!session) return json(res, 401, { error: 'not authenticated' });
		const rows = await sql`
			SELECT id, lat, lng, heading, avatar_url, avatar_name, caption, agent_id,
			       placed_at, expires_at, view_count,
			       anchor_height_m, anchor_yaw_deg, anchor_quat,
			       gps_accuracy_m, altitude_m, anchor_source,
			       avatar_manifest, avatar_base_url, avatar_version
			FROM irl_pins
			WHERE user_id = ${session.id}
			  AND hidden_at IS NULL
			ORDER BY placed_at DESC
			LIMIT 100
		`;
		return json(res, 200, { pins: rows });
	}

	// ── GET — pins in a bounding box (IRL realtime room hydration, D1) ─────────
	// The Colyseus irl_world room loads its 3×3 geocell window on create through
	// this box query (server-to-server). Same public projection as the nearby feed
	// — never owner ids — but selected by an explicit lat/lng box instead of a
	// radius, because a 3×3 precision-6 window (~3.6 km) exceeds the nearby radius
	// cap. Reuses the existing lat/lng index; capped + size-guarded against scrapes.
	if (req.method === 'GET' && req.query.bbox != null) {
		const parts = String(req.query.bbox).split(',').map((s) => parseFloat(s));
		if (parts.length !== 4 || parts.some((n) => !isFinite(n))) {
			return json(res, 400, { error: 'bbox must be minLat,minLng,maxLat,maxLng' });
		}
		let [minLat, minLng, maxLat, maxLng] = parts;
		if (minLat > maxLat) [minLat, maxLat] = [maxLat, minLat];
		if (minLng > maxLng) [minLng, maxLng] = [maxLng, minLng];
		// A legit 3×3 window is < ~0.05°; 1° (~111 km) is a generous abuse ceiling.
		if ((maxLat - minLat) > 1 || (maxLng - minLng) > 1) {
			return json(res, 400, { error: 'bbox too large' });
		}
		const rows = await sql`
			SELECT id, agent_id, lat, lng, heading,
			       avatar_url, avatar_name, caption, x402_endpoint, placed_at, avatar_version
			FROM irl_pins
			WHERE lat BETWEEN ${minLat} AND ${maxLat}
			  AND lng BETWEEN ${minLng} AND ${maxLng}
			  AND hidden_at IS NULL
			  AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY placed_at DESC
			LIMIT 500
		`;
		return json(res, 200, { pins: rows });
	}

	// ── GET — nearby pins ─────────────────────────────────────────────────────
	if (req.method === 'GET') {
		const lat    = parseFloat(req.query.lat);
		const lng    = parseFloat(req.query.lng);
		const radius = Math.min(500, Math.max(10, parseFloat(req.query.radius ?? '150')));

		if (!isFinite(lat) || !isFinite(lng)) {
			return json(res, 400, { error: 'lat and lng are required' });
		}

		// Bounding-box pre-filter (fast index scan), then haversine in app
		const latDelta = radius / 110540;
		const lngDelta = radius / (111320 * Math.cos(lat * Math.PI / 180));

		// Resolve the caller so we can tell them which nearby pins are THEIRS without
		// ever exposing other people's owner identifiers.
		const session = await getSessionUser(req).catch(() => null);
		const myId    = session?.id ?? null;
		const myTok   = req.query.deviceToken || null;

		const rows = await sql`
			SELECT id, user_id, device_token, agent_id, lat, lng, heading,
			       avatar_url, avatar_name, caption, x402_endpoint, placed_at, view_count,
			       anchor_height_m, anchor_yaw_deg, anchor_quat,
			       gps_accuracy_m, altitude_m, anchor_source, avatar_version
			FROM irl_pins
			WHERE lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
			  AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
			  AND hidden_at IS NULL
			  AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY placed_at DESC
			LIMIT 50
		`;

		// Explicit allow-list projection: NEVER return user_id or device_token in the
		// public feed (a stable owner UUID + precise coords is a deanonymization /
		// location-tracking vector). Surface only an is_mine boolean computed here.
		const pins = rows
			.map(r => ({
				id:             r.id,
				agent_id:       r.agent_id,
				lat:            r.lat,
				lng:            r.lng,
				heading:        r.heading,
				avatar_url:     r.avatar_url,
				avatar_name:    r.avatar_name,
				caption:        r.caption,
				x402_endpoint:  r.x402_endpoint,
				placed_at:      r.placed_at,
				view_count:     r.view_count,
				anchor_height_m: r.anchor_height_m,
				anchor_yaw_deg:  r.anchor_yaw_deg,
				anchor_quat:     r.anchor_quat,
				gps_accuracy_m:  r.gps_accuracy_m,
				altitude_m:      r.altitude_m,
				anchor_source:   r.anchor_source,
				// C6 — cheap re-skin signal: the viewer diffs this against its loaded
				// pin and swaps the GLB when it bumps. (The editable manifest/base URL
				// stay owner-private — viewers only ever need the rendered avatar_url.)
				avatar_version:  Number(r.avatar_version) || 0,
				is_mine: (!!myId && r.user_id === myId) || (!!myTok && r.device_token === myTok),
				distance_m: Math.round(haversineDist(lat, lng, r.lat, r.lng)),
			}))
			.filter(r => r.distance_m <= radius)
			.sort((a, b) => a.distance_m - b.distance_m);

		return json(res, 200, { pins });
	}

	// ── POST — create pin ─────────────────────────────────────────────────────
	// D4 gate order, cheapest/most-decisive first: coords → content (pure string,
	// fails closed) → URL/coin safety → rate limit (1 Redis cmd, protects the DB
	// from a flood) → density + per-owner caps (DB counts) → insert. Each rejection
	// carries a designed error code the client renders as an actionable message.
	if (req.method === 'POST') {
		const ip = clientIp(req);
		const rl = await limits.irlPinIp(ip);
		if (!rl.success) return rateLimited(res, rl);

		const body = req.body ?? {};
		const lat  = parseFloat(body.lat);
		const lng  = parseFloat(body.lng);

		if (!isFinite(lat) || !isFinite(lng)) {
			return json(res, 400, { error: 'lat and lng are required' });
		}
		if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
			return json(res, 400, { error: 'invalid coordinates' });
		}

		// Clamp text to its public length cap, then run the tier-1 content gate.
		const caption    = body.caption    != null ? String(body.caption).slice(0, CAPTION_MAX)    : null;
		const avatarName = body.avatarName != null ? String(body.avatarName).slice(0, NAME_MAX)    : null;
		const bad = contentReject(caption, avatarName);
		if (bad) {
			return json(res, 422, {
				error: 'content',
				field: bad.field,
				message: bad.reason === 'coin'
					? 'A pin can only reference $THREE — the only coin on three.ws.'
					: 'That text isn’t allowed on a public pin.',
			});
		}
		// Tier-2 AI risk on the borderline caption (no-op when Guardian unconfigured).
		if (caption && (await guardianFlags(caption))) {
			return json(res, 422, {
				error: 'content',
				field: 'caption',
				message: 'That caption was flagged by our content filter. Try rewording it.',
			});
		}

		// Validate the URLs handed to every nearby viewer (avatar GLB + x402 pay).
		const avatarUrlChk = safeRemoteUrl(body.avatarUrl);
		if (!avatarUrlChk.ok) return json(res, 400, { error: 'invalid avatarUrl' });
		// x402 pay target must be a first-party / allow-listed payment host — never an
		// arbitrary external drain (D4). Same-origin relative paths are first-party.
		const x402Chk = safePaymentEndpoint(body.x402Endpoint);
		if (!x402Chk.ok) {
			return json(res, 422, {
				error: 'endpoint',
				field: 'x402Endpoint',
				message: 'Pay endpoints must be hosted on three.ws.',
			});
		}
		// Empty-string device token would otherwise become a shared anonymous owner.
		const deviceToken = body.deviceToken || null;

		const session   = await getSessionUser(req).catch(() => null);
		const userId    = session?.id ?? null;

		// Placement token bucket (D4) — per (device + IP), tighter than the coarse
		// per-IP gate above. Burst (5/min) + sustained (30/h). Fails open + logs on a
		// Redis outage (non-critical) so an infra hiccup never blocks a real placement.
		const rateKey = `${deviceToken ?? userId ?? 'anon'}:${ip}`;
		const [burst, hourly] = await Promise.all([
			limits.irlPinBurst(rateKey),
			limits.irlPinHourly(rateKey),
		]);
		const throttled = !burst.success ? burst : !hourly.success ? hourly : null;
		if (throttled) {
			const retryAfter = Math.max(1, Math.ceil((throttled.reset - Date.now()) / 1000));
			res.setHeader?.('Retry-After', String(retryAfter));
			return json(res, 429, {
				error: 'rate',
				retryAfter,
				message: 'You’re placing agents too fast. Wait a moment and try again.',
			});
		}

		// Density cap — one fine geocell (~150m) can hold only so many agents, so a
		// single actor can't carpet-bomb a venue. Counts only live, non-hidden pins.
		const cell7 = encodeGeohash(lat, lng, GEOCELL_PRECISION);
		if (cell7) {
			const [{ n }] = await sql`
				SELECT count(*)::int AS n FROM irl_pins
				WHERE geocell7 = ${cell7}
				  AND hidden_at IS NULL
				  AND (expires_at IS NULL OR expires_at > NOW())
			`;
			if (n >= MAX_PINS_PER_CELL) {
				return json(res, 429, {
					error: 'area_full',
					message: 'This area already has the maximum number of agents. Try another spot.',
				});
			}
		}

		// Per-owner active-pin cap — a signed-in owner is accountable, so gets a
		// higher ceiling than an anonymous device. Null-guarded so a NULL user_id or
		// empty device token can't collide owners.
		const ownerCap = userId ? MAX_PINS_PER_OWNER_SIGNED : MAX_PINS_PER_OWNER_ANON;
		const [{ n: owned }] = await sql`
			SELECT count(*)::int AS n FROM irl_pins
			WHERE ((${userId}::uuid IS NOT NULL AND user_id = ${userId}::uuid)
			    OR (${deviceToken}::text IS NOT NULL AND device_token = ${deviceToken}))
			  AND hidden_at IS NULL
			  AND (expires_at IS NULL OR expires_at > NOW())
		`;
		if (owned >= ownerCap) {
			return json(res, 429, {
				error: 'pin_limit',
				limit: ownerCap,
				message: 'You’ve reached your active pin limit. Remove an old pin to place a new one.',
			});
		}

		// Authenticated users get permanent pins; anonymous expire in 7 days.
		const expiresAt = userId ? null : new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

		// Anchor pose (A2) — optional, back-compat: old clients send no `anchor`,
		// every pose column inserts NULL. New clients send a reproducible pose so
		// later sessions / other users can reconstruct where the agent stands.
		const pose          = (body.anchor && typeof body.anchor === 'object') ? body.anchor : {};
		// Reject absurd floor height (> ±50 m above/below eye) to NULL, not noise.
		const anchorHeightM = Number.isFinite(pose.heightM) && Math.abs(pose.heightM) <= 50
			? pose.heightM : null;
		const anchorYawDeg  = Number.isFinite(pose.yawDeg)
			? ((pose.yawDeg % 360) + 360) % 360 : null;
		const anchorQuat    = Array.isArray(pose.quat) && pose.quat.length === 4 &&
			pose.quat.every(Number.isFinite)
			? JSON.stringify(pose.quat) : null;
		// Clamp GPS accuracy to a sane 0–500 m range (a worse fix is meaningless here).
		const gpsAccuracyM  = Number.isFinite(pose.gpsAccuracyM)
			? Math.min(500, Math.max(0, pose.gpsAccuracyM)) : null;
		const altitudeM     = Number.isFinite(pose.altitudeM) ? pose.altitudeM : null;
		// 'webxr' (A1) · 'gyro-gps' (absolute compass heading) · 'gyro-gps:rel'
		// (page-relative heading only — A3 down-weights its cross-user bearing).
		const anchorSource  = pose.source === 'webxr' ? 'webxr'
			: pose.source === 'gyro-gps:rel' ? 'gyro-gps:rel' : 'gyro-gps';

		const [pin] = await sql`
			INSERT INTO irl_pins
				(user_id, agent_id, device_token, lat, lng, heading,
				 avatar_url, avatar_name, caption, x402_endpoint, expires_at,
				 anchor_height_m, anchor_yaw_deg, anchor_quat,
				 gps_accuracy_m, altitude_m, anchor_source, geocell7)
			VALUES (
				${userId},
				${body.agentId    ?? null},
				${deviceToken},
				${lat}, ${lng},
				${parseFloat(body.heading) || 0},
				${avatarUrlChk.value},
				${avatarName},
				${caption},
				${x402Chk.value},
				${expiresAt},
				${anchorHeightM},
				${anchorYawDeg},
				${anchorQuat},
				${gpsAccuracyM},
				${altitudeM},
				${anchorSource},
				${cell7 || null}
			)
			RETURNING *
		`;

		// Realtime (D1): fan this placement to every viewer in the geocell so it
		// appears on their screen within ~1 s, no reload. Fire-and-forget — the pin
		// is already persisted and the poll fallback reconciles if the push drops.
		void publishIrlPin('pin:add', realtimeCell(lat, lng), pinWire(pin));

		return json(res, 201, { pin: { ...pin, permanent: expiresAt === null } });
	}

	// ── PATCH — edit pin fields ───────────────────────────────────────────────
	// Authenticated owners can update: caption, avatar_url, avatar_name, lat, lng.
	// Anonymous device-token owners can only update caption (no location/avatar changes
	// from anonymous sessions for safety).
	if (req.method === 'PATCH') {
		const rl = await limits.irlPinIp(clientIp(req));
		if (!rl.success) return rateLimited(res, rl);

		const session = await getSessionUser(req).catch(() => null);
		const body = req.body ?? {};
		const { id } = body;
		if (!id) return json(res, 400, { error: 'id required' });

		// ── Calibrate — a small, owner-gated pose correction (A3) ─────────────
		// Owner-gated for both authenticated owners and the anonymous device that
		// placed the pin, so it routes BEFORE the auth gate below; ownership and
		// nudge bounds are enforced inside handleCalibrate.
		if (body.calibrate && typeof body.calibrate === 'object') {
			return handleCalibrate(res, { id, session, body });
		}

		// Field edits (caption / avatar / location / heading / x402) require auth.
		if (!session) return json(res, 401, { error: 'not authenticated' });

		// ── Outfit change (C6) — re-skin a placed agent for all nearby viewers ──
		// A manifest PATCH bakes a new GLB + bumps avatar_version; routed before
		// the simple field-edit SET below because it has its own bake/persist path.
		if ('avatar_manifest' in body || 'avatarManifest' in body) {
			return handleOutfitChange(res, { id, session, body });
		}

		// Build update SET clause only for fields the caller provided
		const updates = {};
		if ('caption' in body)    updates.caption    = body.caption ?? null;
		if ('avatarUrl' in body)  updates.avatarUrl  = body.avatarUrl ?? null;
		if ('avatarName' in body) updates.avatarName = body.avatarName ?? null;
		if ('lat' in body)        updates.lat        = parseFloat(body.lat);
		if ('lng' in body)        updates.lng        = parseFloat(body.lng);
		// heading: re-aim the avatar remotely (normalize to 0–359°)
		if ('heading' in body && isFinite(parseFloat(body.heading))) {
			updates.heading = ((Math.round(parseFloat(body.heading)) % 360) + 360) % 360;
		}
		// x402Endpoint: attach or update a paid endpoint so visitors can pay the agent IRL
		if ('x402Endpoint' in body) updates.x402Endpoint = body.x402Endpoint ?? null;

		if (!Object.keys(updates).length) {
			return json(res, 400, { error: 'no updatable fields provided' });
		}

		// Validate new lat/lng if provided
		if ('lat' in updates && (!isFinite(updates.lat) || updates.lat < -90 || updates.lat > 90)) {
			return json(res, 400, { error: 'invalid lat' });
		}
		if ('lng' in updates && (!isFinite(updates.lng) || updates.lng < -180 || updates.lng > 180)) {
			return json(res, 400, { error: 'invalid lng' });
		}

		// Validate URL fields if the caller is changing them (relative avatar URLs ok).
		if ('avatarUrl' in updates) {
			const c = safeRemoteUrl(updates.avatarUrl);
			if (!c.ok) return json(res, 400, { error: 'invalid avatarUrl' });
			updates.avatarUrl = c.value;
		}
		if ('x402Endpoint' in updates) {
			const c = safeRemoteUrl(updates.x402Endpoint, { allowRelative: false });
			if (!c.ok) return json(res, 400, { error: 'invalid x402Endpoint' });
			updates.x402Endpoint = c.value;
		}

		// Present-flag each text field so an explicit clear (null) actually writes
		// NULL. COALESCE treats null as "no change", silently dropping a clear and
		// desyncing the dashboard (which optimistically cleared the field) from the
		// row every nearby viewer fetches. lat/lng/heading keep COALESCE since 0 is a
		// valid value there and they are never "cleared".
		const has = (k) => k in updates;
		const [row] = await sql`
			UPDATE irl_pins SET
				caption       = CASE WHEN ${has('caption')}      THEN ${updates.caption      ?? null}::text ELSE caption       END,
				avatar_url    = CASE WHEN ${has('avatarUrl')}    THEN ${updates.avatarUrl    ?? null}::text ELSE avatar_url    END,
				avatar_name   = CASE WHEN ${has('avatarName')}   THEN ${updates.avatarName   ?? null}::text ELSE avatar_name   END,
				x402_endpoint = CASE WHEN ${has('x402Endpoint')} THEN ${updates.x402Endpoint ?? null}::text ELSE x402_endpoint END,
				lat           = COALESCE(${updates.lat     ?? null}, lat),
				lng           = COALESCE(${updates.lng     ?? null}, lng),
				heading       = COALESCE(${updates.heading ?? null}, heading)
			WHERE id = ${id} AND user_id = ${session.id}
			RETURNING id, caption, avatar_url, avatar_name, lat, lng, heading, x402_endpoint
		`;
		if (!row) return json(res, 404, { error: 'not found' });

		// Realtime (D1): push the edit live to nearby viewers. pinWire carries only
		// the RETURNING columns, so it's a partial pin:update — untouched fields stay.
		void publishIrlPin('pin:update', realtimeCell(row.lat, row.lng), pinWire(row));

		return json(res, 200, { pin: row });
	}

	// ── DELETE — remove own pin ───────────────────────────────────────────────
	if (req.method === 'DELETE') {
		const rl = await limits.irlPinIp(clientIp(req));
		if (!rl.success) return rateLimited(res, rl);

		const id          = req.query.id;
		const deviceToken = req.query.deviceToken ?? req.body?.deviceToken;

		if (!id) return json(res, 400, { error: 'id required' });

		const session = await getSessionUser(req).catch(() => null);
		const userId  = session?.id ?? null;

		// Must prove ownership: an authenticated user_id OR the placing device_token.
		// (A bare anonymous caller with neither must not be able to delete anything.)
		if (!userId && !deviceToken) {
			return json(res, 401, { error: 'authentication or device token required' });
		}

		// Match strictly by owner. Each branch is null-guarded so a NULL user_id or a
		// NULL/empty device_token can NEVER match a row — closing the prior
		// `device_token IS NULL AND $userId IS NULL` clause that let an anonymous
		// caller delete every pin whose device_token happened to be NULL.
		const result = await sql`
			DELETE FROM irl_pins
			WHERE id = ${id}
			  AND (
			    (${userId}::uuid IS NOT NULL AND user_id = ${userId}::uuid)
			    OR (device_token IS NOT NULL AND device_token = ${deviceToken ?? ''})
			  )
			RETURNING id, lat, lng
		`;

		if (!result.length) {
			return json(res, 404, { error: 'pin not found or not yours' });
		}
		// Realtime (D1): tell every nearby viewer to remove the pin live.
		const gone = result[0];
		void publishIrlPin('pin:remove', realtimeCell(gone.lat, gone.lng), { id: gone.id });
		return json(res, 200, { ok: true });
	}

	json(res, 405, { error: 'method not allowed' });
});
