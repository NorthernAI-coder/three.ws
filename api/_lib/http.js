// @ts-check
// HTTP helpers for Vercel Node handlers. Keeps handlers small + consistent.

import { webcrypto } from 'node:crypto';
import { env } from './env.js';
import { captureException } from './sentry.js';
import { sendOpsAlert } from './alerts.js';
import { instrument as zauthInstrument, drain as zauthDrain } from './zauth.js';

export function json(res, status, body, headers = {}) {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.setHeader('x-content-type-options', 'nosniff');
	res.setHeader('x-frame-options', 'DENY');
	res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
	for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
	res.end(JSON.stringify(body));
}

export function text(res, status, body, headers = {}) {
	res.statusCode = status;
	res.setHeader('content-type', 'text/plain; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.setHeader('x-content-type-options', 'nosniff');
	res.setHeader('x-frame-options', 'DENY');
	res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
	for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
	res.end(body);
}

export function redirect(res, location, status = 302) {
	res.statusCode = status;
	res.setHeader('location', location);
	res.setHeader('cache-control', 'no-store');
	res.end();
}

export function error(res, status, code, message, extra = {}) {
	return json(res, status, { error: code, error_description: message, ...extra });
}

// Query params that can carry a user's real-world position or a bearer-style
// device credential. These must never reach a log line, Sentry event, or ops
// alert — all off-box sinks — so they are stripped from any request URL we log.
// Matched on the lower-cased key so camelCase / snake_case variants are covered.
const SENSITIVE_QUERY_KEYS = new Set([
	'lat', 'lng', 'latitude', 'longitude', 'll', 'coords', 'coord',
	'originlat', 'originlng', 'origin_lat', 'origin_lng',
	'devicetoken', 'device_token', 'token',
]);

// Reduce a request URL to a log-safe form: keep the path and any benign params,
// but redact values that reveal a location or a credential. A geolocated read
// such as /api/irl/pins?lat=…&lng=…&deviceToken=… would otherwise spill the
// caller's exact position AND their device token into console / Sentry / Telegram
// on any 5xx — so every place req.url flows to a log sink routes through here.
export function redactUrl(rawUrl) {
	const url = String(rawUrl ?? '');
	const qIdx = url.indexOf('?');
	if (qIdx < 0) return url;
	const path = url.slice(0, qIdx);
	let params;
	try {
		params = new URLSearchParams(url.slice(qIdx + 1));
	} catch {
		// Unparseable query → don't risk logging the raw (possibly sensitive) tail.
		return `${path}?REDACTED`;
	}
	let touched = false;
	for (const key of [...params.keys()]) {
		if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
			params.set(key, 'REDACTED');
			touched = true;
		}
	}
	if (!touched) return url;
	const qs = params.toString();
	return qs ? `${path}?${qs}` : path;
}

