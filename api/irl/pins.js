/**
 * IRL GPS Pins — place 3D agents at real-world GPS coordinates.
 *
 * GET    /api/irl/pins?lat=&lng=&radius=150        nearby pins (public)
 * GET    /api/irl/pins?mine=1                      my pins (auth required)
 * POST   /api/irl/pins  { lat, lng, heading, avatarUrl, avatarName, caption, agentId }
 * PATCH  /api/irl/pins  { id, caption }            edit caption (auth required)
 * DELETE /api/irl/pins?id=                         remove own pin (device_token or auth)
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
	_tableReady = true;
}

export default wrap(async (req, res) => {
	cors(req, res, { methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
	if (req.method === 'OPTIONS') return res.end();

	await ensureTable();

	// ── GET — my pins (auth) ──────────────────────────────────────────────────
	if (req.method === 'GET' && req.query.mine === '1') {
		const session = await getSessionUser(req).catch(() => null);
		if (!session) return json(res, 401, { error: 'not authenticated' });
		const rows = await sql`
			SELECT id, lat, lng, heading, avatar_url, avatar_name, caption, agent_id, placed_at, expires_at
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
			       avatar_url, avatar_name, caption, x402_endpoint, placed_at
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

	// ── PATCH — edit caption ──────────────────────────────────────────────────
	if (req.method === 'PATCH') {
		const session = await getSessionUser(req).catch(() => null);
		if (!session) return json(res, 401, { error: 'not authenticated' });
		const { id, caption } = req.body ?? {};
		if (!id) return json(res, 400, { error: 'id required' });
		const [row] = await sql`
			UPDATE irl_pins SET caption = ${caption ?? null}
			WHERE id = ${id} AND user_id = ${session.id}
			RETURNING id, caption
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
