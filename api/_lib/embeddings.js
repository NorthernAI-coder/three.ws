// Multi-provider text embeddings with vector-space tagging.
//
// Provider policy (free-first, per the platform LLM policy): NVIDIA NIM's
// nv-embedqa-e5-v5 (1024-dim, free with one nvapi key) is the default for new
// ingests; OpenAI text-embedding-3-small @ 256 dims (Matryoshka truncation)
// is the paid backstop and the space every pre-tagging row lives in.
//
// THE TRAP this module exists to prevent: embeddings from different models are
// different vector spaces. A query embedded with model A compared against
// passages embedded with model B returns garbage similarity scores that look
// plausible. So every embed call here names its embedder explicitly via a
// `tag` (model id + dimension, e.g. "nvidia/nv-embedqa-e5-v5@1024"), callers
// persist that tag next to every stored vector, and query-time code must
// resolve the stored tag back through this module — never pick a provider ad
// hoc. Untagged legacy rows are OpenAI text-embedding-3-small@256 by
// definition (`LEGACY_EMBED_TAG`): that was the only embedder before tagging
// shipped.
//
// We keep this zero-dep (plain fetch, no SDK) so the talking-agent chat path
// stays a single cheap import — matching api/widgets/[id]/[action].js.

const NIM_EMBED_URL = 'https://integrate.api.nvidia.com/v1/embeddings';
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';

// NIM nv-embedqa-e5-v5 hard-caps inputs at 512 tokens (probed: longer inputs
// 400 with "exceeds maximum allowed token size"). The chunker already targets
// ≤512 estimated tokens (4 chars/token), but dense text (code, CJK) can run
// more tokens per char — so the NIM lane retries an over-length 400 once with
// inputs truncated to a conservative 3 chars/token budget.
const NIM_MAX_TOKENS = 512;
const NIM_SAFE_CHARS = NIM_MAX_TOKENS * 3;

export const NIM_EMBED_TAG = 'nvidia/nv-embedqa-e5-v5@1024';
export const OPENAI_EMBED_TAG = 'text-embedding-3-small@256';

// Rows written before embedder tagging existed were embedded with OpenAI
// text-embedding-3-small @ 256 — encode that assumption in exactly one place.
export const LEGACY_EMBED_TAG = OPENAI_EMBED_TAG;

const EMBEDDERS = Object.freeze({
	[NIM_EMBED_TAG]: Object.freeze({
		tag: NIM_EMBED_TAG,
		provider: 'nim',
		model: 'nvidia/nv-embedqa-e5-v5',
		dim: 1024,
		free: true,
		configured: () => !!process.env.NVIDIA_API_KEY,
	}),
	[OPENAI_EMBED_TAG]: Object.freeze({
		tag: OPENAI_EMBED_TAG,
		provider: 'openai',
		model: 'text-embedding-3-small',
		dim: 256,
		free: false,
		configured: () => !!process.env.OPENAI_API_KEY,
	}),
});

// Free lane first, paid backstop last.
const INGEST_PREFERENCE = Object.freeze([NIM_EMBED_TAG, OPENAI_EMBED_TAG]);

/** True when at least one embedding provider can actually serve. */
export function embeddingsConfigured() {
	return INGEST_PREFERENCE.some((tag) => EMBEDDERS[tag].configured());
}

/**
 * The embedder tag new document sets should be ingested with — free NIM when
 * the key is present, OpenAI otherwise, null when nothing is configured.
 */
export function defaultIngestEmbedderTag() {
	for (const tag of INGEST_PREFERENCE) {
		if (EMBEDDERS[tag].configured()) return tag;
	}
	return null;
}

/**
 * Normalize a stored embedder tag (null/'' = legacy OpenAI) to a known tag,
 * or null when the tag names an embedder this build doesn't know — an unknown
 * space can never be queried, only re-embedded.
 */
export function resolveEmbedderTag(storedTag) {
	const tag = storedTag || LEGACY_EMBED_TAG;
	return EMBEDDERS[tag] ? tag : null;
}

/** Embedder metadata ({tag, provider, model, dim, free}) or null if unknown. */
export function embedderInfo(storedTag) {
	const tag = resolveEmbedderTag(storedTag);
	return tag ? EMBEDDERS[tag] : null;
}

/** True when the provider behind `storedTag`'s space can serve right now. */
export function embedderConfigured(storedTag) {
	const tag = resolveEmbedderTag(storedTag);
	return !!tag && EMBEDDERS[tag].configured();
}

/**
 * Embed `texts` in the vector space named by `tag`.
 * `inputType` is 'passage' for corpus chunks at ingest and 'query' for search
 * strings — NIM's retrieval models are asymmetric and REQUIRE the distinction;
 * the OpenAI lane ignores it. Returns Float64Array[] aligned with `texts`.
 * Throws { code: 'unknown_embedder' | 'no_embedder' | 'embedder_error' }.
 */
