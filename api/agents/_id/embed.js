// POST /api/agents/:id/embed
// Generates a 1024-dim text embedding. Used by AgentMemory.recall() for
// semantic similarity search.
//
// Provider policy mirrors api/_lib/llm.js: the FREE lane leads — NVIDIA NIM's
// baai/bge-m3 (1024-dim, one free nvapi key) — and paid Voyage (voyage-3-lite,
// also 1024-dim) is only a keyed fallback. The response carries the `model`
// that produced the vector: embeddings from different models live in different
// vector spaces, so callers that persist vectors should store the model id
// alongside them and only compare like with like.

import { getSessionUser, authenticateBearer, extractBearer, hasScope } from '../../_lib/auth.js';
import { cors, json, method, readJson, error, rateLimited } from '../../_lib/http.js';
import { limits } from '../../_lib/rate-limit.js';
import { sql } from '../../_lib/db.js';
import { env } from '../../_lib/env.js';

// Ordered free-first. Both produce 1024-dim vectors, matching this endpoint's
// documented contract.
function embedProviderChain() {
	const chain = [];
	if (env.NVIDIA_API_KEY) {
		chain.push({
			name: 'nvidia',
			model: 'baai/bge-m3',
			url: 'https://integrate.api.nvidia.com/v1/embeddings',
			key: env.NVIDIA_API_KEY,
			buildBody: (text) => ({ model: 'baai/bge-m3', input: [text] }),
		});
	}
	if (env.VOYAGE_API_KEY) {
		chain.push({
			name: 'voyage',
			model: 'voyage-3-lite',
			url: 'https://api.voyageai.com/v1/embeddings',
			key: env.VOYAGE_API_KEY,
			buildBody: (text) => ({ model: 'voyage-3-lite', input: [text], input_type: 'query' }),
		});
	}
	return chain;
}

export async function handleEmbed(req, res, id) {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: true })) return;
	if (!method(req, res, ['POST'])) return;

	const session = await getSessionUser(req);
	const bearer = session ? null : await authenticateBearer(extractBearer(req));
	if (!session && !bearer) return error(res, 401, 'unauthorized', 'sign in required');
	// Match the sibling per-agent sub-resources (nfts.js / pumpfun.js): a bearer
	// token must carry an appropriate scope to drive the embeddings API.
	if (bearer && !hasScope(bearer.scope, 'mcp') && !hasScope(bearer.scope, 'profile')) {
		return error(res, 403, 'insufficient_scope', 'requires mcp or profile scope');
	}
	const userId = session?.id || bearer?.userId;

	// This route is namespaced per-agent and burns shared platform embedding
	// keys, so it must enforce ownership of :id exactly like every other
	// /api/agents/:id sub-resource — never embed against an agent the caller
	// doesn't own.
	const [agent] = await sql`
		select id from agent_identities
		where id = ${id} and user_id = ${userId} and deleted_at is null
		limit 1
	`;
	if (!agent) return error(res, 404, 'not_found', 'agent not found');

	const rl = await limits.embedUser(userId);
	if (!rl.success) return rateLimited(res, rl);

	const body = await readJson(req);
	const text = body?.text;
	if (!text || typeof text !== 'string' || !text.trim()) {
		return error(res, 400, 'validation_error', 'text is required');
	}
	if (text.length > 8192) {
		return error(res, 400, 'validation_error', 'text exceeds 8192 character limit');
	}

	const chain = embedProviderChain();
	if (!chain.length) {
		return error(res, 503, 'not_configured',
			'No embedding provider configured. Set NVIDIA_API_KEY (free) or VOYAGE_API_KEY.');
	}

	let lastStatus = 0;
	for (const p of chain) {
		let upstream;
		try {
			upstream = await fetch(p.url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${p.key}`,
				},
				body: JSON.stringify(p.buildBody(text.trim())),
				signal: AbortSignal.timeout(15_000),
			});
		} catch (err) {
			console.error(`[embed] ${p.name} unreachable`, err?.message);
			lastStatus = 502;
			continue;
		}
		if (!upstream.ok) {
			const msg = await upstream.text().catch(() => '');
			console.error(`[embed] ${p.name} error`, upstream.status, msg.slice(0, 200));
			lastStatus = upstream.status;
			continue;
		}
		const data = await upstream.json();
		const embedding = data?.data?.[0]?.embedding;
		if (!Array.isArray(embedding)) {
			console.error(`[embed] ${p.name} unexpected response shape`);
			lastStatus = 502;
			continue;
		}
		return json(res, 200, { embedding, model: p.model, provider: p.name });
	}

	return error(res, 502, 'upstream_error',
		`embedding service unavailable (last upstream status ${lastStatus})`);
}
