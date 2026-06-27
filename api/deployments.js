// GET /api/deployments — the on-chain agent deployment feed: every agent
// registered on the ERC-8004 Identity Registry, the moment it lands on-chain,
// across every supported EVM chain.
//
// EVERY row is a real registration crawled from chain logs — there are NO
// synthetic entries. The source is `erc8004_agents_index` (populated by
// api/cron/erc8004-crawl.js via Etherscan getLogs against the registries in
// api/_lib/erc8004-chains.js). If a chain is quiet, the feed is honestly empty.
//
// Views:
//   GET /api/deployments                  — live feed, keyset paginated (newest first)
//   GET /api/deployments?cursor=<c>       — load older
//   GET /api/deployments?view=stats       — aggregate registry intelligence
//
// Filters: network=mainnet|testnet, chain=<chainId>, kind=all|3d|x402.

import { sql, isDbUnavailableError } from './_lib/db.js';
import { cors, json, method, error, serverError, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { cacheGet, cacheSet } from './_lib/cache.js';
import { CHAINS, CHAIN_BY_ID, tokenExplorerUrl, addressExplorerUrl } from './_lib/erc8004-chains.js';

const FEED_TTL_S = 20; // feed page cache — registrations land in minutes, not seconds
const STATS_TTL_S = 60; // aggregate stats cache
const MAX_LIMIT = 60;

// Chain-id sets per network class, derived once from the canonical chain table so
// the network toggle never drifts from the deployed registries.
const MAINNET_CHAIN_IDS = CHAINS.filter((c) => !c.testnet).map((c) => c.id);
const TESTNET_CHAIN_IDS = CHAINS.filter((c) => c.testnet).map((c) => c.id);

function txExplorerUrl(chainId, tx) {
	const c = CHAIN_BY_ID[chainId];
	return c && tx ? `${c.explorer}/tx/${tx}` : null;
}

// Keyset cursor = base64("<epoch_ms>|<chain_id>|<agent_id>"). Ordering on
// (registered_at, chain_id, agent_id) gives a stable total order so paging never
// skips or repeats a row even as the crawler inserts concurrently.
function encodeCursor(tsIso, chainId, agentId) {
	const ms = new Date(tsIso).getTime();
	return Buffer.from(`${ms}|${chainId}|${agentId}`, 'utf8').toString('base64url');
}
function decodeCursor(raw) {
	if (!raw || typeof raw !== 'string') return null;
	try {
		const [ms, chainId, agentId] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
		const n = Number(ms);
		const cid = Number(chainId);
		if (!Number.isFinite(n) || !Number.isFinite(cid) || !agentId) return null;
		return { ts: new Date(n).toISOString(), chainId: cid, agentId };
	} catch {
		return null;
	}
}

// Shape one index row into the public deployment event the client renders. Pure.
function shapeRow(r) {
	const chain = CHAIN_BY_ID[r.chain_id] || null;
	return {
		chain_id: r.chain_id,
		chain: chain ? chain.name : `Chain ${r.chain_id}`,
		testnet: chain ? !!chain.testnet : false,
		agent_id: r.agent_id,
		name: r.name || null,
		description: r.description || null,
		image: r.image || null,
		owner: r.owner || null,
		has_3d: !!r.has_3d,
		x402_support: !!r.x402_support,
		registered_at: r.registered_at,
		agent_explorer: tokenExplorerUrl(r.chain_id, r.agent_id),
		owner_explorer: r.owner ? addressExplorerUrl(r.chain_id, r.owner) : null,
		tx_explorer: txExplorerUrl(r.chain_id, r.registered_tx),
	};
}

function chainIdsFor(network) {
	return network === 'testnet' ? TESTNET_CHAIN_IDS : MAINNET_CHAIN_IDS;
}

// ── feed view ───────────────────────────────────────────────────────────────
async function handleFeed({ network, chain, kind, cursor }) {
	const chainIds = chainIdsFor(network);
	const limit = MAX_LIMIT;

	const chainFilter = chain ? sql`AND e.chain_id = ${chain}` : sql``;
	const kindFilter =
		kind === '3d' ? sql`AND e.has_3d = true` : kind === 'x402' ? sql`AND e.x402_support = true` : sql``;

	// Only rows with a known registration time can sit in a chronological feed;
	// lazily-indexed rows without a timestamp are counted in stats but not placed
	// in time here (we never invent an order).
	const cur = decodeCursor(cursor);
	const olderBound = cur
		? sql`AND (e.registered_at < ${cur.ts}
			OR (e.registered_at = ${cur.ts} AND e.chain_id < ${cur.chainId})
			OR (e.registered_at = ${cur.ts} AND e.chain_id = ${cur.chainId} AND e.agent_id < ${cur.agentId}))`
		: sql``;

	const rows = await sql`
		SELECT e.chain_id, e.agent_id, e.owner, e.name, e.description, e.image,
		       e.has_3d, e.x402_support, e.registered_at, e.registered_tx
		FROM erc8004_agents_index e
		WHERE e.active = true
		  AND e.registered_at IS NOT NULL
		  AND e.chain_id = ANY(${chainIds})
		  ${chainFilter}
		  ${kindFilter}
		  ${olderBound}
		ORDER BY e.registered_at DESC, e.chain_id DESC, e.agent_id DESC
		LIMIT ${limit + 1}
	`;

	const hasMore = rows.length > limit;
	const page = rows.slice(0, limit).map(shapeRow);
	const last = page[page.length - 1];
	const nextCursor = hasMore && last ? encodeCursor(last.registered_at, last.chain_id, last.agent_id) : null;

	return {
		deployments: page,
		has_more: hasMore,
		next_cursor: nextCursor,
		network,
		chain: chain || null,
		kind,
	};
}

// ── aggregate stats view ──────────────────────────────────────────────────────
async function handleStats(network) {
	const chainIds = chainIdsFor(network);

	// Headline totals in one pass: registry size, capability mix, deploy tempo.
	const [totals] = await sql`
		SELECT
			COUNT(*)::int                                                              AS total,
			COUNT(*) FILTER (WHERE has_3d)::int                                        AS with_3d,
			COUNT(*) FILTER (WHERE x402_support)::int                                  AS x402,
			COUNT(DISTINCT chain_id)::int                                             AS chains,
			COUNT(*) FILTER (WHERE registered_at > now() - interval '24 hours')::int  AS d24,
			COUNT(*) FILTER (WHERE registered_at > now() - interval '7 days')::int    AS d7
		FROM erc8004_agents_index
		WHERE active = true AND chain_id = ANY(${chainIds})
	`;

	// Most-populated chains — the registry's footprint at a glance.
	const topChainsRaw = await sql`
		SELECT chain_id, COUNT(*)::int AS n
		FROM erc8004_agents_index
		WHERE active = true AND chain_id = ANY(${chainIds})
		GROUP BY chain_id
		ORDER BY n DESC
		LIMIT 8
	`;

	// 7-day registration series — a zero-filled daily count for the sparkline.
	const series = await sql`
		WITH days AS (
			SELECT generate_series(
				date_trunc('day', now()) - interval '6 days',
				date_trunc('day', now()),
				interval '1 day'
			) AS day
		),
		ev AS (
			SELECT date_trunc('day', registered_at) AS day, COUNT(*)::int AS n
			FROM erc8004_agents_index
			WHERE active = true AND chain_id = ANY(${chainIds})
			  AND registered_at > date_trunc('day', now()) - interval '6 days'
			GROUP BY 1
		)
		SELECT to_char(days.day, 'Dy')        AS label,
		       to_char(days.day, 'YYYY-MM-DD') AS day,
		       COALESCE(ev.n, 0)               AS registrations
		FROM days
		LEFT JOIN ev ON ev.day = days.day
		ORDER BY days.day
	`;

	const total = Number(totals?.total || 0);
	const topChains = topChainsRaw.map((r) => {
		const c = CHAIN_BY_ID[r.chain_id] || null;
		return {
			chain_id: r.chain_id,
			chain: c ? c.name : `Chain ${r.chain_id}`,
			count: Number(r.n || 0),
			explorer: c ? c.explorer : null,
		};
	});

	return {
		network,
		total_agents: total,
		active_chains: Number(totals?.chains || 0),
		deployed_24h: Number(totals?.d24 || 0),
		deployed_7d: Number(totals?.d7 || 0),
		with_3d: Number(totals?.with_3d || 0),
		with_3d_pct: total ? Math.round((Number(totals.with_3d) / total) * 100) : 0,
		x402: Number(totals?.x402 || 0),
		x402_pct: total ? Math.round((Number(totals.x402) / total) * 100) : 0,
		top_chains: topChains,
		series_7d: series.map((r) => ({
			label: r.label,
			day: r.day,
			registrations: Number(r.registrations || 0),
		})),
	};
}

export default async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const network = url.searchParams.get('network') === 'testnet' ? 'testnet' : 'mainnet';
	const view = url.searchParams.get('view') || 'feed';
	const chainRaw = Number(url.searchParams.get('chain'));
	const chain = Number.isInteger(chainRaw) && chainRaw > 0 ? chainRaw : null;
	const kindRaw = url.searchParams.get('kind');
	const kind = kindRaw === '3d' || kindRaw === 'x402' ? kindRaw : 'all';
	const cursor = url.searchParams.get('cursor');

	try {
		if (view === 'stats') {
			const cacheKey = `deployments:stats:${network}`;
			let body = await cacheGet(cacheKey);
			if (body === null) {
				body = await handleStats(network);
				await cacheSet(cacheKey, body, STATS_TTL_S);
			}
			res.setHeader('cache-control', 'public, max-age=30');
			return json(res, 200, { data: body });
		}

		// First page of the unfiltered global feed is cached briefly to shield the DB
		// from a thundering herd; filtered/paged requests hit the DB directly.
		const isFirstGlobalPage = !cursor && !chain && kind === 'all';
		if (isFirstGlobalPage) {
			const cacheKey = `deployments:feed:${network}`;
			let body = await cacheGet(cacheKey);
			if (body === null) {
				body = await handleFeed({ network, chain, kind, cursor });
				await cacheSet(cacheKey, body, FEED_TTL_S);
			}
			res.setHeader('cache-control', 'public, max-age=12');
			return json(res, 200, { data: body });
		}

		const body = await handleFeed({ network, chain, kind, cursor });
		return json(res, 200, { data: body });
	} catch (e) {
		if (isDbUnavailableError(e)) {
			console.warn('[api/deployments] db unavailable:', e?.message);
			return serverError(res, 503, 'service_unavailable', e);
		}
		console.error('[api/deployments] failed', e?.message, e?.stack);
		return serverError(res, 502, 'deployments_failed', e);
	}
}
