// POST /api/watsonx/embed — IBM Granite embeddings on watsonx.ai.
//
// Body: { texts: string[], model?: string }
// Response: { model, dimensions, count, cachedHits, vectors: number[][] }
//   vectors[i] is the Granite embedding of texts[i], order preserved.
//
// This is the public read-side of the three.ws ↔ IBM watsonx integration: it
// turns arbitrary short texts into Granite embedding vectors so the browser can
// lay them out in semantic space (e.g. the watsonx Constellation at
// /constellation). Inference runs on watsonx.ai with the server's IBM Cloud key.
//
// There is no mock path. When watsonx is unconfigured the endpoint returns 503
// `watsonx_unconfigured` so the client can show an honest "not configured" state
// instead of inventing vectors. Every successful vector is a real Granite call.

import { createHash } from 'node:crypto';
import { cors, method, readJson, error, json, wrap, rateLimited } from '../_lib/http.js';
import { watsonxConfig, watsonxEmbed } from '../_lib/watsonx.js';
import { limits, clientIp } from '../_lib/rate-limit.js';

// watsonx accepts many inputs per call; cap a single request so one caller can't
// submit an unbounded batch. Matches the chunk size used by agent-embeddings.
const MAX_TEXTS = 96;
const MAX_TEXT_LEN = 512;

// Process-local vector cache. Embeddings are deterministic for a given
// (model, text), and a warm Vercel instance serves many requests, so caching by
// content hash turns repeat lookups (the same trending tokens across visitors)
// into zero-cost hits. Bounded with a simple FIFO trim to cap memory.
const CACHE_MAX = 5000;
const cache = new Map(); // sha256(model\ntext) → number[]

function cacheKey(model, text) {
	return createHash('sha256').update(`${model}\n${text}`).digest('hex');
}

function cacheGet(key) {
	const v = cache.get(key);
	if (v) {
		// Refresh recency: re-insert so the oldest genuinely-cold entries trim first.
		cache.delete(key);
		cache.set(key, v);
	}
	return v;
}

function cacheSet(key, vec) {
	cache.set(key, vec);
	while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function validateTexts(input) {
	if (!Array.isArray(input)) {
		throw Object.assign(new Error('texts must be an array'), { status: 400 });
	}
	if (input.length === 0 || input.length > MAX_TEXTS) {
		throw Object.assign(new Error(`texts must hold 1–${MAX_TEXTS} items`), { status: 400 });
	}
	const out = [];
	for (const t of input) {
		if (typeof t !== 'string') {
			throw Object.assign(new Error('each text must be a string'), { status: 400 });
		}
		const trimmed = t.trim().slice(0, MAX_TEXT_LEN);
		if (!trimmed) throw Object.assign(new Error('texts must not be empty'), { status: 400 });
		out.push(trimmed);
	}
	return out;
}

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'POST,OPTIONS' })) return;
	if (!method(req, res, ['POST'])) return;

	// Two-tier rate limit: per-IP burst control + a global hourly ceiling that
	// caps watsonx spend regardless of how many distinct clients call in.
	const ip = clientIp(req);
	const perIp = await limits.watsonxEmbedIp(ip);
	if (!perIp.success) {
		return rateLimited(res, perIp, 'too many embedding requests — slow down');
	}
	const global = await limits.watsonxEmbedGlobal();
	if (!global.success) {
		return rateLimited(res, global, 'embedding capacity reached — try again shortly');
	}

	let body;
	try {
		body = await readJson(req, 200_000);
	} catch (e) {
		return error(res, e.status || 400, 'bad_request', e.message);
	}

	let texts;
	try {
		texts = validateTexts(body.texts);
	} catch (e) {
		return error(res, e.status || 400, 'bad_request', e.message);
	}

	const cfg = watsonxConfig();
	if (!cfg.configured) {
		// No fabricated vectors. Tell the client exactly what's missing so the UI
		// can render a real "IBM watsonx not configured" state.
		return error(res, 503, 'watsonx_unconfigured',
			'IBM watsonx is not configured. Set WATSONX_API_KEY and WATSONX_PROJECT_ID to enable Granite embeddings.');
	}

	const model = typeof body.model === 'string' && body.model.trim()
		? body.model.trim()
		: cfg.embedModel;

	// Resolve from cache first; only the genuinely-uncached texts hit watsonx.
	const vectors = new Array(texts.length).fill(null);
	const missIdx = [];
	const missText = [];
	for (let i = 0; i < texts.length; i++) {
		const hit = cacheGet(cacheKey(model, texts[i]));
		if (hit) vectors[i] = hit;
		else { missIdx.push(i); missText.push(texts[i]); }
	}

	let dimensions = vectors.find((v) => v)?.length ?? 0;

	if (missText.length) {
		let result;
		try {
			result = await watsonxEmbed(cfg, { inputs: missText, model });
		} catch (e) {
			// Surface the real upstream cause (auth, quota, unsupported model).
			return error(res, 502, 'watsonx_error', e.message || 'watsonx embeddings failed');
		}
		dimensions = result.dimensions || dimensions;
		for (let k = 0; k < missIdx.length; k++) {
			const vec = result.vectors[k];
			if (!vec?.length) continue;
			vectors[missIdx[k]] = vec;
			cacheSet(cacheKey(model, missText[k]), vec);
		}
	}

	// json() defaults to no-store, which is correct here: this is a POST whose
	// body varies per request, so it must not be shared-cached. Determinism is
	// exploited by the process-local `cache` above, not by HTTP caches.
	return json(res, 200, {
		model,
		dimensions,
		count: vectors.length,
		cachedHits: texts.length - missText.length,
		vectors,
	});
});
