/**
 * GET /api/trending?window=24h|7d|all&limit=10
 *
 * Returns trending agents (by real chat activity) and top Oracle conviction
 * coins — two rankings powering the public /trending leaderboard.
 *
 * Agent ranking:
 *   24h / 7d  — count of usage_events (kind='llm') in the window, per public agent
 *   all time  — agent_identities.chat_count (pre-aggregated) + views_count
 *
 * Coin ranking:
 *   always    — oracle_conviction.score desc, filtered to recent scored_at (<24h stale)
 *
 * Cache: 2 min public CDN (trending doesn't need sub-minute freshness).
 */

import { cors, json, method, wrap, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { sql } from './_lib/db.js';
import { publicUrl } from './_lib/r2.js';

const WINDOWS = new Set(['24h', '7d', 'all']);
const WINDOW_INTERVAL = { '24h': '1 day', '7d': '7 days' };

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const p = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const win   = WINDOWS.has(p.get('window')) ? p.get('window') : '24h';
	const limit = Math.min(20, Math.max(1, Number(p.get('limit') || 10)));

	// ── Agents ─────────────────────────────────────────────────────────────
	let agentRows;
	if (win === 'all') {
		// Use pre-aggregated columns for all-time (fast, indexed)
		agentRows = await sql`
			select
				i.id,
				i.name,
				i.description,
				i.chat_count,
				i.meta,
				a.thumbnail_key as avatar_thumbnail_key,
				a.visibility    as avatar_visibility
			from agent_identities i
			left join avatars a on a.id = i.avatar_id and a.deleted_at is null
			where i.deleted_at is null
			  and i.is_public = true
			  and i.chat_count > 0
			order by i.chat_count desc nulls last
			limit ${limit}
		`.catch(() => []);
	} else {
		// Count real LLM usage events in the time window per public agent
		const interval = WINDOW_INTERVAL[win];
		agentRows = await sql`
			select
				i.id,
				i.name,
				i.description,
				i.chat_count,
				i.meta,
				a.thumbnail_key as avatar_thumbnail_key,
				a.visibility    as avatar_visibility,
				count(u.id)::int as window_chats
			from usage_events u
			join agent_identities i on i.id = u.agent_id
			left join avatars a on a.id = i.avatar_id and a.deleted_at is null
			where u.kind = 'llm'
			  and u.created_at >= now() - ${interval}::interval
			  and i.deleted_at is null
			  and i.is_public = true
			group by i.id, i.name, i.description, i.chat_count, i.meta,
			         a.thumbnail_key, a.visibility
			order by window_chats desc
			limit ${limit}
		`.catch(() => []);
	}

	const agents = agentRows.map((r, idx) => {
		const meta      = r.meta || {};
		const isOnchain = Boolean(meta.onchain || meta.sol_mint_address);
		const thumbPub  = r.avatar_visibility === 'public' || r.avatar_visibility === 'unlisted';
		const thumb     = r.avatar_thumbnail_key && thumbPub ? publicUrl(r.avatar_thumbnail_key) : null;
		return {
			rank:               idx + 1,
			id:                 r.id,
			name:               r.name || null,
			description:        r.description ? r.description.slice(0, 100) : null,
			avatar_thumbnail_url: thumb,
			chat_count:         Number(r.chat_count) || 0,
			window_chats:       Number(r.window_chats) || null,
			is_onchain:         isOnchain,
			agent_url:          `https://three.ws/agent/${encodeURIComponent(r.id)}`,
		};
	});

	// ── Coins (Oracle conviction) ───────────────────────────────────────────
	const coinRows = await sql`
		select mint, symbol, name, score, tier, momentum, pedigree, structure, narrative,
		       smart_wallet_count, scored_at
		from oracle_conviction
		where scored_at >= now() - interval '36 hours'
		  and score is not null
		order by score desc
		limit ${limit}
	`.catch(() => []);

	const coins = coinRows.map((r, idx) => ({
		rank:               idx + 1,
		mint:               r.mint,
		symbol:             r.symbol || null,
		name:               r.name   || null,
		score:              Number(r.score),
		tier:               r.tier,
		momentum:           Number(r.momentum) || 0,
		pedigree:           Number(r.pedigree) || 0,
		structure:          Number(r.structure) || 0,
		narrative:          Number(r.narrative) || 0,
		smart_wallet_count: Number(r.smart_wallet_count) || 0,
		scored_at:          r.scored_at,
		coin_url:           `https://three.ws/oracle/coin/${encodeURIComponent(r.mint)}`,
	}));

	return json(res, 200, {
		window: win,
		generated_at: new Date().toISOString(),
		agents,
		coins,
	}, { 'cache-control': 'public, max-age=120, s-maxage=120, stale-while-revalidate=60' });
});
