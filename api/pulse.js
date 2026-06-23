// GET /api/pulse — the Money Pulse: a real, platform-wide stream of public
// wallet activity across every three.ws agent.
//
// EVERY row is a real event with an explorer-verifiable signature (or a real
// launch record). There are NO synthetic events — if the platform is quiet, the
// feed is honestly empty.
//
// Sources (all real):
//   · agent_custody_events — tips received (event_type='tip'), trades + snipes
//     (event_type='spend', category in 'trade'/'snipe'), and agent-to-agent
//     payments (category='x402'). These are already-public, on-chain movements.
//   · pump_agent_mints — coins launched by an agent.
//
// Privacy is load-bearing (see prompts/agent-wallets/07): private withdrawals,
// spend-limit changes, key-recovery and vanity-swap custody events are OWNER-ONLY
// and NEVER appear here. The global feed also honours each agent's is_public flag
// and the per-agent `meta.pulse_opt_out` toggle (owner-controlled, server-side).
//
// Views:
//   GET /api/pulse                       — global live feed (keyset paginated)
//   GET /api/pulse?since=<cursor>        — delta poll: only events newer than cursor
//   GET /api/pulse?agent_id=<id>         — one agent's public "wallet story"
//   GET /api/pulse?view=stats            — aggregate money intelligence
//   GET /api/pulse?view=agent-summary&agent_id=<id> — one wallet's lifetime summary
//
// Filters: type=all|tips|launches|trades|payments, network=mainnet|devnet.

