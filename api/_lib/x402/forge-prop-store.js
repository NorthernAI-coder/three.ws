// api/_lib/x402/forge-prop-store.js
//
// Value-extraction + storage for the autonomous "3D Forge Content Generation"
// loop entry (autonomous-registry.js → id 'forge-content-gen'). The loop pays
// the paid /api/x402/forge endpoint $0.05/call to generate a procedural prop
// (crate, barrel, furniture, terrain tile); this module turns that response
// into a durable, queryable asset-library row and measures how diverse the
// generated catalog is via embedding clustering.
//
// What it does on every successful generation:
//   1. Picks the next prop prompt (rotating category, varied prompt) — exposed
//      to the registry as nextForgeProp() so the request body is never static.
//   2. Embeds the prop prompt (free NIM / OpenAI when configured, deterministic
//      feature-hash fallback otherwise — never blocks the loop).
//   3. Scores novelty = 1 − max cosine similarity to the recent catalog in the
//      SAME vector space, and assigns a cluster id via k-means over that space.
//   4. Inserts a row into forge_autonomous_props (the public asset-library table
//      for autonomously-forged props) carrying the public glb_url, the prompt,
//      category, tier, embedding, novelty and cluster id.
//
// DOWNSTREAM CONSUMER: the forge gallery / diversity dashboard reads
// forge_autonomous_props — `glb_url` renders the prop, `novelty` + `cluster_id`
// drive the "how varied is the generated catalog" metric, `category` filters
// the feed. Inline-completed draft jobs carry a directly-renderable public R2
// `glb_url`; async jobs carry a `job_id` poll token (status stays 'queued'
// until the next observation), so the table is the single source of truth for
// what the autonomous forge has produced.
//
// All DB / embedding work is fail-soft: a hiccup here returns a summary the
// loop still logs, it never throws into the spend loop.

import { sql } from '../db.js';
import {
	embeddingsConfigured,
	defaultIngestEmbedderTag,
	embedPassages,
	cosine,
} from '../embeddings.js';
import { kmeans, suggestClusterCount, unit } from '../embedding-math.js';

// Vector space tag for the dependency-free fallback embedding. Tagged distinctly
// so it is NEVER compared against real NIM/OpenAI vectors — cosine only ever runs
// within a single embedder space (same rule embeddings.js enforces everywhere).
const LOCAL_EMBED_TAG = 'local/feature-hash@96';
const LOCAL_EMBED_DIM = 96;

// How many recent same-space rows to weigh novelty + clustering against. Bounded
// so the per-call k-means stays trivial inside the serverless window.
const DIVERSITY_WINDOW = 200;

// ── Procedural prop catalog ────────────────────────────────────────────────────
// Curated text→3D prompts grouped by the prop families named in the spec. Each
// call rotates the CATEGORY (so the catalog stays balanced across families) and
// varies the prompt within it (so successive same-category calls don't collide).
const PROP_CATALOG = Object.freeze({
	crate: [
		'a weathered wooden shipping crate, iron banded corners, game-ready prop',
		'a stack of military supply crates, stenciled markings, matte finish',
		'a cracked sci-fi cargo container, glowing seams, low-poly',
		'an antique tea crate, rope handles, worn paint, stylized',
		'a reinforced steel ammo crate, latches and rivets, PBR textured',
	],
	barrel: [
		'a rusted oil barrel, dented metal, peeling paint, game prop',
		'an oak wine barrel, iron hoops, cellar-aged wood grain',
		'a glowing toxic-waste barrel, hazard stripes, stylized',
		'a wooden gunpowder barrel, rope binding, weathered planks',
		'a sci-fi coolant drum, brushed aluminium, warning decals',
	],
	furniture: [
		'a rustic wooden tavern stool, three legs, hand-carved, low-poly',
		'a medieval banquet table, heavy oak, worn surface, game-ready',
		'a worn leather armchair, brass studs, stylized PBR',
		'a sci-fi crew bunk, foldable metal frame, clean lowpoly',
		'an ornate Victorian writing desk, brass fittings, dark walnut',
	],
	terrain: [
		'a modular rocky cliff terrain tile, mossy stone, seamless edges',
		'a desert dune terrain tile, rippled sand, sparse rocks, low-poly',
		'a snowy mountain terrain tile, jagged rock and ice, game-ready',
		'a lush grassland terrain tile, scattered boulders, stylized',
		'a volcanic terrain tile, cracked obsidian, glowing lava veins',
	],
});

