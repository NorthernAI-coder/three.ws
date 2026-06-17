/**
 * IRL Interactions — record and surface real-world taps on placed agents.
 *
 * When a visitor walks up to an agent pinned in real space (/irl) and taps it,
 * we log an interaction against the pin. The pin's owner reads these back from
 * their dashboard as a live feed of "someone met your agent IRL" prompts —
 * including any message the visitor left and where the encounter happened.
 *
 * POST /api/irl/interactions
 *   { pinId, type: 'view'|'tap'|'message'|'pay', message?, deviceToken?,
 *     amount?, currencyMint?, network?, payload?, replyTo? }
 *   agent_id + owner are taken from the pin, never the caller. Anonymous-friendly:
 *   viewer attribution falls back to the device token. Repeat 'view's from the
 *   same device on the same pin within VIEW_DEDUPE_MS collapse into the first one.
 *   A 'pay' must carry a valid settlement signature + a $THREE/USDC mint and is
 *   de-duped per signature. A visitor 'pay'/'message' fans out an owner notification.
 *   When the AUTHENTICATED OWNER posts a 'message', it's recorded as a reply
 *   (payload.from='owner', auto-seen) and — if replyTo points at a signed-in
 *   visitor's row — notifies that visitor instead of the owner. Response carries
 *   { notified } so the dashboard can confirm the reply reached someone.
 *
 * GET /api/irl/interactions?mine=1[&unread=1]   — interactions on MY pins
 *   Owner is matched by session user OR by ?deviceToken= (anonymous placements).
 *   Returns newest-first, joined with the pin's avatar name + caption.
 *
 * GET /api/irl/interactions?pinId=<id>          — public count for one pin
 */

import { cors, json, wrap, rateLimited } from '../_lib/http.js';
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { insertNotification } from '../_lib/notify.js';
import { sendOpsAlert } from '../_lib/alerts.js';
import { limits, clientIp } from '../_lib/rate-limit.js';

// view | tap — passive/active sighting of the agent. message — a note left for
// the owner. pay — an x402 settlement against the agent (see PAY note below).
const TYPES = new Set(['view', 'tap', 'message', 'pay']);
const VIEW_DEDUPE_MS = 5 * 60 * 1000; // collapse repeat views from one device
const MAX_MESSAGE_LEN = 280;

// A `pay` is the one caller-asserted type that names money, so it is NOT trusted
// blindly (the original guard against forged "someone paid your agent" rows). A
// pay is only recorded when it carries a settlement proof we can sanity-check:
//   1. a well-formed on-chain signature (0x… EVM tx hash, or base58 Solana sig),
//   2. a currency mint that is $THREE or USDC — the only coins this platform
//      references; anything else is rejected outright, and
//   3. global de-dupe by signature so one settlement can be logged exactly once.
// Pays surface ONLY in the owner's private inbox (never publicly), and the write
// is rate-limited + deduped, so the residual abuse surface is a forger spamming
// their own inbox. Full on-chain attribution (recipient/amount match) is layered
// on by the B3 settlement path, which owns the seller payout + price context.
const EVM_TX_RE   = /^0x[0-9a-fA-F]{64}$/;
const SOL_SIG_RE  = /^[1-9A-HJ-NP-Za-km-z]{43,88}$/;
const UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THREE_MINT  = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const USDC_SOLANA  = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_BASE    = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
// Lowercased lookup so an EVM address compares case-insensitively; the two
// case-sensitive base58 mints are matched verbatim.
const ALLOWED_PAY_MINTS = new Set([THREE_MINT, USDC_SOLANA, USDC_BASE]);
function isAllowedMint(mint) {
	if (typeof mint !== 'string' || !mint) return false;
	return ALLOWED_PAY_MINTS.has(mint) || ALLOWED_PAY_MINTS.has(mint.toLowerCase());
}
function isValidPaySignature(sig) {
	return typeof sig === 'string' && (EVM_TX_RE.test(sig) || SOL_SIG_RE.test(sig));
}
// Block-explorer deep link for a settlement, picking the chain from the
// signature shape (EVM tx hash → Basescan) or an explicit network hint,
// defaulting to Solscan. Returned in the notification so the owner can open the
// receipt straight from the bell.
function explorerTxUrl(sig, network) {
	if (!sig) return null;
	const net = String(network || '').toLowerCase();
	if (EVM_TX_RE.test(sig) || net.includes('base') || net.includes('eip155')) {
		return `https://basescan.org/tx/${sig}`;
	}
	return `https://solscan.io/tx/${sig}`;
}
// Bound an untrusted payload object so a caller can't store an arbitrarily large
// blob in the JSONB column. Non-objects and oversized payloads collapse to {}.
function clampPayload(obj) {
	if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
	try {
		return JSON.stringify(obj).length <= 2000 ? obj : {};
	} catch {
		return {};
	}
}

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
	// Earnings columns (C4) — populated for type='pay'. amount is in the asset's
	// atomic units; currency_mint is $THREE or USDC; payload carries the on-chain
	// signature, network, and any structured context (geo, settlement detail).
	await sql`ALTER TABLE irl_interactions ADD COLUMN IF NOT EXISTS amount        NUMERIC`;
	await sql`ALTER TABLE irl_interactions ADD COLUMN IF NOT EXISTS currency_mint TEXT`;
	await sql`ALTER TABLE irl_interactions ADD COLUMN IF NOT EXISTS payload       JSONB DEFAULT '{}'::jsonb`;
	// One settlement → one pay row. Indexed for the de-dupe lookup on insert.
	await sql`CREATE INDEX IF NOT EXISTS irl_interactions_paysig ON irl_interactions ((payload->>'signature')) WHERE type = 'pay'`;
	_tableReady = true;
}

