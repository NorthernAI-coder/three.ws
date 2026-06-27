// GET /api/launcher/narratives — public, read-only feed of the live cultural
// narratives the autonomous launcher is riding right now.
//
// This is the launcher's intelligence made public: any agent (or the homepage,
// or a curious holder) can ask "what is the internet talking about, ranked, with
// which sources confirm it" and use it to decide what to coin — making it far
// easier for agents to ride a real wave instead of guessing. Themes ONLY, never
// tickers (the $THREE rule, enforced upstream in launcher-trends). Cached hard,
// degrades to an empty list, never throws.
//
//   ?network=mainnet|devnet     (default mainnet)
//   ?limit=1..40                (default 24)
//   ?sources=knowyourmeme,googletrends,...   (subset of the known providers)
//
// Response: { ok, network, top, terms:[{term,score,sources,kind}], themes, providers, updated }

import { cors, json, method, wrap } from '../_lib/http.js';
import { rankNarratives, DEFAULT_SOURCES, EXTERNAL_SOURCES } from '../_lib/launcher-trends.js';

// The vocabulary a caller may request. Internal venue signals (coin_intel,
// trending) plus every external culture provider — all reduced to themes.
const ALLOWED = new Set([...DEFAULT_SOURCES, ...EXTERNAL_SOURCES, 'coin_intel', 'trending', 'x']);

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,OPTIONS', origins: '*' })) return;
	if (!method(req, res, ['GET'])) return;

	const url = new URL(req.url, 'http://x');
	const network = url.searchParams.get('network') === 'devnet' ? 'devnet' : 'mainnet';
	const limit = Math.max(1, Math.min(40, Number(url.searchParams.get('limit')) || 24));
	const requested = (url.searchParams.get('sources') || '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
		.filter((s) => ALLOWED.has(s));

	let result = null;
	try {
		result = await rankNarratives({
			network,
			sources: requested.length ? requested : undefined,
			limit,
		});
	} catch {
		/* intelligence dark — fall through to an empty, honest payload */
	}

	// Cache at the edge: the underlying providers are themselves cached ~3–5 min,
	// so a 60s browser / 120s shared cache keeps this cheap without going stale.
	res.setHeader('cache-control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
	return json(res, 200, {
		ok: true,
		network,
		top: result?.top || null,
		terms: result?.terms || [],
		themes: result?.themes || [],
		providers: result?.providers || [],
	});
});