const CATEGORIES = Object.freeze(Object.keys(PROP_CATALOG));

// Deterministic, non-random selector: rotate the category by UTC hour so the
// generated library cycles evenly across families, and step the prompt index by
// day so successive same-category hours don't repeat the same prompt. No
// Math.random — two ticks in the same hour pick the same prop, which the paid
// idempotency guard collapses rather than double-charging.
export function nextForgeProp(now = Date.now()) {
	const hour = Math.floor(now / 3_600_000);
	const day = Math.floor(now / 86_400_000);
	const category = CATEGORIES[hour % CATEGORIES.length];
	const prompts = PROP_CATALOG[category];
	const prompt = prompts[(hour + day) % prompts.length];
	return { category, prompt };
}

// Request body for the paid forge call. Draft tier ($0.05) — the price this loop
// is budgeted for; the 402 challenge quotes draft and the loop pays exactly that.
export function buildForgeRequestBody() {
	const { category, prompt } = nextForgeProp();
	return { prompt, tier: 'draft', aspect_ratio: '1:1', _prop_category: category };
}

// ── Embedding ──────────────────────────────────────────────────────────────────

// Signed feature hashing (FNV-1a → bucket, top bit → sign). A real, deterministic
// bag-of-words embedding used only when no embedding provider is configured, so
// the loop still produces a usable diversity signal with zero external calls.
function featureHashEmbed(text, dim = LOCAL_EMBED_DIM) {
	const v = new Array(dim).fill(0);
	const tokens = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
	for (const tok of tokens) {
		let h = 2166136261;
		for (let i = 0; i < tok.length; i++) {
			h ^= tok.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		const idx = (h >>> 0) % dim;
		const sign = (h >>> 31) & 1 ? -1 : 1;
		v[idx] += sign;
	}
	return v;
}

// Embed the prop prompt. Prefer the configured free-first provider; on any
// failure fall back to the local hash embedding so a provider outage degrades
// the diversity metric rather than failing the paid call's bookkeeping.
async function embedProp(prompt) {
	if (embeddingsConfigured()) {
		const tag = defaultIngestEmbedderTag();
		if (tag) {
			try {
				const [vec] = await embedPassages(tag, [prompt]);
				if (vec?.length) return { embedder: tag, vector: Array.from(vec) };
			} catch {
				/* provider hiccup — fall through to the deterministic local space */
			}
		}
	}
	return { embedder: LOCAL_EMBED_TAG, vector: featureHashEmbed(prompt) };
}

// ── Diversity (novelty + cluster) ──────────────────────────────────────────────

// novelty = 1 − max cosine similarity to the recent catalog in the SAME space,
// cluster_id = k-means assignment of the new prop within that space. First prop
// in a space is maximally novel (1) and forms cluster 0.
async function scoreDiversity(embedder, vector) {
	let recent = [];
	try {
		recent = await sql`
			select embedding from forge_autonomous_props
			where embedder = ${embedder}
			order by ts desc
			limit ${DIVERSITY_WINDOW}
		`;
	} catch {
		// Table may not exist on the very first run before ensureSchema commits, or
		// the DB is briefly unavailable — treat as an empty catalog (max novelty).
		return { novelty: 1, clusterId: 0, neighbors: 0 };
	}

	const peers = recent
		.map((r) => r.embedding)
		.filter((a) => Array.isArray(a) && a.length === vector.length);

	if (peers.length === 0) return { novelty: 1, clusterId: 0, neighbors: 0 };

	let maxSim = 0;
	for (const p of peers) {
		const s = cosine(vector, p);
		if (s > maxSim) maxSim = s;
	}
	const novelty = Math.max(0, Math.min(1, 1 - maxSim));

	// Cluster the new prop against the recent catalog. Unit-normalise so squared
	// euclidean distance ranks the same as cosine (semantic clusters).
	const all = [...peers, vector].map((v) => unit(v));
	const k = suggestClusterCount(all.length);
	const { assignments } = kmeans(all, k);
	const clusterId = assignments[assignments.length - 1] ?? 0;

	return { novelty, clusterId, neighbors: peers.length };
}

// ── Schema (memoised, idempotent) ──────────────────────────────────────────────

let schemaReady = null;
function ensureSchema() {
	if (schemaReady) return schemaReady;
	schemaReady = (async () => {
		await sql`
			CREATE TABLE IF NOT EXISTS forge_autonomous_props (
				id          bigserial PRIMARY KEY,
				run_id      uuid,
				ts          timestamptz DEFAULT now(),
				prompt      text NOT NULL,
				category    text NOT NULL,
				tier        text,
				mode        text,
				backend     text,
				job_id      text,
				glb_url     text,
				status      text,
				embedder    text,
				embedding   jsonb,
				novelty     numeric(6,5),
				cluster_id  int
			)
		`;
		await sql`
			CREATE INDEX IF NOT EXISTS forge_autonomous_props_cat_ts_idx
			ON forge_autonomous_props (category, ts DESC)
		`;
	})().catch((err) => {
		// Reset so a transient failure retries next call rather than wedging.
		schemaReady = null;
		throw err;
	});
	return schemaReady;
}

// ── Public: persist one forge generation ───────────────────────────────────────

// Parse the paid /api/x402/forge response, embed + score the prop, and insert a
// row into forge_autonomous_props. Returns a compact summary the loop stores in
// x402_autonomous_log.value_extracted. Never throws — on DB/embedding failure it
// returns a summary carrying the error so the call is still recorded.
//
// `requestBody` is the body the loop sent (carries the rotated prompt + category
// via _prop_category); `responseBody` is the forge JSON response.
export async function persistForgeProp(responseBody, { runId, requestBody } = {}) {
	const prompt =
		(requestBody && typeof requestBody.prompt === 'string' && requestBody.prompt) || '';
	const category =
		(requestBody && requestBody._prop_category) || nextForgeProp().category;

	const r = responseBody && typeof responseBody === 'object' ? responseBody : {};
	const tier = r.tier || (requestBody && requestBody.tier) || 'draft';
	const mode = r.mode || 'text_to_3d';
	const backend = r.backend || null;
	const jobId = r.job_id || null;
	const glbUrl = r.glb_url || null;
	const status = r.status || (glbUrl ? 'done' : jobId ? 'queued' : 'unknown');

	// Without a prompt there is nothing to catalog — record a thin summary so the
	// loop still logs the call, but skip the embed/insert.
	if (!prompt) {
		return { stored: false, reason: 'no_prompt', category, status, job_id: jobId, glb_url: glbUrl };
	}

	let novelty = null;
	let clusterId = null;
	let embedder = null;
	let neighbors = 0;
	let stored = false;
	let storeError = null;

	try {
		await ensureSchema();
		const embedded = await embedProp(prompt);
		embedder = embedded.embedder;

		const diversity = await scoreDiversity(embedder, embedded.vector);
		novelty = diversity.novelty;
		clusterId = diversity.clusterId;
		neighbors = diversity.neighbors;

		await sql`
			INSERT INTO forge_autonomous_props
				(run_id, prompt, category, tier, mode, backend,
				 job_id, glb_url, status, embedder, embedding, novelty, cluster_id)
			VALUES
				(${runId || null}, ${prompt}, ${category}, ${tier}, ${mode}, ${backend},
				 ${jobId}, ${glbUrl}, ${status}, ${embedder},
				 ${JSON.stringify(embedded.vector)}::jsonb,
				 ${novelty}, ${clusterId})
		`;
		stored = true;
	} catch (err) {
		storeError = err?.message || 'persist_failed';
	}

	return {
		stored,
		category,
		tier,
		mode,
		backend,
		status,
		job_id: jobId,
		glb_url: glbUrl,
		embedder,
		novelty,
		cluster_id: clusterId,
		diversity_neighbors: neighbors,
		...(storeError ? { error: storeError } : {}),
	};
}
