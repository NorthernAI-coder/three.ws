// GET /api/animations/library — the full Mixamo-sourced motion library.
//
// The bulk library (~2,400 clips baked by scripts/mixamo-all.mjs) is far too
// large for the deploy bundle (~3 GB of clip JSON), so the baked clips live on
// the R2 CDN and this endpoint proxies the library manifest object with an
// edge cache. Each manifest entry carries an absolute CDN `url` the browser
// fetches directly (R2 CORS allows GET from web origins — scripts/set-r2-cors.mjs).
//
// Returns { clips: [], total: 0 } until the library has been uploaded, so
// consumers (the /animations gallery, embed viewer, pose studio deep-links)
// feature-detect by emptiness rather than special-casing errors.

import { cors, json, method, wrap } from '../_lib/http.js';
import { getObjectBuffer } from '../_lib/r2.js';

const MANIFEST_KEY = 'animations/library/manifest.json';

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

	res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
	return json(res, 200, { clips, total: clips.length, generated_at: generatedAt });
});