export default wrap(async (req, res) => {
	cors(req, res, { methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] });
	if (req.method === 'OPTIONS') return res.end();

	await ensureTable();

	// ── POST — log an interaction ─────────────────────────────────────────────
	if (req.method === 'POST') {
		const rl = await limits.irlInteractIp(clientIp(req));
		if (!rl.success) return rateLimited(res, rl);

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
			  AND hidden_at IS NULL
			  AND (expires_at IS NULL OR expires_at > NOW())
			LIMIT 1
		`;
		if (!pin) return json(res, 404, { error: 'pin not found' });

		// Don't log an owner inspecting their own pin — that's not an encounter.
		const isAuthOwner = !!(viewerUserId && pin.user_id && viewerUserId === pin.user_id);
		const isOwner =
			isAuthOwner ||
			(viewerDevice && pin.device_token && viewerDevice === pin.device_token);
		if (isOwner && type === 'view') {
			return json(res, 200, { ok: true, self: true });
		}
		// An authenticated owner posting a `message` is a REPLY to a visitor — a
		// first-class thread turn, not a self-encounter. It's recorded (stamped
		// from:'owner', auto-seen so it never inflates the owner's own unread) and,
		// when the visitor was signed in, fans a notification back to THEM.
		const isOwnerReply = type === 'message' && isAuthOwner;

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

		// Earnings fields — only ever set for a verified `pay` (see PAY note up top).
		let amount = null;
		let currencyMint = null;
		let payload = clampPayload(body.payload);
		// `from` / `replyTo` are never client-trusted — a visitor must not be able to
		// forge a row that looks like an owner reply. Capture the (validated) reply
		// target first, then strip both; the server re-stamps them only for a genuine
		// owner reply below.
		const replyToRaw =
			(typeof body.replyTo === 'string' && UUID_RE.test(body.replyTo)) ? body.replyTo
			: (typeof payload.replyTo === 'string' && UUID_RE.test(payload.replyTo)) ? payload.replyTo
			: null;
		delete payload.from;
		delete payload.replyTo;
		if (isOwnerReply) {
			payload.from = 'owner';
			if (replyToRaw) payload.replyTo = replyToRaw;
		}
		if (type === 'pay') {
			const sig  = payload.signature ?? body.signature ?? null;
			const mint = body.currencyMint ?? payload.currencyMint ?? null;
			if (!isValidPaySignature(sig)) {
				return json(res, 400, { error: 'pay requires a valid on-chain settlement signature' });
			}
			if (!isAllowedMint(mint)) {
				return json(res, 400, { error: 'currency_mint must be $THREE or USDC' });
			}
			const amt = Number(body.amount);
			amount = Number.isFinite(amt) && amt > 0 ? amt : null;
			currencyMint = mint;
			payload = { ...payload, signature: sig };
			if (body.network) payload.network = String(body.network).slice(0, 32);
			// One settlement → one pay row, even if the client retries the log.
			const [dupe] = await sql`
				SELECT id FROM irl_interactions
				WHERE type = 'pay' AND payload->>'signature' = ${sig}
				LIMIT 1
			`;
			if (dupe) return json(res, 200, { ok: true, deduped: true, id: dupe.id });
		}

		// An owner reply is authored by the owner, so it lands already-seen — it must
		// never light up the owner's own unread badge. Every other row is unread.
		const seenAt = isOwnerReply ? new Date().toISOString() : null;
		const [row] = await sql`
			INSERT INTO irl_interactions
				(pin_id, agent_id, type, message, viewer_user_id, viewer_device, lat, lng,
				 amount, currency_mint, payload, seen_at)
			VALUES (
				${pinId},
				${pin.agent_id ?? null},
				${type},
				${message},
				${viewerUserId},
				${viewerDevice},
				${pin.lat},
				${pin.lng},
				${amount},
				${currencyMint},
				${JSON.stringify(payload)}::jsonb,
				${seenAt}
			)
			RETURNING id, type, created_at
		`;
		// view_count is the "Visitors" metric — only an actual view counts. A message
		// (or any non-view) must not inflate it (the owner already sees those as feed
		// rows). Owner-self views and same-device repeats already returned above.
		if (type === 'view') {
			sql`UPDATE irl_pins SET view_count = view_count + 1 WHERE id = ${pinId}`.catch(() => {});
		}
		// Fan-out. Both arms are fire-and-forget and no-op when there's no one to
		// reach (anonymous actor) or creds are absent.
		let notified = false;
		if (isOwnerReply) {
			// The reply reaches the visitor only if they were signed in when they left
			// the message — an anonymous device has no inbox to deliver to. The owner is
			// never self-notified for their own reply.
			if (replyToRaw) {
				const [orig] = await sql`
					SELECT viewer_user_id FROM irl_interactions
					WHERE id = ${replyToRaw} AND pin_id = ${pinId} LIMIT 1
				`;
				if (orig?.viewer_user_id && orig.viewer_user_id !== pin.user_id) {
					insertNotification(orig.viewer_user_id, 'irl_reply', {
						pin_id: pinId,
						agent_id: pin.agent_id ?? null,
						message,
						link: pin.agent_id ? `/agent/${pin.agent_id}` : undefined,
					});
					notified = true;
				}
			}
		} else if ((type === 'pay' || type === 'message') && pin.user_id) {
			// High-signal visitor events notify the owner: in-app always (the dashboard
			// inbox + the global nav bell), plus an optional Telegram ping for a pay.
			insertNotification(pin.user_id, 'irl_interaction', {
				pin_id: pinId,
				agent_id: pin.agent_id ?? null,
				kind: type,
				amount,
				currency_mint: currencyMint,
				message,
				tx_signature: type === 'pay' ? payload.signature : undefined,
				link: type === 'pay' ? explorerTxUrl(payload.signature, payload.network) : undefined,
			});
			if (type === 'pay') {
				sendOpsAlert(
					'IRL agent paid',
					`A placed agent was paid IRL${amount ? ` (${amount} ${currencyMint})` : ''}. Pin ${pinId}.`,
					{ signature: `irl-pay:${payload.signature}` },
				);
			}
		}
		return json(res, 201, { ok: true, interaction: row, notified });
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
		// Null-guard both identifiers so a missing owner id or an empty device token
		// can NEVER match a row (a NULL user_id or '' device_token would otherwise
		// surface another owner's — or every legacy NULL-token — interaction).
		const ownerId  = session?.id ?? null;
		const ownerDev = (typeof deviceToken === 'string' && deviceToken.length) ? deviceToken : null;

		// Neon's tagged template doesn't compose nested `sql` fragments, so the
		// unread filter is two explicit queries rather than a spliced clause.
		const rows = unreadOnly
			? await sql`
				SELECT
					ix.id, ix.pin_id, ix.agent_id, ix.type, ix.message,
					ix.lat, ix.lng, ix.seen_at, ix.created_at,
					ix.amount, ix.currency_mint, ix.payload,
					p.avatar_name, p.caption
				FROM irl_interactions ix
				JOIN irl_pins p ON p.id = ix.pin_id
				WHERE ((${ownerId}::uuid IS NOT NULL AND p.user_id = ${ownerId}::uuid)
				    OR (${ownerDev}::text IS NOT NULL AND p.device_token = ${ownerDev}))
				  AND ix.seen_at IS NULL
				ORDER BY ix.created_at DESC
				LIMIT 100`
			: await sql`
				SELECT
					ix.id, ix.pin_id, ix.agent_id, ix.type, ix.message,
					ix.lat, ix.lng, ix.seen_at, ix.created_at,
					ix.amount, ix.currency_mint, ix.payload,
					p.avatar_name, p.caption
				FROM irl_interactions ix
				JOIN irl_pins p ON p.id = ix.pin_id
				WHERE ((${ownerId}::uuid IS NOT NULL AND p.user_id = ${ownerId}::uuid)
				    OR (${ownerDev}::text IS NOT NULL AND p.device_token = ${ownerDev}))
				ORDER BY ix.created_at DESC
				LIMIT 100`;
		const [agg] = await sql`
			SELECT COUNT(*) FILTER (WHERE ix.seen_at IS NULL)::int AS unread
			FROM irl_interactions ix
			JOIN irl_pins p ON p.id = ix.pin_id
			WHERE ((${ownerId}::uuid IS NOT NULL AND p.user_id = ${ownerId}::uuid)
			    OR (${ownerDev}::text IS NOT NULL AND p.device_token = ${ownerDev}))
		`;
		return json(res, 200, { interactions: rows, unread: agg?.unread ?? 0 });
	}

	// ── PATCH — mark my interactions as seen ──────────────────────────────────
	if (req.method === 'PATCH') {
		const session = await getSessionUser(req).catch(() => null);
		const rawTok = req.body?.deviceToken ?? null;
		const ownerId  = session?.id ?? null;
		const ownerDev = (typeof rawTok === 'string' && rawTok.length) ? rawTok : null;
		if (!ownerId && !ownerDev) {
			return json(res, 400, { error: 'sign in or pass deviceToken' });
		}
		await sql`
			UPDATE irl_interactions ix
			SET seen_at = NOW()
			FROM irl_pins p
			WHERE ix.pin_id = p.id
			  AND ix.seen_at IS NULL
			  AND ((${ownerId}::uuid IS NOT NULL AND p.user_id = ${ownerId}::uuid)
			    OR (${ownerDev}::text IS NOT NULL AND p.device_token = ${ownerDev}))
		`;
		return json(res, 200, { ok: true });
	}

	json(res, 405, { error: 'method not allowed' });
});