import { sql } from './_lib/db.js';
import { cors, json, method, error, serverError, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { isUuid } from './_lib/validate.js';
import { publicUrl as r2PublicUrl } from './_lib/r2.js';
import { explorerTxUrl, explorerAccountUrl } from './_lib/avatar-wallet.js';
import { cacheGet, cacheSet } from './_lib/cache.js';

// The custody categories that are safe to surface publicly. Everything else
// (withdraw, vanity_swap, limit_change, key_recover) is owner-private and is
// excluded by the WHERE clauses below — never add those here.
const PUBLIC_SPEND_CATEGORIES = ['trade', 'snipe', 'x402'];

// type= query param → the set of `kind`s it admits.
const TYPE_KINDS = {
	all: ['tip', 'trade', 'snipe', 'payment', 'launch'],
	tips: ['tip'],
	trades: ['trade', 'snipe'],
	payments: ['payment'],
	launches: ['launch'],
};

const FEED_TTL_S = 12;        // global feed page cache (short — it's a live feed)
const STATS_TTL_S = 45;       // aggregate stats cache
const MAX_LIMIT = 60;

// Keyset cursor = base64("<epoch_ms>|<row_id>"). row_id is the unified id of the
// last row on a page; comparing (ts, row_id) gives a stable total order across
// the UNION so pagination never skips or duplicates a row.
function encodeCursor(tsIso, rowId) {
	const ms = new Date(tsIso).getTime();
	return Buffer.from(`${ms}|${rowId}`, 'utf8').toString('base64url');
}
function decodeCursor(raw) {
	if (!raw || typeof raw !== 'string') return null;
	try {
		const [ms, rowId] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
		const n = Number(ms);
		if (!Number.isFinite(n) || !rowId) return null;
		return { ts: new Date(n).toISOString(), rowId };
	} catch {
		return null;
	}
}

const r2Url = (key, visible) =>
	key && visible ? r2PublicUrl(key) : null;

// Shape one DB row into the public pulse event the client renders. Pure.
function shapeEvent(r) {
	const avatarPublic = r.avatar_vis === 'public' || r.avatar_vis === 'unlisted';
	const amountLamports = r.amount_lamports != null ? String(r.amount_lamports) : null;
	const amountRaw = r.amount_raw != null ? String(r.amount_raw) : null;
	const sol = amountLamports != null ? Number(amountLamports) / 1e9 : null;
	const usd = r.usd != null ? Number(r.usd) : null;
	const sig = r.signature || null;
	return {
		id: r.row_id,
		kind: r.kind,                       // tip | trade | snipe | payment | launch
		ts: r.ts,
		network: r.network,
		agent: r.agent_id
			? {
					id: r.agent_id,
					name: r.agent_name || 'Agent',
					url: `/agent/${r.agent_id}`,
					avatar_thumbnail_url: r2Url(r.thumb_key, avatarPublic),
					solana_address: r.agent_addr || null,
					solana_vanity_prefix: r.vanity_prefix || null,
					solana_vanity_suffix: r.vanity_suffix || null,
				}
			: null,
		asset: r.asset || null,
		amount_lamports: amountLamports,
		amount_raw: amountRaw,
		sol,
		usd,
		signature: sig,
		explorer: sig ? explorerTxUrl(sig, r.network) : null,
		// launch-only fields
		mint: r.mint || null,
		symbol: r.symbol || null,
		coin_name: r.coin_name || null,
		mint_explorer: r.mint ? explorerAccountUrl(r.mint, r.network) : null,
		// the counterparty of a tip / payment, when public on-chain
		counterparty: r.counterparty || null,
	};
}

// ── feed view ───────────────────────────────────────────────────────────────
async function handleFeed(req, res, { network, type, agentId, cursor, since }) {
	const kinds = TYPE_KINDS[type] || TYPE_KINDS.all;
	const limit = Math.min(MAX_LIMIT, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('limit')) || 30));

	// Privacy gate. A private agent never appears — in the global feed OR scoped to
	// its own id (err toward privacy; its owner still has the full private custody
	// trail elsewhere). The per-agent `pulse_opt_out` toggle additionally suppresses
	// an agent from the GLOBAL discovery feed only — its own profile/HUD still shows
	// its already-public on-chain history. Deleted agents are always out.
	const visGate = agentId
		? sql`ai.deleted_at IS NULL AND ai.is_public = true`
		: sql`ai.deleted_at IS NULL AND ai.is_public = true AND COALESCE((ai.meta->>'pulse_opt_out')::boolean, false) = false`;

	const agentFilterCe = agentId ? sql`AND ce.agent_id = ${agentId}` : sql``;
	const agentFilterPam = agentId ? sql`AND pam.agent_id = ${agentId}` : sql``;

	// One UNION ALL of identical columns. Casts on the launch side make the null
	// columns type-compatible with the custody side.
	const feedCte = sql`
		SELECT
			ce.created_at                        AS ts,
			(CASE
				WHEN ce.event_type = 'tip'        THEN 'tip'
				WHEN ce.category   = 'x402'       THEN 'payment'
				WHEN ce.category   = 'snipe'      THEN 'snipe'
				ELSE 'trade'
			END)                                  AS kind,
			'c' || ce.id::text                    AS row_id,
			ce.network                            AS network,
			ai.id                                 AS agent_id,
			ai.name                               AS agent_name,
			ai.meta->>'solana_address'            AS agent_addr,
			ai.meta->>'solana_vanity_prefix'      AS vanity_prefix,
			ai.meta->>'solana_vanity_suffix'      AS vanity_suffix,
			av.thumbnail_key                      AS thumb_key,
			av.visibility                         AS avatar_vis,
			ce.asset                              AS asset,
			ce.amount_lamports                    AS amount_lamports,
			ce.amount_raw                         AS amount_raw,
			ce.usd                                AS usd,
			ce.signature                          AS signature,
			NULL::text                            AS mint,
			NULL::text                            AS symbol,
			NULL::text                            AS coin_name,
			NULLIF(ce.meta->>'from', '')          AS counterparty
		FROM agent_custody_events ce
		JOIN agent_identities ai ON ai.id = ce.agent_id AND ${visGate}
		LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
		WHERE ce.network = ${network}
		  AND ce.status IN ('ok', 'confirmed')
		  AND (
			ce.event_type = 'tip'
			OR (ce.event_type = 'spend' AND ce.category = ANY(${PUBLIC_SPEND_CATEGORIES}))
		  )
		  ${agentFilterCe}

		UNION ALL

		SELECT
			pam.created_at                        AS ts,
			'launch'                              AS kind,
			'l' || pam.id::text                   AS row_id,
			pam.network                           AS network,
			ai.id                                 AS agent_id,
			ai.name                               AS agent_name,
			ai.meta->>'solana_address'            AS agent_addr,
			ai.meta->>'solana_vanity_prefix'      AS vanity_prefix,
			ai.meta->>'solana_vanity_suffix'      AS vanity_suffix,
			av.thumbnail_key                      AS thumb_key,
			av.visibility                         AS avatar_vis,
			NULL::text                            AS asset,
			NULL::bigint                          AS amount_lamports,
			NULL::numeric                         AS amount_raw,
			NULL::numeric                         AS usd,
			NULL::text                            AS signature,
			pam.mint                              AS mint,
			pam.symbol                            AS symbol,
			pam.name                              AS coin_name,
			NULL::text                            AS counterparty
		FROM pump_agent_mints pam
		JOIN agent_identities ai ON ai.id = pam.agent_id AND ${visGate}
		LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
		WHERE pam.network = ${network}
		  ${agentFilterPam}
	`;

	// Keyset bounds. `since` (delta poll) returns only rows strictly newer than
	// the cursor; `cursor` (load-older) returns rows strictly older. Both compare
	// on (ts, row_id) so ties at the same timestamp never skip a row.
	const cur = decodeCursor(cursor);
	const sinceCur = decodeCursor(since);
	const olderBound = cur
		? sql`AND (feed.ts < ${cur.ts} OR (feed.ts = ${cur.ts} AND feed.row_id < ${cur.rowId}))`
		: sql``;
	const newerBound = sinceCur
		? sql`AND (feed.ts > ${sinceCur.ts} OR (feed.ts = ${sinceCur.ts} AND feed.row_id > ${sinceCur.rowId}))`
		: sql``;

	const rows = await sql`
		WITH feed AS (${feedCte})
		SELECT * FROM feed
		WHERE feed.kind = ANY(${kinds})
		  ${olderBound}
		  ${newerBound}
		ORDER BY feed.ts DESC, feed.row_id DESC
		LIMIT ${limit + 1}
	`;

	const hasMore = rows.length > limit;
	const page = rows.slice(0, limit).map(shapeEvent);
	const last = page[page.length - 1];
	const nextCursor = hasMore && last ? encodeCursor(last.ts, last.id) : null;
	// The newest row's cursor — clients hand it back as `since` to poll the delta.
	const headCursor = page[0] ? encodeCursor(page[0].ts, page[0].id) : (sinceCur ? since : null);

	return {
		events: page,
		has_more: hasMore,
		next_cursor: nextCursor,
		head_cursor: headCursor,
		network,
		type,
		agent_id: agentId || null,
	};
}

