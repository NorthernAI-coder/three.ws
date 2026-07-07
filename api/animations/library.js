// GET /api/animations/library — the full Mixamo-sourced motion library.
//
// The bulk library (2,800+ clips baked by scripts/mixamo-all.mjs, growing as the
// generative text→motion seeding lands) is far too large for the deploy bundle
// (~3 GB of clip JSON), so the baked clips live on the R2 CDN and this endpoint
// proxies the library manifest object with an edge cache. Each manifest entry
// carries an absolute CDN `url` the browser fetches directly (R2 CORS allows GET
// from web origins — scripts/set-r2-cors.mjs).
//
// Returns { clips: [], total: 0 } until the library has been uploaded, so
// consumers (the /animations gallery, embed viewer, pose studio deep-links)
// feature-detect by emptiness rather than special-casing errors.
//
// Pagination (opt-in, backward compatible): the manifest is a stable ordered
// array, so a caller can page it with ?limit= (1..1000) and ?offset= to keep any
// single response bounded as the catalog grows past thousands of clips. With no
// ?limit the full array is returned exactly as before, so existing consumers
// (embed viewer, pose deep-link lookup, the older gallery build) are unchanged.
// Paged responses add `offset` + `next_offset` (null on the last page); `total`
// is always the full catalog size regardless of paging.

import { cors, json, method, wrap } from '../_lib/http.js';
import { getObjectBuffer } from '../_lib/r2.js';

const MANIFEST_KEY = 'animations/library/manifest.json';
const MAX_PAGE = 1000;

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS' })) return;
	if (!method(req, res, ['GET'])) return;

	let clips = [];
	let generatedAt = null;
	try {
		const buf = await getObjectBuffer(MANIFEST_KEY);
		const parsed = JSON.parse(buf.toString('utf8'));
		clips = Array.isArray(parsed) ? parsed : Array.isArray(parsed.clips) ? parsed.clips : [];
		generatedAt = parsed.generated_at || null;
	} catch (err) {
		// Not uploaded yet (NoSuchKey/404) is the expected pre-launch state;
		// anything else is a real storage error worth logging. Both degrade to
		// an empty library so the UI simply hides the section.
		const code = err?.$metadata?.httpStatusCode;
		if (err?.name !== 'NoSuchKey' && code !== 404) {
			console.error('[animations/library]', err?.message || err);
		}
	}

	const total = clips.length;
	res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');

	const url = new URL(req.url, 'http://x');
	const rawLimit = url.searchParams.get('limit');
	if (rawLimit == null) {
		// Legacy full-catalog response — unchanged contract.
		return json(res, 200, { clips, total, generated_at: generatedAt });
	}

	const limit = Math.min(Math.max(Number(rawLimit) || 0, 1), MAX_PAGE);
	const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
	const page = clips.slice(offset, offset + limit);
	const nextOffset = offset + limit < total ? offset + limit : null;
	return json(res, 200, {
		clips: page,
		total,
		offset,
		next_offset: nextOffset,
		generated_at: generatedAt,
	});
});
