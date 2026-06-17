/**
 * IRL Interactions — record and surface real-world taps on placed agents.
 *
 * When a visitor walks up to an agent pinned in real space (/irl) and taps it,
 * we log an interaction against the pin. The pin's owner reads these back from
 * their dashboard as a live feed of "someone met your agent IRL" prompts —
 * including any message the visitor left and where the encounter happened.
 *
 * POST /api/irl/interactions
 *   { pinId, agentId?, type: 'view'|'message'|'pay', message?, deviceToken? }
 *   Anonymous-friendly: viewer attribution falls back to the device token.
 *   Repeat 'view's from the same device on the same pin within VIEW_DEDUPE_MS
 *   collapse into the first one so the feed stays meaningful.
 *
 * GET /api/irl/interactions?mine=1[&unread=1]   — interactions on MY pins
 *   Owner is matched by session user OR by ?deviceToken= (anonymous placements).
 *   Returns newest-first, joined with the pin's avatar name + caption.
 *
 * GET /api/irl/interactions?pinId=<id>          — public count for one pin
 */

import { cors, json, wrap } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';

const TYPES = new Set(['view', 'message', 'pay']);
const VIEW_DEDUPE_MS = 5 * 60 * 1000; // collapse repeat views from one device
const MAX_MESSAGE_LEN = 280;

let _tableReady = false;
async function ensureTable() {
	if (_tableReady) return;
	await sql`
		CREATE TABLE IF NOT EXISTS irl_interactions (
			id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
			pin_id        UUID NOT NULL,
			agent_id      UUID,
			type          TEXT NOT NULL DEFAULT 'view',
			message       TEXT,
			viewer_user_id   UUID,
			viewer_device    TEXT,
			lat           DOUBLE PRECISION,
			lng           DOUBLE PRECISION,
			seen_at       TIMESTAMPTZ,
			created_at    TIMESTAMPTZ DEFAULT NOW()
		)
	`;
	await sql`CREATE INDEX IF NOT EXISTS irl_interactions_pin ON irl_interactions (pin_id, created_at DESC)`;
	await sql`CREATE INDEX IF NOT EXISTS irl_interactions_viewer ON irl_interactions (viewer_device, pin_id, type)`;
	_tableReady = true;
}