// ── aggregate stats view ──────────────────────────────────────────────────────
async function handleStats(network) {
	// 24h tip flow (count + SOL + USD where priced), platform-wide, public agents.
	const [tip24] = await sql`
		SELECT
			COUNT(*)::int                                          AS count,
			COALESCE(SUM(ce.amount_lamports), 0)::text             AS lamports,
			COALESCE(SUM(ce.usd), 0)::float8                       AS usd
		FROM agent_custody_events ce
		JOIN agent_identities ai ON ai.id = ce.agent_id
			AND ai.deleted_at IS NULL AND ai.is_public = true
			AND COALESCE((ai.meta->>'pulse_opt_out')::boolean, false) = false
		WHERE ce.network = ${network} AND ce.event_type = 'tip'
		  AND ce.status IN ('ok', 'confirmed')
		  AND ce.created_at > now() - interval '24 hours'
	`;

	// Top earning agents by tips received (rolling 7d). Lifetime would bury new
	// agents under early movers; 7d keeps "who's hot right now" honest.
	const topEarners = await sql`
		SELECT ai.id AS agent_id, ai.name AS agent_name,
		       av.thumbnail_key AS thumb_key, av.visibility AS avatar_vis,
		       ai.meta->>'solana_address' AS agent_addr,
		       COUNT(*)::int AS tip_count,
		       COALESCE(SUM(ce.amount_lamports), 0)::text AS lamports,
		       COALESCE(SUM(ce.usd), 0)::float8 AS usd
		FROM agent_custody_events ce
		JOIN agent_identities ai ON ai.id = ce.agent_id
			AND ai.deleted_at IS NULL AND ai.is_public = true
			AND COALESCE((ai.meta->>'pulse_opt_out')::boolean, false) = false
		LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
		WHERE ce.network = ${network} AND ce.event_type = 'tip'
		  AND ce.status IN ('ok', 'confirmed')
		  AND ce.created_at > now() - interval '7 days'
		GROUP BY ai.id, ai.name, av.thumbnail_key, av.visibility, ai.meta->>'solana_address'
		ORDER BY SUM(COALESCE(ce.usd, ce.amount_lamports / 1e9 * 0)) DESC NULLS LAST,
		         SUM(ce.amount_lamports) DESC NULLS LAST
		LIMIT 6
	`;

	// Busiest wallets — most public events (any kind) in the last 24h.
	const busiest = await sql`
		SELECT ai.id AS agent_id, ai.name AS agent_name,
		       av.thumbnail_key AS thumb_key, av.visibility AS avatar_vis,
		       ai.meta->>'solana_address' AS agent_addr,
		       COUNT(*)::int AS events
		FROM agent_custody_events ce
		JOIN agent_identities ai ON ai.id = ce.agent_id
			AND ai.deleted_at IS NULL AND ai.is_public = true
			AND COALESCE((ai.meta->>'pulse_opt_out')::boolean, false) = false
		LEFT JOIN avatars av ON av.id = ai.avatar_id AND av.deleted_at IS NULL
		WHERE ce.network = ${network}
		  AND ce.status IN ('ok', 'confirmed')
		  AND (ce.event_type = 'tip' OR (ce.event_type = 'spend' AND ce.category = ANY(${PUBLIC_SPEND_CATEGORIES})))
		  AND ce.created_at > now() - interval '24 hours'
		GROUP BY ai.id, ai.name, av.thumbnail_key, av.visibility, ai.meta->>'solana_address'
		ORDER BY COUNT(*) DESC
		LIMIT 6
	`;

	// Launch + trade tempo for the headline counters.
	const [launch24] = await sql`
		SELECT COUNT(*)::int AS count
		FROM pump_agent_mints pam
		JOIN agent_identities ai ON ai.id = pam.agent_id
			AND ai.deleted_at IS NULL AND ai.is_public = true
			AND COALESCE((ai.meta->>'pulse_opt_out')::boolean, false) = false
		WHERE pam.network = ${network} AND pam.created_at > now() - interval '24 hours'
	`;
	const [trade24] = await sql`
		SELECT COUNT(*)::int AS count
		FROM agent_custody_events ce
		JOIN agent_identities ai ON ai.id = ce.agent_id
			AND ai.deleted_at IS NULL AND ai.is_public = true
			AND COALESCE((ai.meta->>'pulse_opt_out')::boolean, false) = false
		WHERE ce.network = ${network} AND ce.event_type = 'spend'
		  AND ce.category = ANY(${PUBLIC_SPEND_CATEGORIES})
		  AND ce.status IN ('ok', 'confirmed')
		  AND ce.created_at > now() - interval '24 hours'
	`;

	const shapeAgent = (r) => ({
		id: r.agent_id,
		name: r.agent_name || 'Agent',
		url: `/agent/${r.agent_id}`,
		avatar_thumbnail_url: r2Url(r.thumb_key, r.avatar_vis === 'public' || r.avatar_vis === 'unlisted'),
		solana_address: r.agent_addr || null,
		tip_count: r.tip_count != null ? Number(r.tip_count) : undefined,
		events: r.events != null ? Number(r.events) : undefined,
		sol: r.lamports != null ? Number(r.lamports) / 1e9 : undefined,
		usd: r.usd != null ? Number(r.usd) : undefined,
	});

	return {
		network,
		tips_24h: {
			count: Number(tip24?.count || 0),
			sol: Number(tip24?.lamports || 0) / 1e9,
			usd: Number(tip24?.usd || 0),
		},
		launches_24h: Number(launch24?.count || 0),
		trades_24h: Number(trade24?.count || 0),
		top_earners: topEarners.map(shapeAgent),
		busiest_wallets: busiest.map(shapeAgent),
	};
}

