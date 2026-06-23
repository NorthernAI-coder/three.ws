// GET /api/genome/edges — every breeding descent edge (parent → child), for the
// galaxy star-map to draw lineage lines between agent nodes. Public-safe: ids +
// pedigree tier only, no secret. Bounded; newest first.

import { cors, json, method, wrap } from '../_lib/http.js';
import { sql } from '../_lib/db.js';

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const url = new URL(req.url, 'http://x');
	const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 2000, 1), 5000);

	const rows = await sql`
		select parent_a_agent_id, parent_b_agent_id, child_agent_id, generation, pedigree_tier
		from genome_breedings
		where status = 'born' and child_agent_id is not null
		order by created_at desc
		limit ${limit}
	`;
	const edges = rows.map((r) => ({
		a: r.parent_a_agent_id,
		b: r.parent_b_agent_id,
		child: r.child_agent_id,
		generation: r.generation,
		tier: r.pedigree_tier,
	}));
	return json(res, 200, { edges }, { 'cache-control': 'public, s-maxage=60' });
});
