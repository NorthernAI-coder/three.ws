// GET /api/avatars/featured — curated + popular public avatars for the
// "Featured" tab of the Walk Avatar extension. Public, no auth.
//
// Order: admin-curated `featured` flag first, then most-viewed, then newest, so
// the tab is never empty as long as any public avatar with a thumbnail exists.
// Only public avatars that actually have a poster are returned — a picker grid
// of blank tiles is worse than a shorter list.

import { sql } from '../_lib/db.js';
import { cors, json, method, wrap, rateLimited } from '../_lib/http.js';
import { limits, clientIp } from '../_lib/rate-limit.js';
import { env } from '../_lib/env.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const rl = await limits.publicIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl);

	const url = new URL(req.url, 'http://x');
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 60);

	const rows = await sql`
		SELECT id, name, slug, visibility, created_at, featured, view_count
		FROM avatars
		WHERE deleted_at IS NULL
		  AND visibility = 'public'
		  AND thumbnail_key IS NOT NULL
		ORDER BY featured DESC, view_count DESC, created_at DESC
		LIMIT ${limit}
	`;

	res.setHeader('cache-control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
	return json(res, 200, {
		avatars: rows.map((r) => ({
			id: r.id,
			name: r.name || 'Untitled avatar',
			slug: r.slug || null,
			visibility: r.visibility,
			featured: r.featured === true,
			has_thumbnail: true,
			thumb_url: `${env.APP_ORIGIN}/api/avatars/${r.id}/thumb`,
			created_at: r.created_at,
		})),
	});
});
