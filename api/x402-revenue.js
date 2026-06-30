// GET /api/x402-revenue — the public, real-time view of money flowing INTO the
// platform's own x402 paid endpoints.
//
// This is the mirror image of the Money Pulse (/api/pulse): the Pulse surfaces
// agent wallet SPEND (agent_custody_events); this surfaces endpoint REVENUE — the
// USDC that buyers pay to call our paid endpoints, recorded in x402_audit_log.
// See docs/x402-revenue.md.
//
// EVERY row is a real settled payment with an explorer-verifiable tx. There are no
// synthetic events — if the endpoints are quiet, the feed is honestly empty.
//
// Privacy: x402_audit_log also stores ip_address and user_agent. Those are
// operational and NEVER leave the server — this endpoint selects only the
// already-public, on-chain-verifiable fields (route, network, amount, tx, time)
// plus a truncated payer label.
//
// Views:
//   GET /api/x402-revenue                 — live feed of recent settlements (keyset)
//   GET /api/x402-revenue?since=<iso>      — delta poll: only settlements newer than cursor
//   GET /api/x402-revenue?view=stats&period=24h — aggregate revenue intelligence

import { sql, isDbUnavailableError } from './_lib/db.js';
import { cors, json, method, error, serverError, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { cacheGet, cacheSet } from './_lib/cache.js';
import { explorerTxUrl } from './_lib/avatar-wallet.js';
import { atomicsToUsdc } from './_lib/agent-paid-services.js';
import { buildRevenueReport, resolvePeriod } from './_lib/x402/revenue-analytics.js';

const STATS_TTL_S = 30;
const FEED_TTL_S = 8;
const FEED_DEFAULT_LIMIT = 30;
const FEED_MAX_LIMIT = 100;

// Shorten a wallet/payer address for display — full address stays on-chain.
function shortAddr(a) {
	if (!a || typeof a !== 'string') return null;
	return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Shape a settled-payment row into a privacy-safe public event.
function shapeSettlement(r) {
	const atomics = /^[0-9]+$/.test(String(r.amount_atomics || '')) ? Number(r.amount_atomics) : 0;
	const net = r.network || null;
	return {
		id: r.id,
		route: r.route || 'unknown',
		network: net,
		amount_usd: atomicsToUsdc(atomics),
		asset: r.asset || 'USDC',
		payer: shortAddr(r.payer),
		tx: r.tx_hash || null,
		tx_url: r.tx_hash ? explorerTxUrl(r.tx_hash, net) : null,
		ts: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
	};
}

// Settlement success-rate over the window: settled vs failed payment events.
async function settlementHealth(since) {
	const [row] = await sql`
		SELECT
			count(*) FILTER (WHERE event_type = 'payment_settled')::int AS settled,
			count(*) FILTER (WHERE event_type = 'payment_failed')::int  AS failed
		FROM x402_audit_log
		WHERE event_type IN ('payment_settled', 'payment_failed')
			AND (${since}::timestamptz IS NULL OR created_at >= ${since}::timestamptz)
	`;
	const settled = row?.settled || 0;
	const failed = row?.failed || 0;
	const total = settled + failed;
	return { settled, failed, success_rate: total > 0 ? Number((settled / total).toFixed(4)) : 1 };
}

async function handleStats(period) {
	const { since } = resolvePeriod(period);
	const [report, health] = await Promise.all([
		buildRevenueReport({ period }),
		settlementHealth(since),
	]);
	return { ...report, settlement_health: health };
}

async function handleFeed({ since, cursor, limit }) {
	// Newer-than (delta poll) takes precedence; otherwise keyset-paginate older.
	const rows = since
		? await sql`
			SELECT id, route, network, amount_atomics, asset, tx_hash, payer, created_at
			FROM x402_audit_log
			WHERE event_type = 'payment_settled'
				AND created_at > ${since}::timestamptz
			ORDER BY created_at DESC
			LIMIT ${limit}`
		: cursor
			? await sql`
				SELECT id, route, network, amount_atomics, asset, tx_hash, payer, created_at
				FROM x402_audit_log
				WHERE event_type = 'payment_settled'
					AND created_at < ${cursor}::timestamptz
				ORDER BY created_at DESC
				LIMIT ${limit}`
			: await sql`
				SELECT id, route, network, amount_atomics, asset, tx_hash, payer, created_at
				FROM x402_audit_log
				WHERE event_type = 'payment_settled'
				ORDER BY created_at DESC
				LIMIT ${limit}`;

	const events = rows.map(shapeSettlement);
	// Cursor for the next (older) page: the timestamp of the last row.
	const last = rows[rows.length - 1];
	const nextCursor = last
		? last.created_at instanceof Date
			? last.created_at.toISOString()
			: last.created_at
		: null;
	return {
		events,
		count: events.length,
		next_cursor: events.length === limit ? nextCursor : null,
	};
}

export default async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const view = url.searchParams.get('view') || 'feed';
	const period = url.searchParams.get('period') || '24h';
	const since = url.searchParams.get('since');
	const cursor = url.searchParams.get('cursor');
	const limit = Math.min(
		FEED_MAX_LIMIT,
		Math.max(1, Number(url.searchParams.get('limit')) || FEED_DEFAULT_LIMIT),
	);

	try {
		if (view === 'stats') {
			const cacheKey = `x402rev:stats:${resolvePeriod(period).key}`;
			let body = await cacheGet(cacheKey);
			if (body === null) {
				body = await handleStats(period);
				await cacheSet(cacheKey, body, STATS_TTL_S);
			}
			res.setHeader('cache-control', 'public, max-age=20');
			return json(res, 200, { data: body });
		}

		// Delta polls (since=) are never cached — they must reflect the latest row.
		if (since) {
			return json(res, 200, { data: await handleFeed({ since, limit }) });
		}

		// First page / older pages: a short cache smooths the live-poll cadence.
		const cacheKey = `x402rev:feed:${cursor || 'head'}:${limit}`;
		let body = await cacheGet(cacheKey);
		if (body === null) {
			body = await handleFeed({ cursor, limit });
			await cacheSet(cacheKey, body, FEED_TTL_S);
		}
		res.setHeader('cache-control', 'public, max-age=8');
		return json(res, 200, { data: body });
	} catch (err) {
		if (isDbUnavailableError(err)) {
			return error(res, 503, 'db_unavailable', 'revenue ledger is temporarily unavailable');
		}
		return serverError(res, 500, 'x402_revenue_error', err);
	}
}
