// GET /api/feed-stream — Server-Sent Events for the live activity ticker.
//
// The widget (public/feed.js) does one fast GET /api/feed for first paint, then
// opens this stream. Every event produced anywhere on the platform (see
// api/_lib/feed.js) lands in the capped Redis list `feed:events`; this handler
// tails that list and pushes only the events that appear AFTER the client
// connected, so new activity reaches an open tab within one poll tick (~1.5s)
// instead of the 20s the bare poll path settles for.
//
// Why poll Redis instead of native pub/sub? The Upstash REST client this repo
// uses has no long-lived SUBSCRIBE; a cheap LRANGE of the list head every tick
// (one command, deduped by event id) survives Vercel's stateless model and costs
// far less than every open tab independently polling /api/feed. One warm function
// fans a single Redis read out to its connected clients.
//
// Vercel: registered with maxDuration 300 in vercel.json so the connection can
// stay open up to the Hobby ceiling; we send a `retry` directive and close just
// before the hard timeout, and EventSource reconnects automatically.

import { Redis } from '@upstash/redis';
import { cors, method } from './_lib/http.js';
import { env } from './_lib/env.js';

const FEED_KEY = 'feed:events';
const HEARTBEAT_MS = 15_000;
const POLL_MS = 1_500;
const HEAD_N = 30; // how far back we scan each tick for unseen events
const MAX_DURATION_MS = 275_000; // close before Vercel's 300s hard timeout

function redis() {
	if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
	return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
}

function parseRow(row) {
	if (row && typeof row === 'object') return row; // Upstash auto-deserializes
	if (typeof row !== 'string') return null;
	try { return JSON.parse(row); } catch { return null; }
}

export default async function handleFeedStream(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

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

	const r = redis();
	send('hello', { ts: Date.now() });
	// No Redis configured (e.g. local dev): keep the socket alive with heartbeats
	// so the client's fallback poll path still runs, but emit nothing.
	if (!r) {
		const hb = setInterval(() => {
			if (closed || res.writableEnded) { clearInterval(hb); return; }
			res.write(':hb\n\n');
		}, HEARTBEAT_MS);
		const stop = () => { closed = true; clearInterval(hb); try { res.end(); } catch {} };
		req.on('close', stop); res.on('close', stop);
		return;
	}

	// Snapshot the current head so we only push events that arrive AFTER connect —
	// the client already rendered the backlog from GET /api/feed.
	const seen = new Set();
	let primed = false;
	let polling = false;

	const tick = async () => {
		if (closed || polling) return;
		polling = true;
		try {
			const rows = await r.lrange(FEED_KEY, 0, HEAD_N - 1);
			const fresh = [];
			for (const row of rows || []) {
				const obj = parseRow(row);
				if (!obj || !obj.id) continue;
				if (!seen.has(obj.id)) {
					seen.add(obj.id);
					if (primed) fresh.push(obj); // skip the initial backlog
				}
			}
			primed = true;
			// List is newest-first; emit oldest→newest so the client prepends in order.
			for (let i = fresh.length - 1; i >= 0; i--) send('event', fresh[i]);
			// Bound the seen-set so a long-lived connection can't grow unbounded.
			if (seen.size > HEAD_N * 8) {
				const keep = (rows || []).map(parseRow).filter(Boolean).map((o) => o.id);
				seen.clear();
				for (const id of keep) if (id) seen.add(id);
			}
		} catch (err) {
			console.error('[feed-stream] poll failed', err?.message || err);
		} finally {
			polling = false;
		}
	};

	const startMs = Date.now();
	const heartbeat = setInterval(() => {
		if (closed || res.writableEnded) return;
		if (Date.now() - startMs > MAX_DURATION_MS) {
			res.write('retry: 1000\n\n');
			cleanup();
			return;
		}
		res.write(':hb\n\n');
	}, HEARTBEAT_MS);
	const poll = setInterval(tick, POLL_MS);

	function cleanup() {
		if (closed) return;
		closed = true;
		clearInterval(heartbeat);
		clearInterval(poll);
		if (!res.writableEnded) { try { res.end(); } catch { /* torn down */ } }
	}

	req.on('close', cleanup);
	req.on('error', cleanup);
	res.on('close', cleanup);
	res.on('error', cleanup);
}
