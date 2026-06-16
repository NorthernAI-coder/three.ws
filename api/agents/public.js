/**
 * Public agent index — browsable directory of all public agents.
 *
 *   GET /api/agents/public
 *       ?q=<search>          full-text search on name + description
 *       &skill=<slug>        filter by skill slug
 *       &sort=newest|popular|name  (default: popular)
 *       &limit=24            max 48
 *       &before=<iso>        cursor (created_at <) for pagination
 *       &network=mainnet     only show on-chain agents on this network
 *
 * Returns { agents, count, has_more, generated_at }. Each agent has the
 * public-safe fields: id, name, description, skills, avatar_thumbnail_url,
 * home_url, is_registered, chat_count, created_at, onchain summary.
 *
 * Public, IP rate-limited, 30-second CDN cache.
 */

import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { sql } from '../_lib/db.js';
import { publicUrl } from '../_lib/r2.js';

const SORTS = new Set(['newest', 'popular', 'name']);

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const p = new URL(req.url, `http://${req.headers.host || 'x'}`).searchParams;
	const q      = (p.get('q') || '').trim().slice(0, 100);
	const skill  = (p.get('skill') || '').trim().toLowerCase();
	const sort   = SORTS.has(p.get('sort')) ? p.get('sort') : 'popular';
	const limit  = Math.min(48, Math.max(1, Number(p.get('limit') || 24)));
	const before = p.get('before') || null;
	const onchainOnly = p.get('onchain') === '1' || p.get('onchain') === 'true';

	const rows = await sql`
		select
			i.id,
			i.name,
			i.description,
			i.skills,
			i.home_url,
			i.chat_count,
			i.created_at,
			i.meta,
			a.thumbnail_key  as avatar_thumbnail_key,
			a.visibility     as avatar_visibility
		from agent_identities i
		left join avatars a on a.id = i.avatar_id and a.deleted_at is null
		where i.deleted_at is null
		  and i.is_public = true
		  and (${!q} or (
		        to_tsvector('english', coalesce(i.name,'') || ' ' || coalesce(i.description,''))
		        @@ plainto_tsquery('english', ${q})
		      ))
		  and (${!skill} or i.skills @> ${[skill]}::text[])
		  and (${!before}::boolean or i.created_at < ${before}::timestamptz)
		  and (${!onchainOnly} or (
		        i.meta->'onchain' is not null
		        or i.meta->>'sol_mint_address' is not null
		      ))
		order by
			${sort === 'newest' ? sql`i.created_at desc` :
			  sort === 'name'   ? sql`i.name asc` :
			                      sql`i.chat_count desc nulls last, i.created_at desc`}
		limit ${limit + 1}
	`.catch(() => []);

	const hasMore = rows.length > limit;
	const items   = rows.slice(0, limit);

	const agents = items.map((r) => {
		const meta   = r.meta || {};
		const onchain = meta.onchain || null;
		const thumbPub = r.avatar_visibility === 'public' || r.avatar_visibility === 'unlisted';
		const thumbnail = r.avatar_thumbnail_key && thumbPub ? publicUrl(r.avatar_thumbnail_key) : null;

		return {
			id:                r.id,
			name:              r.name,
			description:       r.description || null,
			skills:            r.skills || [],
			avatar_thumbnail:  thumbnail,
			home_url:          r.home_url || `/agent/${r.id}`,
			chat_count:        Number(r.chat_count) || 0,
			is_registered:     !!(onchain || meta.sol_mint_address || meta.erc8004_agent_id),
			onchain:           onchain ? { network: onchain.network, asset: onchain.sol_asset || null } : null,
			created_at:        r.created_at,
		};
	});

	return json(res, 200, {
		agents,
		count:        agents.length,
		has_more:     hasMore,
		next_cursor:  hasMore ? agents[agents.length - 1].created_at : null,
		generated_at: new Date().toISOString(),
	}, { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' });
});
