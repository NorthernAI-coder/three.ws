// GET /api/genome/lineage?agentId=<id>           — the verifiable family tree.
// GET /api/genome/lineage?agentId=<id>&verify=1   — re-derive + confirm the genome.
//
// Lineage shows on all three nodes of a breed (both parents + child), mirroring
// fork. The verify path re-derives the child genome from the recorded seed + the
// parent-genome snapshots captured at breed time and confirms it matches the stored
// hash — so a forged "child" (one whose genome wasn't actually derived from its
// claimed parents) is detectable by anyone. Public-safe: no secret is exposed.

import { cors, json, method, wrap, error } from '../_lib/http.js';
import { isUuid } from '../_lib/validate.js';
import { sql } from '../_lib/db.js';
import { verifyGenome, pedigreeScore, normalizeGenome } from '../_lib/genome.js';
import { publicGenome } from '../_lib/genome-agent.js';

const MAX_ANCESTOR_DEPTH = 8;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	const url = new URL(req.url, 'http://x');
	const agentId = String(url.searchParams.get('agentId') || '').trim();
	if (!isUuid(agentId)) return error(res, 400, 'validation_error', 'agentId is required');

	const node = await loadNode(agentId);
	if (!node) return error(res, 404, 'not_found', 'agent not found');

	if (url.searchParams.get('verify')) {
		return json(res, 200, await verifyNode(agentId), { 'cache-control': 'public, s-maxage=30' });
	}

	// Parents (if this agent was bred).
	const [birth] = await sql`
		select b.parent_a_agent_id, b.parent_b_agent_id, b.seed, b.genome_hash, b.generation,
		       b.pedigree_tier, b.created_at
		from genome_breedings b
		where b.child_agent_id = ${agentId} and b.status = 'born'
		order by b.created_at asc limit 1
	`;
	const parents = birth
		? await Promise.all([loadNode(birth.parent_a_agent_id), loadNode(birth.parent_b_agent_id)])
		: [];

	// Children (every breed this agent was a parent of).
	const childRows = await sql`
		select b.child_agent_id, b.generation, b.pedigree_tier, b.created_at,
		       case when b.parent_a_agent_id = ${agentId} then b.parent_b_agent_id else b.parent_a_agent_id end as co_parent
		from genome_breedings b
		where (b.parent_a_agent_id = ${agentId} or b.parent_b_agent_id = ${agentId})
		  and b.status = 'born' and b.child_agent_id is not null
		order by b.created_at desc limit 100
	`;
	const children = await Promise.all(
		childRows.map(async (r) => ({
			...(await loadNode(r.child_agent_id)),
			co_parent: await loadNode(r.co_parent),
			bred_at: r.created_at,
		})),
	);

	// Ancestors — walk up the pedigree (bounded), so a profile can render depth.
	const ancestors = await walkAncestors(agentId);

	return json(
		res,
		200,
		{
			agent: node,
			generation: node.generation,
			pedigree: node.pedigree,
			parents: parents.filter(Boolean),
			children: children.filter((c) => c && c.id),
			ancestors,
			bred: !!birth,
			seed: birth?.seed || null,
			genome_hash: birth?.genome_hash || null,
		},
		{ 'cache-control': 'public, s-maxage=30' },
	);
});

// Re-derive the child genome from recorded inputs and confirm it matches.
async function verifyNode(agentId) {
	const [row] = await sql`
		select i.id, i.name, i.meta, b.seed, b.genome_hash
		from agent_identities i
		left join genome_breedings b on b.child_agent_id = i.id and b.status = 'born'
		where i.id = ${agentId} and i.deleted_at is null
		limit 1
	`;
	if (!row) return { verifiable: false, reason: 'not_found' };
	const bred = row.meta?.bred_from;
	const childGenome = row.meta?.genome;
	if (!bred || !childGenome) return { verifiable: false, reason: 'not_a_bred_agent' };

	const parentA = bred.parent_a?.genome;
	const parentB = bred.parent_b?.genome;
	const seed = bred.seed || row.seed;
	if (!parentA || !parentB || !seed) return { verifiable: false, reason: 'missing_recorded_inputs' };

	const result = verifyGenome(normalizeGenome(childGenome), { parentA, parentB, seed });
	return {
		verifiable: true,
		valid: result.valid,
		reason: result.reason || null,
		genome_hash: result.hash || childGenome.genome_hash || null,
		recorded_hash: row.genome_hash || childGenome.genome_hash || null,
		parents: [
			{ id: bred.parent_a?.agent_id, name: bred.parent_a?.name },
			{ id: bred.parent_b?.agent_id, name: bred.parent_b?.name },
		],
		seed,
	};
}

async function walkAncestors(agentId) {
	const out = [];
	const seen = new Set([agentId]);
	let frontier = [agentId];
	for (let depth = 1; depth <= MAX_ANCESTOR_DEPTH && frontier.length; depth++) {
		const rows = await sql`
			select child_agent_id, parent_a_agent_id, parent_b_agent_id
			from genome_breedings
			where child_agent_id = any(${frontier}) and status = 'born'
		`;
		const next = [];
		for (const r of rows) {
			for (const pid of [r.parent_a_agent_id, r.parent_b_agent_id]) {
				if (pid && !seen.has(pid)) {
					seen.add(pid);
					next.push(pid);
					const n = await loadNode(pid);
					if (n) out.push({ ...n, depth, of: r.child_agent_id });
				}
			}
		}
		frontier = next;
	}
	return out;
}

// One node of the tree — public-safe. Private agents reveal only that they exist.
async function loadNode(agentId) {
	if (!agentId) return null;
	const [r] = await sql`
		select i.id, i.name, i.is_public, i.user_id, i.avatar_id, i.meta,
		       a.thumbnail_key as avatar_thumbnail_key
		from agent_identities i
		left join avatars a on a.id = i.avatar_id and a.deleted_at is null
		where i.id = ${agentId} and i.deleted_at is null
		limit 1
	`;
	if (!r) return null;
	const genome = r.meta?.genome ? normalizeGenome(r.meta.genome) : null;
	const pedigree = genome ? pedigreeScore(genome) : { tier: 'common', generation: 0, score: 0 };
	return {
		id: r.id,
		name: r.is_public ? r.name : 'Private agent',
		is_public: !!r.is_public,
		avatar_id: r.avatar_id,
		generation: genome?.generation ?? 0,
		pedigree,
		bred: !!r.meta?.bred_from,
	};
}
