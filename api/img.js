// Same-origin image proxy with IPFS multi-gateway fallback.
//
// Token art on /pump-visualizer (and any 3D surface that textures remote
// images) is loaded by Three.js with `crossOrigin = 'anonymous'`. The public
// IPFS gateways and metadata hosts these images live on (ipfs.io, arweave,
// per-launch CDNs) frequently answer browser requests with no
// `Access-Control-Allow-Origin` header, or get blocked by the browser's Opaque
// Response Blocking (ORB) — so the texture fails and the console fills with CORS
// / ERR_BLOCKED_BY_ORB errors, one per token.
//
// Routing the image through this same-origin endpoint removes the cross-origin
// problem entirely: the browser only ever talks to three.ws. Server-side we:
//   1. Fetch the upstream image through the SSRF-hardened fetcher (scheme
//      allowlist, our-side DNS + private-IP blocklist, connection pinning,
//      per-redirect re-validation, byte cap, timeout) — see api/_lib/ssrf.js.
//   2. If the source is an IPFS URL that fails, retry across alternate public
//      gateways so one slow gateway never blanks the art.
//   3. On total failure, serve a deterministic, on-brand SVG placeholder inline
//      (200, permissive CORS) so the loader ALWAYS receives a valid image and
//      never logs an error. The placeholder is generated here — same-origin, no
//      external dependency that could itself be down — and is unique per seed:
//      an abstract gradient "gem" that reads as token art rather than a generic
//      "broken image" tile.
//
// Responses are immutable and CDN-cached: a given upstream URL yields the same
// bytes forever, so we cache hard at the edge and the proxy is hit once per art.

