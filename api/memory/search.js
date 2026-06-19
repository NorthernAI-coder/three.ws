/**
 * Memory semantic search (P2 — Memory Studio)
 * -------------------------------------------
 * The mem0 search() surface over the tiered store. Embeds the query in each
 * stored vector space and returns ranked memories with real cosine scores; falls
 * back to substring + salience when no embedding provider is configured.
 *
 * GET  /api/memory/search?agentId=&q=&topK=&minScore=&tier=working,recall  — recall
 *      (used by the Brain Memory node; cookie auth, no CSRF, side effects are
 *       only the agent-owner's own access counters)
 * POST /api/memory/search { agentId, query, topK, minScore, tiers, type }   — studio
 *
 * Owner-only. Anonymous GET returns an empty result set (keeps embed consoles clean).
 */

import { getSessionUser, authenticateBearer, extractBearer } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { cors, json, method, readJson, wrap, error } from '../_lib/http.js';
import { requireCsrf } from '../_lib/csrf.js';
import { searchMemories } from '../_lib/memory-store.js';

async function resolveAuth(req) {
	const session = await getSessionUser(req);
	if (session) return { userId: session.id };
	const bearer = await authenticateBearer(extractBearer(req));
	if (bearer) return { userId: bearer.userId };
	return null;
}

async function ownsAgent(agentId, userId) {
	if (!agentId || !userId) return false;
	const [row] = await sql`
		SELECT user_id FROM agent_identities WHERE id = ${agentId} AND deleted_at IS NULL
	`;
	return !!row && row.user_id === userId;
}

function parseTiers(raw) {
	if (!raw) return null;
	const list = (Array.isArray(raw) ? raw : String(raw).split(','))
		.map((s) => String(s).trim())
		.filter(Boolean);
	return list.length ? list : null;
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['GET', 'POST'])) return;

	const auth = await resolveAuth(req);

	if (req.method === 'GET') {
		const url = new URL(req.url, 'http://x');
		const agentId = url.searchParams.get('agentId') || url.searchParams.get('agent_id');
		const query = url.searchParams.get('q') || url.searchParams.get('query') || '';
		if (!agentId) return error(res, 400, 'validation_error', 'agentId required');
		// Anonymous / non-owner → empty (no leak, no console noise on public embeds).
		if (!auth || !(await ownsAgent(agentId, auth.userId))) return json(res, 200, { results: [] });

		const out = await searchMemories(agentId, query, {
			topK: clampInt(url.searchParams.get('topK'), 8, 1, 50),
			minScore: clampFloat(url.searchParams.get('minScore'), 0.25, 0, 1),
			tiers: parseTiers(url.searchParams.get('tier')),
			type: url.searchParams.get('type') || undefined,
		});
		return json(res, 200, out);
	}

	// POST — studio search (CSRF-gated).
	if (!auth) return error(res, 401, 'unauthorized', 'sign in required');
	if (!(await requireCsrf(req, res, auth.userId))) return;

	const body = await readJson(req);
	const agentId = body.agentId || body.agent_id;
	if (!agentId) return error(res, 400, 'validation_error', 'agentId required');
	if (!(await ownsAgent(agentId, auth.userId))) return error(res, 403, 'forbidden', 'not your agent');

	const out = await searchMemories(agentId, String(body.query || ''), {
		topK: clampInt(body.topK, 8, 1, 50),
		minScore: clampFloat(body.minScore, 0.25, 0, 1),
		tiers: parseTiers(body.tiers),
		type: body.type || undefined,
	});
	return json(res, 200, out);
});

function clampInt(v, dflt, min, max) {
	const n = Number(v);
	if (!Number.isFinite(n)) return dflt;
	return Math.min(max, Math.max(min, Math.round(n)));
}
function clampFloat(v, dflt, min, max) {
	const n = Number(v);
	if (!Number.isFinite(n)) return dflt;
	return Math.min(max, Math.max(min, n));
}