// Short, URL-safe correlation id for tying a sanitized 5xx response back to the
// full server-side log line. Not security-sensitive — just needs to be unique.
function correlationId() {
	const b = new Uint8Array(8);
	/** @type {Crypto} */ (globalThis.crypto || webcrypto).getRandomValues(b);
	return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// Emit a 5xx WITHOUT leaking internal error detail to the client. The real
// message (which may carry RPC URLs, wallet addresses, or stack-derived text)
// is logged + captured server-side under a correlation id the caller can quote
// to support; the client only sees a generic description + the ref.
export function serverError(res, status, code, err, extra = {}) {
	const ref = correlationId();
	const detail = err?.message || String(err ?? 'unknown error');
	console.error(`[server-error ${ref}] ${code} (${status}): ${detail}`);
	try {
		captureException(err instanceof Error ? err : new Error(detail), { ref, code, status });
		// Fire-and-forget like captureException; deduped per error class+message
		// (ref excluded from the signature so each occurrence doesn't re-alert).
		sendOpsAlert(`${status} ${code}`, `${detail}\nref ${ref}`, {
			signature: `server:${code}:${status}:${detail}`,
		});
	} catch {
		/* sentry/alerts best-effort; never mask the original failure */
	}
	return json(res, status, {
		error: code,
		error_description: `internal error — quote ref ${ref} to support`,
		ref,
		...extra,
	});
}

// Dispatch: client-fault (4xx) keep their descriptive message; server-fault
// (5xx) are sanitized via serverError. Use this in catch blocks where the
// status is derived from `err.status` and may be either class.
export function respondError(res, status, code, err, extra = {}) {
	if (status < 500) {
		return error(res, status, code, err?.message || code, extra);
	}
	return serverError(res, status, code, err, extra);
}

// Advertise the limiter budget on the response using the conventional
// `RateLimit-*` headers (the shape GitHub/Stripe and the IETF
// draft-ietf-httpapi-ratelimit-headers converge on). `result` is the object
// returned by api/_lib/rate-limit.js limiters: { success, limit, remaining,
// reset } where `reset` is an absolute epoch-ms timestamp. Returns the
// seconds-until-reset so callers can reuse it for Retry-After.
export function setRateLimitHeaders(res, result) {
	if (!result) return 0;
	const now = Date.now();
	const resetSec = Math.max(0, Math.ceil(((result.reset ?? now) - now) / 1000));
	if (Number.isFinite(result.limit)) res.setHeader('ratelimit-limit', String(result.limit));
	if (Number.isFinite(result.remaining)) {
		res.setHeader('ratelimit-remaining', String(Math.max(0, result.remaining)));
	}
	res.setHeader('ratelimit-reset', String(resetSec));
	return resetSec;
}

// Standard 429 response. Given a limiter result, set the RateLimit-* budget
// headers plus Retry-After (RFC 9110 §10.2.3) so well-behaved clients — and the
// paying agents this platform is built for — back off by the exact window
// instead of hammering or giving up blind. `retry_after` is mirrored into the
// JSON body for clients that read the envelope rather than headers.
export function rateLimited(res, result, message = 'too many requests', extra = {}) {
	const retryAfter = Math.max(1, setRateLimitHeaders(res, result));
	res.setHeader('retry-after', String(retryAfter));
	// Surface the limiter's own `reason` (set by api/_lib/rate-limit.js) so clients
	// can tell a genuine quota hit from a degraded/unavailable limiter — e.g. a
	// Redis outage fails critical buckets closed with `rate_limiter_unavailable`,
	// which a client should present as "temporarily unavailable, retrying" rather
	// than "you've hit your limit".
	const reason = result?.reason;
	return error(res, 429, 'rate_limited', message, {
		retry_after: retryAfter,
		...(reason ? { reason } : {}),
		...extra,
	});
}

// Response shape used for zod validation errors so clients can render
// field-level feedback. Mirrors RFC 9457-style problem details (lite).
export function validationError(res, err) {
	return json(res, err.status || 400, {
		error: err.code || 'validation_error',
		error_description: err.message || 'invalid input',
		issues: err.issues || [],
	});
}

export async function readJson(req, limit = 1_000_000) {
	const ct = req.headers['content-type'] || '';
	if (!ct.includes('application/json')) {
		throw Object.assign(new Error('content-type must be application/json'), { status: 415 });
	}
	return readBody(req, limit).then((buf) => {
		try {
			return JSON.parse(buf.toString('utf8'));
		} catch {
			throw Object.assign(new Error('invalid JSON'), { status: 400 });
		}
	});
}

export async function readForm(req, limit = 1_000_000) {
	const buf = await readBody(req, limit);
	return Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
}

export function readBody(req, limit) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let total = 0;
		req.on('data', (c) => {
			total += c.length;
			if (total > limit) {
				reject(Object.assign(new Error('payload too large'), { status: 413 }));
				req.destroy();
				return;
			}
			chunks.push(c);
		});
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

export function cors(
	req,
	res,
	{ origins = null, methods = 'GET,POST,OPTIONS', credentials = false } = {},
) {
	const origin = req.headers.origin;
	if (origins === '*') {
		res.setHeader('access-control-allow-origin', '*');
	} else if (origin && isAllowedOrigin(origin, origins)) {
		res.setHeader('access-control-allow-origin', origin);
		res.setHeader('vary', 'origin');
		if (credentials) res.setHeader('access-control-allow-credentials', 'true');
	}
	res.setHeader('access-control-allow-methods', methods);
	res.setHeader(
		'access-control-allow-headers',
		'authorization, content-type, mcp-session-id, mcp-protocol-version, x-payment, payment-signature, idempotency-key, x-irl-device, x-irl-fix',
	);
	// x402: clients (drop-in modal, x402-fetch) must read these to drive the
	// 402-pay-retry flow and surface settlement receipts. Without `expose`,
	// cross-origin readers only see CORS-safelisted response headers.
	res.setHeader(
		'access-control-expose-headers',
		'PAYMENT-REQUIRED, x-payment-response, x-payment-network, x-payment-tx, link',
	);
	res.setHeader('access-control-max-age', '86400');
	if (req.method === 'OPTIONS') {
		res.statusCode = 204;
		res.end();
		return true;
	}
	return false;
}

function isAllowedOrigin(origin, allowed) {
	if (!allowed) {
		if (origin === env.APP_ORIGIN) return true;
		if (origin === 'https://x402scan.com') return true;
		if (origin === 'https://agentic.market') return true;
		if (origin === 'https://www.agentic.market') return true;
		if (
			process.env.NODE_ENV !== 'production' &&
			/^https?:\/\/localhost(:\d+)?$/.test(origin)
		) {
			return true;
		}
		return false;
	}
	return allowed.some((pat) => (typeof pat === 'string' ? origin === pat : pat.test(origin)));
}

// Wrap async handlers so uncaught errors return a consistent JSON envelope.
export function wrap(handler) {
	return async (req, res, ...rest) => {
		const monitored = zauthInstrument(req, res);
		try {
			await handler(req, res, ...rest);
		} catch (err) {
			const status = err.status || 500;
			if (status >= 500) {
				const ref = correlationId();
				// Redact coordinates / device tokens so a 5xx on a geolocated read never
				// spills the caller's position or credential to an off-box sink.
				console.error(`[api] unhandled [ref ${ref}]`, err);
				captureException(err, { ref, url: redactUrl(req.url), method: req.method });
				sendOpsAlert(`unhandled 5xx in ${req.method} ${redactUrl(req.url)}`, `${err?.message || String(err)}\nref ${ref}`, {
					signature: `unhandled:${redactUrl(req.url)}:${err?.message}`,
				});
				// Never echo a raw upstream message in a 5xx body — Solana/web3.js
				// network errors embed the keyed RPC URL (…helius-rpc.com/?api-key=…),
				// so err.message would leak HELIUS_API_KEY to the client. Hand back a
				// sanitized envelope keyed to the same ref we just logged.
				if (!res.headersSent && !res.writableEnded) {
					json(res, status, {
						error: err.code || 'internal_error',
						error_description: `internal error — quote ref ${ref} to support`,
						ref,
					});
				}
			} else if (!res.headersSent && !res.writableEnded) {
				if (err.code === 'validation_error' && Array.isArray(err.issues)) {
					validationError(res, err);
				} else {
					error(res, status, err.code || 'bad_request', err.message || 'error');
				}
			}
		}
		// Keep the lambda alive briefly so the zauth SDK's in-flight POST to
		// back.zauthx402.com can finish. Cost: ~250ms of post-response runtime
		// on monitored requests only. The user has already received the response.
		if (monitored) await zauthDrain();
	};
}

export function method(req, res, allowed) {
	const m = req.method || 'GET';
	// HEAD must be allowed wherever GET is allowed (RFC 9110 §9.3.2).
	// Treat an incoming HEAD as GET for the purposes of the allowlist check;
	// Node.js HTTP automatically strips the response body on HEAD responses.
	const effective = (m === 'HEAD' && allowed.includes('GET')) ? 'GET' : m;
	if (!allowed.includes(effective)) {
		const advertised = allowed.includes('GET') ? [...allowed, 'HEAD'] : allowed;
		res.setHeader('allow', advertised.join(', '));
		error(res, 405, 'method_not_allowed', `method ${m} not allowed`);
		return false;
	}
	return true;
}
