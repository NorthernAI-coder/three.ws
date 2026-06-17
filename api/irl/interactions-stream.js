// GET /api/irl/interactions-stream — Server-Sent Events for the owner's IRL inbox.
//
// This is the realtime delivery layer for D3 (`A → server → owner`). The C4
// dashboard (src/dashboard-next/pages/irl-placements.js) does one fast GET
// /api/irl/interactions?mine=1 for first paint, then opens THIS stream so a tap,
// message, or pay on a placed agent lands in the open inbox within ~1s instead of
// only on the next reload — even though the owner is almost never standing in the
// same geocell as the passer-by.
//
// The geocell room (D1/D2) broadcasts the co-located *ambient reaction*; the
// owner is reached here instead, off the authoritative interaction log, so the
// owner channel never depends on the WS host being up. The interaction RECORD
// always flows through POST /api/irl/interactions (C4) → irl_interactions; this
// stream only tails that table for the connected owner and pushes new rows.
//
// ── Why poll Postgres instead of pub/sub ─────────────────────────────────────
// Vercel can't hold a WebSocket and the Upstash REST client this repo uses has no
// long-lived SUBSCRIBE, so — exactly like api/feed-stream.js — we tail the source
// with a cheap, bounded query and fan the result to every connection on the warm
// instance. The interaction table is low-volume per owner (a dashboard, not a
// firehose), so a single indexed `created_at` range scan per tick is trivial.
//
// ── Quota / load discipline ──────────────────────────────────────────────────
// Vercel runs each SSE connection in its own invocation, but concurrent
// connections frequently share a warm instance. A naive per-connection loop would
// multiply DB reads by the open-tab count, so all connections on an instance share
// ONE poll loop: each tick issues a single query for the union of connected
// owners and dispatches each row to the matching owner's connection(s). The
// cadence is adaptive — fast right after activity, ramping toward POLL_MS_MAX while
// the inbox is idle (which it mostly is) — and a quota/error breaker degrades to
// heartbeats so a dead DB never turns into a poll storm.
//
// Vercel: registered with maxDuration 300 in vercel.json; we send a `retry`
// directive and close just before the hard timeout, and EventSource reconnects.

import { cors, method } from '../_lib/http.js';
import { getSessionUser } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

const HEARTBEAT_MS = 15_000;
const POLL_MS_MIN = 2_000;   // fast cadence right after activity
const POLL_MS_MAX = 15_000;  // idle ceiling — the inbox is idle most of the time
const IDLE_TICKS_BEFORE_RAMP = 3;
const OVERLAP_MS = 2_000;    // re-scan window so a row committed mid-tick isn't skipped
const ROW_LIMIT = 200;       // per-tick cap; deduped by id across the overlap
const SEEN_MAX = 1_000;      // bound the dedupe set on a long-lived instance
const BREAKER_COOLDOWN_MS = 60_000;
const MAX_DURATION_MS = 275_000; // close before Vercel's 300s hard timeout

// Only the fields the owner is allowed to see leave the server. NEVER the actor's
// identity (viewer_user_id/viewer_device) or any actor GPS — the lat/lng below are
// the OWNER's own pin location, which they already know. For a `pay`, the payload
// is reduced to the settlement signature + network so the inbox can deep-link the
// receipt; everything else in payload is dropped. Mirrors the GET ?mine=1 row
// shape so the client renders a live row identically to a polled one.
export function publicRow(r) {
	const payload = {};
	if (r.type === 'pay' && r.payload && typeof r.payload === 'object') {
		if (r.payload.signature) payload.signature = String(r.payload.signature);
		if (r.payload.network) payload.network = String(r.payload.network);
	}
	return {
		id: r.id,
		pin_id: r.pin_id,
		agent_id: r.agent_id,
		type: r.type,
		message: r.message,
		amount: r.amount,
		currency_mint: r.currency_mint,
		avatar_name: r.avatar_name,
		caption: r.caption,
		lat: r.lat,
		lng: r.lng,
		payload,
		created_at: r.created_at,
	};
}

