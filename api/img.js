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
//   3. On total failure, 302 to a deterministic dicebear placeholder (which
//      serves permissive CORS) so the loader ALWAYS receives a valid 200 image
//      and never logs an error.
//
// Responses are immutable and CDN-cached: a given upstream URL yields the same
// bytes forever, so we cache hard at the edge and the proxy is hit once per art.

import { wrap, cors, method, error, redirect, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { fetchModel } from './_lib/fetch-model.js';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — generous for token art, bounded for abuse
const TIMEOUT_MS = 10_000;

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

function placeholder(seed) {
	const s = encodeURIComponent(seed || 'token');
	return `https://api.dicebear.com/7.x/shapes/png?seed=${s}`;
}

export default wrap(async function handler(req, res) {
	if (cors(req, res, { methods: 'GET,OPTIONS', credentials: false })) return;
	if (!method(req, res, ['GET'])) return;

	const ip = clientIp(req);
	const rl = await limits.imgProxyIp(ip);
	if (!rl.success) return rateLimited(res, rl, 'too many image requests');

	const url = new URL(req.url, 'http://x');
	const target = url.searchParams.get('url');
	const seed = url.searchParams.get('seed') || target || '';
	if (!target) return error(res, 400, 'missing_url', 'url query parameter is required');

	// data: URIs are not proxyable targets — redirecting to attacker-supplied
	// data: content is an open-redirect/content-injection vector. Reject.
	if (/^data:/i.test(target.trim())) {
		return error(
			res,
			400,
			'invalid_url',
			'data: URIs cannot be proxied — pass an http(s) or ipfs URL',
		);
	}

	let image = null;
	for (const candidate of candidates(target)) {
		try {
			const result = await fetchModel(candidate, {
				maxBytes: MAX_BYTES,
				timeoutMs: TIMEOUT_MS,
			});
			if (!result.contentType.startsWith('image/')) continue; // HTML error page etc. — try next
			image = result;
			break;
		} catch {
			// SSRF refusal, timeout, gateway 5xx — fall through to the next candidate.
		}
	}

	if (!image) {
		// Every source failed. Hand back a valid, CORS-clean placeholder so the
		// texture/image loader resolves with a 200 instead of logging an error.
		return redirect(res, placeholder(seed), 302);
	}

	res.statusCode = 200;
	res.setHeader('content-type', image.contentType);
	res.setHeader('access-control-allow-origin', '*');
	// Immutable: a given upstream URL is content-addressed (IPFS) or a fixed CDN
	// asset, so the bytes never change. Cache hard at the browser and the edge.
	res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800, immutable');
	res.end(Buffer.from(image.bytes));
});