export default wrap(async (req, res) => {
	cors(req, res, { methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] });
	if (req.method === 'OPTIONS') return res.end();

	await ensureTable();

	// ── POST — log an interaction ─────────────────────────────────────────────
	if (req.method === 'POST') {
		const body = req.body ?? {};
		const pinId = body.pinId;
		if (!pinId) return json(res, 400, { error: 'pinId required' });

		const type = TYPES.has(body.type) ? body.type : 'view';
		const message = typeof body.message === 'string'
			? body.message.trim().slice(0, MAX_MESSAGE_LEN) || null
			: null;

		const session = await getSessionUser(req).catch(() => null);
		const viewerUserId = session?.id ?? null;
		const viewerDevice = body.deviceToken ?? null;

		// Confirm the pin exists (and is live) and snapshot its location + agent.
		const [pin] = await sql`
			SELECT id, agent_id, lat, lng, user_id, device_token
			FROM irl_pins
			WHERE id = ${pinId}
			  AND (expires_at IS NULL OR expires_at > NOW())
			LIMIT 1
		`;
		if (!pin) return json(res, 404, { error: 'pin not found' });

		// Don't log an owner inspecting their own pin — that's not an encounter.
		const isOwner =
			(viewerUserId && pin.user_id && viewerUserId === pin.user_id) ||
			(viewerDevice && pin.device_token && viewerDevice === pin.device_token);
		if (isOwner && type === 'view') {
			return json(res, 200, { ok: true, self: true });
		}

		// Collapse repeat 'view's from the same device on the same pin.
		if (type === 'view' && viewerDevice) {
			const [recent] = await sql`
				SELECT id FROM irl_interactions
				WHERE pin_id = ${pinId} AND viewer_device = ${viewerDevice} AND type = 'view'
				  AND created_at > NOW() - ${`${VIEW_DEDUPE_MS} milliseconds`}::interval
				LIMIT 1
			`;
			if (recent) return json(res, 200, { ok: true, deduped: true, id: recent.id });
		}

		const [row] = await sql`
			INSERT INTO irl_interactions
				(pin_id, agent_id, type, message, viewer_user_id, viewer_device, lat, lng)
			VALUES (
				${pinId},
				${pin.agent_id ?? body.agentId ?? null},
				${type},
				${message},
				${viewerUserId},
				${viewerDevice},
				${pin.lat},
				${pin.lng}
			)
			RETURNING id, type, created_at
		`;
		// Increment deduplicated visitor count on the pin for quick dashboard display
		sql`UPDATE irl_pins SET view_count = view_count + 1 WHERE id = ${pinId}`.catch(() => {});
		return json(res, 201, { ok: true, interaction: row });
	}

	// ── GET — public count for a single pin ───────────────────────────────────
	if (req.method === 'GET' && req.query.pinId) {
		const [agg] = await sql`
			SELECT
				COUNT(*)::int AS total,
				COUNT(*) FILTER (WHERE type = 'message')::int AS messages
			FROM irl_interactions
			WHERE pin_id = ${req.query.pinId}
		`;
		return json(res, 200, { count: agg?.total ?? 0, messages: agg?.messages ?? 0 });
	}

	// ── GET — interactions on MY pins (owner feed) ────────────────────────────
	if (req.method === 'GET' && req.query.mine === '1') {
		const session = await getSessionUser(req).catch(() => null);
		const deviceToken = req.query.deviceToken ?? null;
		if (!session && !deviceToken) {
			return json(res, 400, { error: 'sign in or pass deviceToken' });
		}
		const unreadOnly = req.query.unread === '1';
		const ownerId  = session?.id ?? null;
		const ownerDev = deviceToken ?? '';

		// Neon's tagged template doesn't compose nested `sql` fragments, so the
		// unread filter is two explicit queries rather than a spliced clause.
		const rows = unreadOnly
			? await sql`
				SELECT
					ix.id, ix.pin_id, ix.agent_id, ix.type, ix.message,
					ix.lat, ix.lng, ix.seen_at, ix.created_at,
					p.avatar_name, p.caption
				FROM irl_interactions ix
				JOIN irl_pins p ON p.id = ix.pin_id
				WHERE (p.user_id = ${ownerId} OR p.device_token = ${ownerDev})
				  AND ix.seen_at IS NULL
				ORDER BY ix.created_at DESC
				LIMIT 100`
			: await sql`
				SELECT
					ix.id, ix.pin_id, ix.agent_id, ix.type, ix.message,
					ix.lat, ix.lng, ix.seen_at, ix.created_at,
					p.avatar_name, p.caption
				FROM irl_interactions ix
				JOIN irl_pins p ON p.id = ix.pin_id
				WHERE (p.user_id = ${ownerId} OR p.device_token = ${ownerDev})
				ORDER BY ix.created_at DESC
				LIMIT 100`;
		const [agg] = await sql`
			SELECT COUNT(*) FILTER (WHERE ix.seen_at IS NULL)::int AS unread
			FROM irl_interactions ix
			JOIN irl_pins p ON p.id = ix.pin_id
			WHERE (p.user_id = ${session?.id ?? null} OR p.device_token = ${deviceToken ?? ''})
		`;
		return json(res, 200, { interactions: rows, unread: agg?.unread ?? 0 });
	}

	// ── PATCH — mark my interactions as seen ──────────────────────────────────
	if (req.method === 'PATCH') {
		const session = await getSessionUser(req).catch(() => null);
		const deviceToken = req.body?.deviceToken ?? null;
		if (!session && !deviceToken) {
			return json(res, 400, { error: 'sign in or pass deviceToken' });
		}
		await sql`
			UPDATE irl_interactions ix
			SET seen_at = NOW()
			FROM irl_pins p
			WHERE ix.pin_id = p.id
			  AND ix.seen_at IS NULL
			  AND (p.user_id = ${session?.id ?? null} OR p.device_token = ${deviceToken ?? ''})
		`;
		return json(res, 200, { ok: true });
	}

	json(res, 405, { error: 'method not allowed' });
});