function isQuotaError(err) {
	const m = (err && (err.message || String(err))) || '';
	return /too many connections|rate limit|quota|429|max requests/i.test(m);
}

// ── Per-instance shared poller ───────────────────────────────────────────────
// Every connection on this warm Lambda registers here; one loop fans fresh rows
// to all of them. A connection only ever receives rows created AFTER it joined
// (connectedAt) for an owner identity it actually owns (server-derived auth).
const connections = new Set();
let pollTimer = null;
let polling = false;
let lastPollAt = 0;          // ms; watermark floor for the next query
let seen = new Set();        // recently-dispatched ids — global dedupe across overlap
let currentDelay = POLL_MS_MIN;
let idleTicks = 0;
let breakerUntil = 0;
let breakerLogged = false;

function resetSharedState() {
	if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
	polling = false;
	lastPollAt = 0;
	seen = new Set();
	currentDelay = POLL_MS_MIN;
	idleTicks = 0;
	breakerUntil = 0;
	breakerLogged = false;
}

function scheduleNextPoll() {
	if (pollTimer) clearTimeout(pollTimer);
	if (connections.size === 0) { pollTimer = null; return; }
	pollTimer = setTimeout(runPoll, currentDelay);
}

export function matches(conn, row) {
	return (conn.ownerId && row.owner_id === conn.ownerId)
		|| (conn.ownerDev && row.owner_dev === conn.ownerDev);
}

async function runPoll() {
	pollTimer = null;
	if (connections.size === 0) return;
	if (polling) { scheduleNextPoll(); return; }

	const now = Date.now();
	if (now < breakerUntil) { scheduleNextPoll(); return; } // cooling down

	// Distinct owner identities currently connected — one query covers them all.
	const ownerIds = [...new Set([...connections].map((c) => c.ownerId).filter(Boolean))];
	const ownerDevs = [...new Set([...connections].map((c) => c.ownerDev).filter(Boolean))];
	if (!ownerIds.length && !ownerDevs.length) { scheduleNextPoll(); return; }

	polling = true;
	const pollStart = now;
	const watermark = new Date(lastPollAt - OVERLAP_MS).toISOString();
	try {
		const rows = await sql`
			SELECT ix.id, ix.pin_id, ix.agent_id, ix.type, ix.message,
			       ix.amount, ix.currency_mint, ix.payload, ix.created_at,
			       p.user_id AS owner_id, p.device_token AS owner_dev,
			       p.avatar_name, p.caption, ix.lat, ix.lng
			FROM irl_interactions ix
			JOIN irl_pins p ON p.id = ix.pin_id
			WHERE ix.created_at >= ${watermark}
			  AND ( p.user_id = ANY(${ownerIds}::uuid[])
			     OR p.device_token = ANY(${ownerDevs}::text[]) )
			ORDER BY ix.created_at ASC
			LIMIT ${ROW_LIMIT}
		`;
		breakerLogged = false; // a successful read clears the trip state

		let dispatched = 0;
		for (const row of rows || []) {
			if (!row.id || seen.has(row.id)) continue;
			seen.add(row.id);
			const createdMs = new Date(row.created_at).getTime();
			const safe = publicRow(row);
			for (const conn of connections) {
				// Only the owner, and only events that happened after they connected
				// (so a fresh tab is never spammed with the pre-connect backlog).
				if (createdMs <= conn.connectedAt) continue;
				if (!matches(conn, row)) continue;
				try { conn.send('interaction', safe); dispatched++; } catch { /* dead socket; its own cleanup unregisters it */ }
			}
		}

		if (dispatched > 0) {
			currentDelay = POLL_MS_MIN; // activity → speed back up
			idleTicks = 0;
		} else if (++idleTicks >= IDLE_TICKS_BEFORE_RAMP) {
			currentDelay = Math.min(POLL_MS_MAX, currentDelay * 2);
		}

		// Advance the watermark to this poll's start so the next tick covers exactly
		// [pollStart - overlap, nextPoll], no gaps; the overlap + `seen` cover the
		// boundary. Bound the dedupe set on a long-lived instance.
		lastPollAt = pollStart;
		if (seen.size > SEEN_MAX) {
			const keep = (rows || []).map((r) => r.id).filter(Boolean);
			seen = new Set(keep);
		}
	} catch (err) {
		if (isQuotaError(err)) {
			breakerUntil = Date.now() + BREAKER_COOLDOWN_MS;
			if (!breakerLogged) {
				console.error('[irl-stream] DB busy — pausing poll for', BREAKER_COOLDOWN_MS, 'ms');
				breakerLogged = true;
			}
		} else {
			console.error('[irl-stream] poll failed', err?.message || err);
		}
	} finally {
		polling = false;
		scheduleNextPoll();
	}
}

