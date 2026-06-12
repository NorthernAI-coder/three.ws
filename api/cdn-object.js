// GET /cdn/<key> — first-party CDN for R2 bucket objects (avatars, thumbnails,
// forge GLBs). Routed via vercel.json: `/cdn/(.*)` → `/api/cdn-object?key=$1`.
//
// Why this exists: the bucket's public `*.r2.dev` dev domain is rate-limited by
// Cloudflare and not meant for production traffic — gallery pages loading dozens
// of thumbnails got throttled mid-burst, surfacing as `failed to load img /
// model-viewer` client errors. Streaming through the authenticated S3 endpoint
// sidesteps that limit entirely, and Vercel's CDN absorbs repeat reads via
// `s-maxage`, so each object is fetched from R2 roughly once per region per day.
//
// Exposure parity: the bucket is already fully readable through the public
// r2.dev domain, so serving the same namespace here grants nothing new.

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { cors, error, wrap } from './_lib/http.js';
import { r2 } from './_lib/r2.js';
import { env } from './_lib/env.js';

// Object keys are caller-controlled path input — keep them boring. UUID-based
// keys, slashes, dots-in-filenames only; no traversal, no control chars.
const KEY_RE = /^[\w!*'().@-]+(?:\/[\w!*'().@-]+)*(?:\.[\w-]+)?$/;
const MAX_KEY_LENGTH = 512;

const CONTENT_TYPES = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	glb: 'model/gltf-binary',
	gltf: 'model/gltf+json',
	usdz: 'model/vnd.usdz+zip',
	bin: 'application/octet-stream',
	json: 'application/json',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	mp4: 'video/mp4',
	webm: 'video/webm',
};

function contentTypeFor(key, stored) {
	// R2 objects uploaded without an explicit type default to octet-stream —
	// prefer the extension in that case so browsers render instead of download.
	if (stored && stored !== 'application/octet-stream') return stored;
	const ext = key.split('.').pop()?.toLowerCase();
	return CONTENT_TYPES[ext] || stored || 'application/octet-stream';
}

function cacheControlFor(key) {
	// Thumbnails are regenerated under the same key, so let browsers revalidate
	// hourly. Content keys (u/…, forge outputs) embed random segments and are
	// write-once in practice — cache long everywhere.
	return key.startsWith('thumb/')
		? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
		: 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800';
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,HEAD,OPTIONS', origins: '*' })) return;
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.setHeader('allow', 'GET, HEAD, OPTIONS');
		return error(res, 405, 'method_not_allowed', 'GET or HEAD only');
	}

	const raw = req.query?.key;
	const key = typeof raw === 'string' ? raw : '';
	if (!key || key.length > MAX_KEY_LENGTH || key.includes('..') || !KEY_RE.test(key)) {
		return error(res, 400, 'invalid_key', 'malformed object key');
	}

	const ifNoneMatch = req.headers['if-none-match'];
	const range = req.headers.range;

	try {
		const obj = await r2.send(
			new GetObjectCommand({
				Bucket: env.S3_BUCKET,
				Key: key,
				IfNoneMatch: ifNoneMatch,
				Range: range,
			}),
		);

		res.statusCode = range && obj.ContentRange ? 206 : 200;
		res.setHeader('content-type', contentTypeFor(key, obj.ContentType));
		res.setHeader('cache-control', cacheControlFor(key));
		res.setHeader('accept-ranges', 'bytes');
		if (obj.ETag) res.setHeader('etag', obj.ETag);
		if (obj.ContentLength != null) res.setHeader('content-length', String(obj.ContentLength));
		if (obj.ContentRange) res.setHeader('content-range', obj.ContentRange);

		if (req.method === 'HEAD') {
			obj.Body?.destroy?.();
			return res.end();
		}

		obj.Body.pipe(res);
		obj.Body.on('error', (err) => {
			console.error('[cdn-object] stream error:', key, err?.message);
			try {
				res.destroy(err);
			} catch {}
		});
	} catch (err) {
		const status = err?.$metadata?.httpStatusCode;
		if (status === 304) {
			res.statusCode = 304;
			res.setHeader('cache-control', cacheControlFor(key));
			if (ifNoneMatch) res.setHeader('etag', ifNoneMatch);
			return res.end();
		}
		const code = err?.Code || err?.name;
		if (code === 'NoSuchKey' || code === 'NotFound' || status === 404) {
			return error(res, 404, 'not_found', 'object not found');
		}
		if (code === 'InvalidRange' || status === 416) {
			return error(res, 416, 'invalid_range', 'requested range not satisfiable');
		}
		console.error('[cdn-object] r2 fetch failed:', key, err?.message);
		return error(res, 502, 'upstream_error', 'failed to fetch object');
	}
});
