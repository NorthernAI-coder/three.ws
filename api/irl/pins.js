/**
 * IRL GPS Pins — place 3D agents at real-world GPS coordinates.
 *
 * GET    /api/irl/pins?lat=&lng=&radius=150        nearby pins (public)
 * GET    /api/irl/pins/mine?deviceToken=           my pins (device token or auth)
 * GET    /api/irl/pins?mine=1                      my pins (auth required)
 * POST   /api/irl/pins  { lat, lng, heading, avatarUrl, avatarName, caption, agentId }
 * PATCH  /api/irl/pins  { id, caption, avatarUrl, avatarName, lat, lng }  edit pin (auth required)
 * DELETE /api/irl/pins?id=                         remove own pin (device_token or auth)
 * POST   /api/irl/pins/interact { pinId, event, deviceToken }  log a tap/view
 */

import { cors, json, wrap } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';

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
	_tableReady = true;
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
			       placed_at, expires_at, view_count
			FROM irl_pins
			WHERE user_id = ${session.id}
			ORDER BY placed_at DESC
			LIMIT 100
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

		const rows = await sql`
			SELECT id, user_id, agent_id, lat, lng, heading,
			       avatar_url, avatar_name, caption, x402_endpoint, placed_at, view_count
			FROM irl_pins
			WHERE lat BETWEEN ${lat - latDelta} AND ${lat + latDelta}
			  AND lng BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
			  AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY placed_at DESC
			LIMIT 50
		`;

		const pins = rows
			.map(r => ({
				...r,
				distance_m: Math.round(haversineDist(lat, lng, r.lat, r.lng)),
			}))
			.filter(r => r.distance_m <= radius)
			.sort((a, b) => a.distance_m - b.distance_m);

		return json(res, 200, { pins });
	}

	// ── POST — create pin ─────────────────────────────────────────────────────
	if (req.method === 'POST') {
		const body = req.body ?? {};
		const lat  = parseFloat(body.lat);
		const lng  = parseFloat(body.lng);

		if (!isFinite(lat) || !isFinite(lng)) {
			return json(res, 400, { error: 'lat and lng are required' });
		}
		if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
			return json(res, 400, { error: 'invalid coordinates' });
		}

		const session   = await getSessionUser(req).catch(() => null);
		const userId    = session?.id ?? null;
		// Authenticated users get permanent pins; anonymous expire in 7 days.
		const expiresAt = userId ? null : new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

		const [pin] = await sql`
			INSERT INTO irl_pins
				(user_id, agent_id, device_token, lat, lng, heading,
				 avatar_url, avatar_name, caption, x402_endpoint, expires_at)
			VALUES (
				${userId},
				${body.agentId    ?? null},
				${body.deviceToken ?? null},
				${lat}, ${lng},
				${parseFloat(body.heading) || 0},
				${body.avatarUrl   ?? null},
				${body.avatarName  ?? null},
				${body.caption     ?? null},
				${body.x402Endpoint ?? null},
				${expiresAt}
			)
			RETURNING *
		`;

		return json(res, 201, { pin: { ...pin, permanent: expiresAt === null } });
	}

	// ── PATCH — edit pin fields ───────────────────────────────────────────────
	// Authenticated owners can update: caption, avatar_url, avatar_name, lat, lng.
	// Anonymous device-token owners can only update caption (no location/avatar changes
	// from anonymous sessions for safety).
	if (req.method === 'PATCH') {
		const session = await getSessionUser(req).catch(() => null);
		if (!session) return json(res, 401, { error: 'not authenticated' });
		const body = req.body ?? {};
		const { id } = body;
		if (!id) return json(res, 400, { error: 'id required' });

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

		const [row] = await sql`
			UPDATE irl_pins SET
				caption       = COALESCE(${updates.caption    ?? null}, caption),
				avatar_url    = COALESCE(${updates.avatarUrl  ?? null}, avatar_url),
				avatar_name   = COALESCE(${updates.avatarName ?? null}, avatar_name),
				lat           = COALESCE(${updates.lat        ?? null}, lat),
				lng           = COALESCE(${updates.lng        ?? null}, lng),
				heading       = COALESCE(${updates.heading    ?? null}, heading),
				x402_endpoint = COALESCE(${updates.x402Endpoint ?? null}, x402_endpoint)
			WHERE id = ${id} AND user_id = ${session.id}
			RETURNING id, caption, avatar_url, avatar_name, lat, lng, heading, x402_endpoint
		`;
		if (!row) return json(res, 404, { error: 'not found' });
		return json(res, 200, { pin: row });
	}

	// ── DELETE — remove own pin ───────────────────────────────────────────────
	if (req.method === 'DELETE') {
		const id          = req.query.id;
		const deviceToken = req.query.deviceToken ?? req.body?.deviceToken;

		if (!id) return json(res, 400, { error: 'id required' });

		const session = await getSessionUser(req).catch(() => null);
		const userId  = session?.id ?? null;

		// Allow deletion by device_token (anonymous) or user_id (authenticated)
		const result = await sql`
			DELETE FROM irl_pins
			WHERE id = ${id}
			  AND (
			    device_token = ${deviceToken ?? ''}
			    OR user_id = ${userId}
			    OR (device_token IS NULL AND ${userId} IS NULL)
			  )
			RETURNING id
		`;

		if (!result.length) {
			return json(res, 404, { error: 'pin not found or not yours' });
		}
		return json(res, 200, { ok: true });
	}

	json(res, 405, { error: 'method not allowed' });
});
