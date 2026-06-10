// Same-origin proxy for the Solana Developer Platform (SDP) API
// (https://platform.solana.com). Fronts the SDP v1 surface — custodial
// wallets, SPL token issuance, payments, and compliance screening — under our
// own origin so the browser never sees the SDP_API_KEY and never hits a vendor
// host directly.
//
//   GET  /api/sdp/health                 -> SDP /health           (no key)
//   GET  /api/sdp/v1/wallets             -> SDP /v1/wallets
//   POST /api/sdp/v1/issuance            -> SDP /v1/issuance
//   POST /api/sdp/v1/compliance/screen   -> SDP /v1/compliance/screen
//   ...
//
// Only the upstream's real route surface is forwardable (see isSdpAllowedPath);
// anything else 404s, so this can't be turned into an open proxy. The caller's
// Authorization header is ignored — we always attach our server-side key — so
// the key can never be impersonated or exfiltrated.
//
// Authorization: the SDP key grants org-level control over custodial wallets,
// SPL issuance, and payments — capabilities that must never be exposed to the
// open internet. The path allowlist and per-IP rate limit are NOT access
// controls; they only constrain which upstream route is hit and how often. So
// every forwarding path requires an authenticated admin. The only exception is
// the unauthenticated public surface (health/openapi/llms.txt — see
// sdpPathNeedsKey), which the upstream itself serves without a key and which
// exposes no org data.

import { requireAdmin } from '../_lib/admin.js';
import { isSameSiteOrigin } from '../_lib/auth.js';
import { cors, error, json, method as methodGuard, rateLimited, readJson, wrap } from '../_lib/http.js';
import { clientIp, limits } from '../_lib/rate-limit.js';
import { isSdpAllowedPath, sdpPathNeedsKey, sdpRequest } from '../_lib/sdp.js';

export const config = { runtime: 'nodejs' };

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

// Upstream request headers we relay from the caller. Authorization is
// deliberately NOT here — the client lib attaches our own key.
const FORWARDABLE_HEADERS = ['idempotency-key'];

function joinPath(parts) {
	if (Array.isArray(parts)) return parts.join('/');
	return String(parts || '');
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS', credentials: false })) return;
	if (!methodGuard(req, res, ALLOWED_METHODS)) return;

	const path = decodeURIComponent(joinPath(req.query?.path)).replace(/^\/+/, '');
	if (!isSdpAllowedPath(path)) {
		return error(res, 404, 'not_found', `unknown Solana Developer Platform route: ${path}`);
	}

	const rl = await limits.sdpIp(clientIp(req));
	if (!rl.success) return rateLimited(res, rl, 'too many Solana Developer Platform requests');

	// Gate every privileged (key-bearing) route behind an authenticated admin.
	// requireAdmin writes the 401/403 response itself and returns null on failure.
	// The public health/doc surfaces (sdpPathNeedsKey === false) stay open so an
	// unconfigured deployment's health checks keep working.
	if (sdpPathNeedsKey(path)) {
		const admin = await requireAdmin(req, res);
		if (!admin) return;

		// Defense in depth atop the SameSite=Lax session cookie: reject any
		// state-changing verb that didn't originate from our own origin, so a
		// fund-moving call can never be driven cross-site even if a cookie leaks.
		const mutating = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
		if (mutating && !isSameSiteOrigin(req)) {
			return error(res, 403, 'forbidden', 'cross-site request blocked');
		}
	}

	// Forward the caller's query string (Vercel folds the catch-all into
	// `path`; everything else is a real upstream query param).
	const query = {};
	for (const [k, v] of Object.entries(req.query || {})) {
		if (k !== 'path') query[k] = Array.isArray(v) ? v[0] : v;
	}

	const headers = {};
	for (const h of FORWARDABLE_HEADERS) {
		if (req.headers[h]) headers[h] = req.headers[h];
	}

	let body;
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		// Empty body is valid for some POSTs (e.g. collect/refresh actions).
		const cl = req.headers['content-length'];
		if (cl && Number(cl) > 0) body = await readJson(req);
	}

	const upstream = await sdpRequest(path, { method: req.method, query, body, headers });

	// Relay the upstream status + body verbatim so SDP's own error envelope
	// ({ error: { code, message }, meta }) and success shapes reach the client
	// unchanged. Surface the SDP trace id for support correlation.
	const extra = upstream.traceId ? { 'x-sdp-trace-id': upstream.traceId } : {};
	if (typeof upstream.body === 'string') {
		res.statusCode = upstream.status;
		res.setHeader('content-type', upstream.contentType || 'text/plain; charset=utf-8');
		res.setHeader('cache-control', 'no-store');
		for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
		return res.end(upstream.body);
	}
	return json(res, upstream.status, upstream.body, extra);
});