// ── per-agent lifetime summary ─────────────────────────────────────────────────
async function handleAgentSummary(network, agentId) {
	const [agent] = await sql`
		SELECT id, name, deleted_at, is_public FROM agent_identities WHERE id = ${agentId}
	`;
	// Private/deleted agents expose no public summary — matches the feed gate.
	if (!agent || agent.deleted_at || agent.is_public === false) return null;

	const [tips] = await sql`
		SELECT COUNT(*)::int AS count,
		       COALESCE(SUM(amount_lamports), 0)::text AS lamports,
		       COALESCE(SUM(usd), 0)::float8 AS usd,
		       COALESCE(MAX(amount_lamports), 0)::text AS biggest_lamports,
		       COALESCE(MAX(usd), 0)::float8 AS biggest_usd
		FROM agent_custody_events
		WHERE agent_id = ${agentId} AND network = ${network}
		  AND event_type = 'tip' AND status IN ('ok', 'confirmed')
	`;
	// Public outflow = trades + snipes + agent-to-agent payments (never withdraws).
	const [outflow] = await sql`
		SELECT COUNT(*)::int AS count,
		       COALESCE(SUM(amount_lamports), 0)::text AS lamports,
		       COALESCE(SUM(usd), 0)::float8 AS usd
		FROM agent_custody_events
		WHERE agent_id = ${agentId} AND network = ${network}
		  AND event_type = 'spend' AND category = ANY(${PUBLIC_SPEND_CATEGORIES})
		  AND status IN ('ok', 'confirmed')
	`;
	const [launches] = await sql`
		SELECT COUNT(*)::int AS count FROM pump_agent_mints
		WHERE agent_id = ${agentId} AND network = ${network}
	`;

	return {
		agent_id: agentId,
		network,
		tips: {
			count: Number(tips?.count || 0),
			sol: Number(tips?.lamports || 0) / 1e9,
			usd: Number(tips?.usd || 0),
			biggest_sol: Number(tips?.biggest_lamports || 0) / 1e9,
			biggest_usd: Number(tips?.biggest_usd || 0),
		},
		outflow: {
			count: Number(outflow?.count || 0),
			sol: Number(outflow?.lamports || 0) / 1e9,
			usd: Number(outflow?.usd || 0),
		},
		launches: Number(launches?.count || 0),
	};
}