function addConnection(conn) {
	if (connections.size === 0) lastPollAt = Date.now(); // first connection arms the loop
	connections.add(conn);
	if (!pollTimer && !polling) {
		currentDelay = POLL_MS_MIN; // a new subscriber wants prompt updates
		idleTicks = 0;
		scheduleNextPoll();
	}
}

function removeConnection(conn) {
	connections.delete(conn);
	if (connections.size === 0) resetSharedState();
}

export default async function handleIrlInteractionsStream(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET'])) return;

	// Owner identity is server-derived, never trusted from a body. Signed-in owners
	// match by session; anonymous placements match by their device token (the same
	// dual identity the GET ?mine=1 inbox + PATCH mark-read use).
	const session = await getSessionUser(req, res).catch(() => null);
	const ownerId = session?.id ?? null;
	const rawTok = req.query?.deviceToken ?? null;
	const ownerDev = (typeof rawTok === 'string' && rawTok.length) ? rawTok : null;
	if (!ownerId && !ownerDev) {
		res.statusCode = 401;
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify({ error: 'sign in or pass deviceToken' }));
		return;
	}

	res.writeHead(200, {
		'Content-Type': 'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-transform',
		'Connection': 'keep-alive',
		// Vercel's edge gateway buffers responses by default; without this it holds
		// SSE frames until the function returns, defeating the stream.
		'X-Accel-Buffering': 'no',
	});

	let closed = false;
	const send = (event, data) => {
		if (closed || res.writableEnded) return;
		res.write(`event: ${event}\n`);
		res.write(`data: ${JSON.stringify(data)}\n\n`);
	};

	send('hello', { ts: Date.now() });

	// No DB configured (e.g. local dev without DATABASE_URL): keep the socket alive
	// with heartbeats so the client's fallback poll path still runs, emit nothing.
	if (!process.env.DATABASE_URL) {
		const hb = setInterval(() => {
			if (closed || res.writableEnded) { clearInterval(hb); return; }
			res.write(':hb\n\n');
		}, HEARTBEAT_MS);
		const stop = () => { closed = true; clearInterval(hb); try { res.end(); } catch {} };
		req.on('close', stop); res.on('close', stop); req.on('error', stop);
		return;
	}

	const conn = { ownerId, ownerDev, connectedAt: Date.now(), send };
	addConnection(conn);

	const startMs = Date.now();
	const heartbeat = setInterval(() => {
		if (closed || res.writableEnded) return;
		if (Date.now() - startMs > MAX_DURATION_MS) {
			res.write('retry: 1000\n\n'); // EventSource reconnects after ~1s
			cleanup();
			return;
		}
		res.write(':hb\n\n');
	}, HEARTBEAT_MS);

	function cleanup() {
		if (closed) return;
		closed = true;
		removeConnection(conn);
		clearInterval(heartbeat);
		if (!res.writableEnded) { try { res.end(); } catch { /* torn down */ } }
	}

	req.on('close', cleanup);
	req.on('error', cleanup);
	res.on('close', cleanup);
	res.on('error', cleanup);
}
