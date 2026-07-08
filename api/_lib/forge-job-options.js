// Job → output-options binding for the /forge generation pipeline.
//
// normalizeForgeOptions() (forge-options.js) parses a request's optional output
// controls (seed, output_format/compression, texture_size, target_polycount) in
// the SAME serverless invocation that submits the job. An asynchronous lane
// (Replicate/TRELLIS, Hunyuan3D, sketch, BYOK) completes in a LATER, separate
// invocation of pollJob(), which only has the job handle — not the original
// request body. This module remembers the request-affecting subset (today,
// just the post-generation compression choice) against the job handle for the
// lifetime of a single poll cycle, so a completed async job still gets the
// caller's requested output_format applied at materialize time.
//
// Mirrors the bindJobToCacheKey/cacheKeyForJob idiom in forge-cache.js exactly:
// best-effort, short-TTL, fail-open without Redis (a cache/store outage just
// means the completed GLB is delivered uncompressed — never a broken response).

import { getRedis } from './redis.js';

const PREFIX = 'fr:jobopt:';
// The binding only needs to outlive one generation's polling window.
const TTL_S = 3600;

function client(override) {
	return override || getRedis();
}

/**
 * Remember the compression choice a just-submitted job should apply at
 * completion. No-op (and safe to call unconditionally) when there is nothing
 * non-default to remember, or when Redis is unavailable.
 */
export async function bindJobToOptions(jobHandle, opts, { redis } = {}) {
	const r = client(redis);
	if (!r || !jobHandle || !opts) return;
	if (opts.compression === 'none') return; // default behavior needs no binding
	try {
		await r.set(`${PREFIX}${jobHandle}`, JSON.stringify({ compression: opts.compression }), { ex: TTL_S });
	} catch {
		/* best-effort */
	}
}

/**
 * Resolve the compression choice bound to a job handle, or null when none was
 * bound (the common case — no options requested, or Redis unavailable).
 */
export async function optionsForJob(jobHandle, { redis } = {}) {
	const r = client(redis);
	if (!r || !jobHandle) return null;
	try {
		const raw = await r.get(`${PREFIX}${jobHandle}`);
		if (!raw) return null;
		const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
		return value && typeof value.compression === 'string' ? value : null;
	} catch {
		return null;
	}
}