export async function embedWith(tag, texts, inputType) {
	const embedder = EMBEDDERS[resolveEmbedderTag(tag) || ''];
	if (!embedder) {
		throw Object.assign(new Error(`unknown embedder tag: ${tag}`), {
			code: 'unknown_embedder',
		});
	}
	if (!embedder.configured()) {
		throw Object.assign(new Error(`${embedder.provider} embedder not configured (${embedder.tag})`), {
			code: 'no_embedder',
		});
	}
	if (inputType !== 'passage' && inputType !== 'query') {
		throw Object.assign(new Error(`inputType must be 'passage' or 'query', got: ${inputType}`), {
			code: 'embedder_error',
		});
	}
	if (!texts.length) return [];

	return embedder.provider === 'nim'
		? embedNim(embedder, texts, inputType)
		: embedOpenAi(embedder, texts);
}

/** Convenience: embed corpus chunks at ingest time. */
export function embedPassages(tag, texts) {
	return embedWith(tag, texts, 'passage');
}

/** Convenience: embed one search string; resolves to a single Float64Array. */
export async function embedQuery(tag, text) {
	const [vec] = await embedWith(tag, [text], 'query');
	return vec;
}

async function embedNim(embedder, texts, inputType, { truncated = false } = {}) {
	const upstream = await fetch(NIM_EMBED_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: embedder.model,
			input: texts,
			input_type: inputType,
		}),
		signal: AbortSignal.timeout(30_000),
	});
	if (!upstream.ok) {
		const body = await upstream.text().catch(() => '');
		// Over-length input: retry once with every input clamped to a budget that
		// cannot exceed the 512-token cap. Better to truncate one outlier chunk
		// than to fail a whole ingest batch.
		if (upstream.status === 400 && /maximum allowed token size/i.test(body) && !truncated) {
			return embedNim(embedder, texts.map((t) => t.slice(0, NIM_SAFE_CHARS)), inputType, {
				truncated: true,
			});
		}
		throw upstreamError('nim', upstream.status, body);
	}
	return parseEmbeddings(await upstream.json(), texts.length, 'nim');
}

async function embedOpenAi(embedder, texts) {
	const upstream = await fetch(OPENAI_EMBED_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: embedder.model,
			input: texts,
			dimensions: embedder.dim,
		}),
		signal: AbortSignal.timeout(30_000),
	});
	if (!upstream.ok) {
		const body = await upstream.text().catch(() => '');
		throw upstreamError('openai', upstream.status, body);
	}
	return parseEmbeddings(await upstream.json(), texts.length, 'openai');
}

function parseEmbeddings(data, expected, provider) {
	const rows = (data?.data || []).sort((a, b) => a.index - b.index);
	if (rows.length !== expected || rows.some((r) => !Array.isArray(r.embedding))) {
		throw Object.assign(new Error(`${provider} embedding response shape mismatch`), {
			code: 'embedder_error',
		});
	}
	return rows.map((row) => Float64Array.from(row.embedding));
}

function upstreamError(provider, status, body) {
	return Object.assign(new Error(`${provider} embedding api ${status}: ${body.slice(0, 200)}`), {
		code: 'embedder_error',
		status,
	});
}

/**
 * Score stored vector rows against a search string without ever crossing
 * vector spaces. Rows are grouped by their `embedder` tag (untagged legacy
 * rows are OpenAI — LEGACY_EMBED_TAG), the query is embedded once per space
 * whose provider is configured, and cosine runs strictly within each space.
 * Rows in a space no configured provider can serve are counted in
 * `needsReembed` — reported, never silently compared.
 *
 * @param {Array<{embedder?: string|null, embedding: number[]|{values:number[]}}>} rows
 * @param {string} query
 * @returns {Promise<{scored: Array<object & {embedder: string, score: number}>,
 *                    needsReembed: Array<{embedder: string, chunks: number}>}>}
 */
export async function scoreRowsBySpace(rows, query) {
	const bySpace = new Map();
	for (const r of rows) {
		const tag = r.embedder || LEGACY_EMBED_TAG;
		if (!bySpace.has(tag)) bySpace.set(tag, []);
		bySpace.get(tag).push(r);
	}

	const scored = [];
	const needsReembed = [];
	for (const [tag, group] of bySpace) {
		if (!embedderConfigured(tag)) {
			needsReembed.push({ embedder: tag, chunks: group.length });
			continue;
		}
		const queryEmbedding = await embedQuery(tag, query);
		for (const r of group) {
			const e = Array.isArray(r.embedding) ? r.embedding : r.embedding?.values || [];
			scored.push({ ...r, embedder: tag, score: cosine(queryEmbedding, e) });
		}
	}
	return { scored, needsReembed };
}

/**
 * Cosine similarity between two equal-length numeric arrays. Inputs come from
 * embedWith() (Float64Array) or from the DB (plain Array via JSONB) — both
 * work. Mismatched lengths score 0: vectors of different dimensionality are
 * by definition different spaces, and comparing a shared prefix would be
 * exactly the silent cross-space garbage this module is built to prevent.
 */
export function cosine(a, b) {
	if (!a || !b || a.length !== b.length) return 0;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	if (!na || !nb) return 0;
	return dot / Math.sqrt(na * nb);
}