import { wrap, cors, method, error, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { fetchModel } from './_lib/fetch-model.js';
import { safeFetchJson } from './_lib/ssrf.js';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — generous for token art, bounded for abuse
const TIMEOUT_MS = 10_000;
// Token launch metadata (pump.fun et al.) is a small JSON doc whose `image`
// field is the real art. Resolving it server-side lets the browser load token
// images same-origin without the per-host CORS failures that a client-side
// `fetch(metadataUri)` hits. Kept short — the JSON is tiny.
const META_TIMEOUT_MS = 5_000;
// Overall budget for ALL gateway attempts combined. The function's Vercel
// maxDuration is 30s; trying 4 IPFS gateways at 10s each can reach 40s and get
// the invocation killed BEFORE the placeholder redirect below ever runs —
// defeating the "always hand back a valid 200" contract. Cap the total spend so
// we always have time left to redirect to the placeholder.
const TOTAL_BUDGET_MS = 24_000;

// Public IPFS gateways tried in order. ipfs.io is the canonical resolver the
// rest of the platform pins to (api/_lib/onchain.js), but it is also the one
// most likely to ORB-block or stall, so we fan out to mirrors on failure.
const IPFS_GATEWAYS = [
	'https://ipfs.io/ipfs/',
	'https://cloudflare-ipfs.com/ipfs/',
	'https://gateway.pinata.cloud/ipfs/',
	'https://dweb.link/ipfs/',
];

// Pull the `<cid>/<path?>` portion out of any recognised IPFS URL form so we can
// re-point it at a different gateway. Returns null for non-IPFS URLs.
function ipfsPath(rawUrl) {
	if (rawUrl.startsWith('ipfs://')) return rawUrl.slice('ipfs://'.length).replace(/^ipfs\//, '');
	const m = rawUrl.match(/\/ipfs\/(.+)$/);
	return m ? m[1] : null;
}

// Build the ordered list of candidate URLs to try for one logical image.
function candidates(rawUrl) {
	const path = ipfsPath(rawUrl);
	if (path) return IPFS_GATEWAYS.map((g) => g + path);
	// Non-IPFS: a single source (already an https CDN / arweave / data: link).
	return [rawUrl.startsWith('ipfs://') ? IPFS_GATEWAYS[0] + rawUrl.slice(7) : rawUrl];
}

// Deterministic, dependency-free placeholder art. The same seed always renders
// the same image, so a given token's fallback is stable across loads and the
// edge cache stays warm. Derives a two-tone palette + accent from a hash of the
// seed and composes a soft gradient backdrop, a faceted "gem" glyph, and a
// monogram — on-brand for three.ws and clearly intentional, not a 404 tile.
function hashSeed(str) {
	let h = 2166136261 >>> 0; // FNV-1a
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

function monogram(seed) {
	const m = String(seed).match(/[A-Za-z0-9]/);
	return (m ? m[0] : '◆').toUpperCase();
}

function placeholderSvg(seed) {
	const s = String(seed || 'token');
	const h = hashSeed(s);
	const hue = h % 360; // primary hue
	const hue2 = (hue + 38 + ((h >> 9) % 50)) % 360; // analogous accent
	const rot = (h >> 3) % 360; // gem rotation for per-seed variety
	const ch = monogram(s);
	// Two deep, saturated stops keep contrast high enough for a white monogram.
	const c1 = `hsl(${hue} 64% 16%)`;
	const c2 = `hsl(${hue2} 58% 9%)`;
	const glow = `hsl(${hue} 80% 60%)`;
	const accent = `hsl(${hue2} 85% 66%)`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" role="img" aria-label="placeholder artwork">
	<defs>
		<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="${c1}"/>
			<stop offset="1" stop-color="${c2}"/>
		</linearGradient>
		<radialGradient id="glow" cx="0.5" cy="0.42" r="0.65">
			<stop offset="0" stop-color="${glow}" stop-opacity="0.45"/>
			<stop offset="1" stop-color="${glow}" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="facet" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="${accent}" stop-opacity="0.95"/>
			<stop offset="1" stop-color="${glow}" stop-opacity="0.55"/>
		</linearGradient>
	</defs>
	<rect width="400" height="400" fill="url(#bg)"/>
	<rect width="400" height="400" fill="url(#glow)"/>
	<g transform="rotate(${rot} 200 188)" opacity="0.9">
		<polygon points="200,96 268,150 242,236 158,236 132,150" fill="url(#facet)"/>
		<polygon points="200,96 268,150 200,188" fill="#ffffff" fill-opacity="0.16"/>
		<polygon points="200,96 132,150 200,188" fill="#000000" fill-opacity="0.12"/>
		<polygon points="200,188 242,236 158,236" fill="#000000" fill-opacity="0.18"/>
		<polyline points="132,150 200,188 268,150" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.5"/>
	</g>
	<text x="200" y="188" text-anchor="middle" dominant-baseline="central"
		font-family="'Inter','Segoe UI',system-ui,sans-serif" font-size="84" font-weight="700"
		fill="#ffffff" fill-opacity="0.92" style="paint-order:stroke">${ch}</text>
	<text x="200" y="312" text-anchor="middle"
		font-family="'Inter','Segoe UI',system-ui,sans-serif" font-size="15" font-weight="600"
		letter-spacing="3" fill="#ffffff" fill-opacity="0.42">THREE.WS</text>
</svg>`;
}

// Resolve a token's artwork URL from its metadata JSON document. The metadata
// is creator-controlled, so we (a) fetch through the SSRF-hardened JSON client,
// (b) accept only an http(s) image URL — data: images are rejected so we never
// serve attacker-supplied inline content from our own origin, and (c) return
// null on any failure so the caller falls through to the on-brand placeholder.
async function resolveImageFromMeta(metaUri) {
	try {
		const { ok, data } = await safeFetchJson(metaUri, { timeoutMs: META_TIMEOUT_MS });
		if (!ok || !data || typeof data !== 'object') return null;
		const candidate = data.image || data.image_url || data.imageUrl || data.imageUri || null;
		if (typeof candidate !== 'string') return null;
		const trimmed = candidate.trim();
		if (!trimmed || /^data:/i.test(trimmed)) return null;
		return trimmed;
	} catch {
		return null;
	}
}

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: false })) return;
	if (!method(req, res, ['GET'])) return;

	const ip = clientIp(req);
	const rl = await limits.imgProxyIp(ip);
	if (!rl.success) return rateLimited(res, rl, 'too many image requests');

	const url = new URL(req.url, 'http://x');
	const directUrl = url.searchParams.get('url');
	const metaUri = url.searchParams.get('meta');
	const seed = url.searchParams.get('seed') || directUrl || metaUri || '';

	// Accept one of: ?url=<image>, ?meta=<metadata-json>, or ?seed=<x> (placeholder
	// only). Callers streaming launch feeds pass `meta` so the real artwork is
	// resolved server-side; a missing image still yields the branded placeholder.
	if (!directUrl && !metaUri && !seed) {
		return error(res, 400, 'missing_url', 'one of url, meta, or seed is required');
	}

	// data: URIs are not proxyable targets — redirecting to attacker-supplied
	// data: content is an open-redirect/content-injection vector. Reject.
	if (directUrl && /^data:/i.test(directUrl.trim())) {
		return error(
			res,
			400,
			'invalid_url',
			'data: URIs cannot be proxied — pass an http(s) or ipfs URL',
		);
	}

	// Resolve the artwork URL: an explicit ?url wins; otherwise read it from the
	// token metadata document server-side. A null result simply falls through to
	// the placeholder below — the loader always receives a valid image.
	let target = directUrl;
	if (!target && metaUri) {
		target = await resolveImageFromMeta(metaUri);
	}

	let image = null;
	const deadline = Date.now() + TOTAL_BUDGET_MS;
	for (const candidate of target ? candidates(target) : []) {
		// Shrink each attempt's timeout to fit the remaining overall budget so the
		// loop never overruns into the function's hard kill. Once too little time
		// is left to bother, stop and fall through to the placeholder.
		const remaining = deadline - Date.now();
		if (remaining < 1_000) break;
		try {
			const result = await fetchModel(candidate, {
				maxBytes: MAX_BYTES,
				timeoutMs: Math.min(TIMEOUT_MS, remaining),
			});
			if (!result.contentType.startsWith('image/')) continue; // HTML error page etc. — try next
			image = result;
			break;
		} catch {
			// SSRF refusal, timeout, gateway 5xx — fall through to the next candidate.
		}
	}

	if (!image) {
		// Every source failed. Hand back a valid, CORS-clean placeholder inline so
		// the texture/image loader resolves with a 200 instead of logging an error.
		// Served same-origin (no external dependency to fail) and cached, but for a
		// shorter window than real art so a transiently-down source can recover.
		res.statusCode = 200;
		res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
		res.setHeader('access-control-allow-origin', '*');
		res.setHeader('cache-control', 'public, max-age=300, s-maxage=3600');
		res.end(placeholderSvg(seed));
		return;
	}

	res.statusCode = 200;
	res.setHeader('content-type', image.contentType);
	res.setHeader('access-control-allow-origin', '*');
	// Immutable: a given upstream URL is content-addressed (IPFS) or a fixed CDN
	// asset, so the bytes never change. Cache hard at the browser and the edge.
	res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800, immutable');
	res.end(Buffer.from(image.bytes));
});