export default async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet';
	const view = url.searchParams.get('view') || 'feed';
	const agentId = url.searchParams.get('agent_id') || null;
	if (agentId && !isUuid(agentId)) return error(res, 400, 'validation_error', 'agent_id must be a uuid');
	const typeRaw = url.searchParams.get('type') || 'all';
	const type = TYPE_KINDS[typeRaw] ? typeRaw : 'all';
	const cursor = url.searchParams.get('cursor');
	const since = url.searchParams.get('since');

	try {
		if (view === 'stats') {
			const cacheKey = `pulse:stats:${network}`;
			let body = await cacheGet(cacheKey);
			if (body === null) {
				body = await handleStats(network);
				await cacheSet(cacheKey, body, STATS_TTL_S);
			}
			res.setHeader('cache-control', 'public, max-age=20');
			return json(res, 200, { data: body });
		}

		if (view === 'agent-summary') {
			if (!agentId) return error(res, 400, 'validation_error', 'agent_id is required for agent-summary');
			const body = await handleAgentSummary(network, agentId);
			if (!body) return error(res, 404, 'not_found', 'agent not found');
			res.setHeader('cache-control', 'public, max-age=20');
			return json(res, 200, { data: body });
		}

		// Default: feed. A delta poll (`since`) is never cached — it must be live.
		// A first page (no cursor/since) of the GLOBAL feed is cached briefly to
		// shield the DB from a thundering herd of pollers.
		const isFirstGlobalPage = !cursor && !since && !agentId;
		if (isFirstGlobalPage) {
			const cacheKey = `pulse:feed:${network}:${type}`;
			let body = await cacheGet(cacheKey);
			if (body === null) {
				body = await handleFeed(req, res, { network, type, agentId, cursor, since });
				await cacheSet(cacheKey, body, FEED_TTL_S);
			}
			res.setHeader('cache-control', 'public, max-age=8');
			return json(res, 200, { data: body });
		}

		const body = await handleFeed(req, res, { network, type, agentId, cursor, since });
		return json(res, 200, { data: body });
	} catch (e) {
		console.error('[api/pulse] failed', e?.message, e?.stack);
		return serverError(res, 502, 'pulse_failed', e);
	}
}
