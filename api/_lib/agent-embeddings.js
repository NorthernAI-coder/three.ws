// agent-embeddings — a durable cache of IBM Granite embedding vectors for agent
// identities, the data layer behind the Agent Galaxy.
//
// Embedding every agent on every page load would be slow and wasteful, so each
// agent's vector is persisted in Postgres keyed by a content hash of the exact
// text that was embedded (plus the model id). On rebuild we re-embed only the
// agents whose text actually changed; everything else is read straight from the
// cache. The same stored vectors power semantic search (query vector vs. agent
// vectors) without a second embedding pass.
//
// There is no mock path: vectors come from a real watsonx.ai embeddings call.
// When watsonx is unconfigured the caller checks watsonxConfig().configured and
// reports the feature unavailable rather than inventing data.

import { createHash } from 'node:crypto';
import { sql } from './db.js';
import { watsonxEmbed } from './watsonx.js';

// watsonx accepts many inputs per embeddings call; keep request bodies modest so
// a large galaxy rebuild splits into a handful of calls instead of one giant one.
const EMBED_CHUNK = 96;

let _ready = null;

// Lazily create the cache table (mirrors the CREATE-TABLE-IF-NOT-EXISTS pattern
// used across api/_lib). Cached so concurrent callers in a warm instance share
// one round-trip.
function ensureTable() {
	if (_ready) return _ready;
	_ready = sql`
		CREATE TABLE IF NOT EXISTS agent_embeddings (
			agent_id     uuid PRIMARY KEY REFERENCES agent_identities(id) ON DELETE CASCADE,
			content_hash text NOT NULL,
			model        text NOT NULL,
			dims         int  NOT NULL,
			vector       jsonb NOT NULL,
			updated_at   timestamptz NOT NULL DEFAULT now()
		)
	`.then(() => true);
	return _ready;
}

// The canonical text we embed for an agent: its name and description, plus any
// persona tone tags, joined deterministically. Two agents with identical text
// hash identically; editing a description re-embeds only that agent.
export function agentEmbedText(agent) {
	const parts = [];
	if (agent.name) parts.push(String(agent.name).trim());
	if (agent.description) parts.push(String(agent.description).trim());
	const tags = Array.isArray(agent.persona_tone_tags) ? agent.persona_tone_tags : [];
	if (tags.length) parts.push(tags.map((t) => String(t).trim()).filter(Boolean).join(', '));
	return parts.filter(Boolean).join('. ').slice(0, 2000);
}

function contentHash(text, model) {
	return createHash('sha256').update(`${model}\n${text}`).digest('hex');
}

// Ensure every agent in `agents` has a current Granite embedding, re-embedding
// only those whose text changed since last time. Returns { vectors, model,
// dims, embedded } where `vectors` is aligned 1:1 with the input `agents`
// (agents with empty embeddable text are skipped — see `usable`).
//
// `cfg` is a watsonxConfig() result; the caller guarantees cfg.configured.
export async function ensureAgentEmbeddings(cfg, agents, { model } = {}) {
	await ensureTable();
	const embedModel = model || cfg.embedModel;

	// Build the embed text + hash for each agent up front.
	const prepared = agents.map((a) => {
		const text = agentEmbedText(a);
		return { agent: a, text, hash: text ? contentHash(text, embedModel) : null };
	});
	const usable = prepared.filter((p) => p.text && p.hash);
	const ids = usable.map((p) => p.agent.id);

	// Read whatever we already have for these agents.
	const cached = new Map(); // agent_id → { hash, vector }
	if (ids.length) {
		const rows = await sql`
			SELECT agent_id, content_hash, vector
			FROM agent_embeddings
			WHERE agent_id = ANY(${ids}::uuid[]) AND model = ${embedModel}
		`;
		for (const r of rows) cached.set(r.agent_id, { hash: r.content_hash, vector: r.vector });
	}

	// Stale = missing from cache or hash drifted (text edited).
	const stale = usable.filter((p) => {
		const hit = cached.get(p.agent.id);
		return !hit || hit.hash !== p.hash;
	});

	let embeddedCount = 0;
	let dims = 0;
	for (const c of cached.values()) if (c.vector?.length) dims = c.vector.length;

	// Re-embed stale agents in chunks, then upsert and merge into the cache map.
	for (let i = 0; i < stale.length; i += EMBED_CHUNK) {
		const batch = stale.slice(i, i + EMBED_CHUNK);
		const { vectors, dimensions } = await watsonxEmbed(cfg, {
			inputs: batch.map((p) => p.text),
			model: embedModel,
		});
		dims = dimensions || dims;
		const recs = [];
		for (let j = 0; j < batch.length; j++) {
			const vec = vectors[j];
			if (!vec?.length) continue;
			cached.set(batch[j].agent.id, { hash: batch[j].hash, vector: vec });
			recs.push({ id: batch[j].agent.id, hash: batch[j].hash, dims: vec.length, vector: vec });
			embeddedCount++;
		}
		if (recs.length) await upsertEmbeddings(recs, embedModel);
	}

	// Align output to the original agents order; agents without usable text or a
	// vector are returned as null so the caller can drop them cleanly.
	const vectors = prepared.map((p) => cached.get(p.agent?.id)?.vector ?? null);
	return { vectors, model: embedModel, dims, embedded: embeddedCount, total: usable.length };
}

// One round-trip multi-row upsert via unnest — keeps a full first-build (a few
// hundred agents) to a single statement instead of N inserts.
async function upsertEmbeddings(records, model) {
	const ids = records.map((r) => r.id);
	const hashes = records.map((r) => r.hash);
	const models = records.map(() => model);
	const dims = records.map((r) => r.dims);
	// Vectors ride as a text[] of JSON strings and are cast to jsonb per-row in
	// the SELECT — both `::text[]` array params and single-value `::jsonb` casts
	// are established Neon patterns here, unlike an unproven `::jsonb[]` param.
	const vectors = records.map((r) => JSON.stringify(r.vector));
	await sql`
		INSERT INTO agent_embeddings (agent_id, content_hash, model, dims, vector)
		SELECT u.id, u.hash, u.model, u.dims, u.vec::jsonb
		FROM unnest(
			${ids}::uuid[],
			${hashes}::text[],
			${models}::text[],
			${dims}::int[],
			${vectors}::text[]
		) AS u(id, hash, model, dims, vec)
		ON CONFLICT (agent_id) DO UPDATE SET
			content_hash = EXCLUDED.content_hash,
			model        = EXCLUDED.model,
			dims         = EXCLUDED.dims,
			vector       = EXCLUDED.vector,
			updated_at   = now()
	`;
}

// Read stored vectors for a set of agent ids — the read path for semantic
// search. Returns Map agent_id → vector (number[]); agents without a cached
// vector are simply absent.
export async function readAgentVectors(agentIds, { model } = {}) {
	if (!agentIds?.length) return new Map();
	await ensureTable();
	const rows = model
		? await sql`SELECT agent_id, vector FROM agent_embeddings WHERE agent_id = ANY(${agentIds}::uuid[]) AND model = ${model}`
		: await sql`SELECT agent_id, vector FROM agent_embeddings WHERE agent_id = ANY(${agentIds}::uuid[])`;
	const out = new Map();
	for (const r of rows) out.set(r.agent_id, r.vector);
	return out;
}
