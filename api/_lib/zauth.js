// zauthx402 SDK adapter for Vercel serverless.
//
// The upstream `@zauthx402/sdk/middleware` is shaped for Express: it expects
// `req.path`, `req.protocol`, `req.get(name)`, `req.originalUrl`, `req.ip`,
// and patches `res.json/send/end`. Our endpoints run as bare Vercel Node
// handlers (http.IncomingMessage / http.ServerResponse), so we shim the
// missing properties before invoking the middleware once per request.
//
// Disabled cleanly when ZAUTH_API_KEY is unset — `instrument()` becomes a
// no-op so unrelated environments don't pay any cost.
//
// Import from the main entry — `zauthProvider` is re-exported there. The
// docs use `@zauthx402/sdk/middleware`, but Vercel's @vercel/nft fails to
// bundle that subpath (conditional exports import/require split), so the
// dist/middleware/index.js is missing in /var/task at runtime. The main
// entry traces correctly.

import { zauthProvider, ZauthClient } from '@zauthx402/sdk';
import { env } from './env.js';

let cached;
let _bootLogged = false;

// The SDK submits telemetry with a fire-and-forget `fetch` it never hands back
// a promise for, so on Vercel the function can freeze mid-POST and silently
// drop the event. We wrap `fetch` once (only when monitoring is enabled) to
// track in-flight POSTs to the zauth backend; `drain()` then awaits exactly
// those, capped — reliable delivery instead of a fixed-time guess. Only
// zauth-host requests are ever tracked; all other traffic passes through
// untouched and unobserved.
const ZAUTH_HOST = (process.env.ZAUTH_API_ENDPOINT || 'https://back.zauthx402.com')
	.replace(/^https?:\/\//, '')
	.replace(/\/.*$/, '');
const _inflight = new Set();
let _fetchWrapped = false;

// The SDK's flush() early-returns while a previous batch is still submitting
// (`isFlushing`) and nothing ever re-triggers it, so an event queued during
// submission is stranded until some later request happens to queue another
// event on a warm lambda. With flush-per-event batching that hits the
// response event on every monitored request (queued at res.end while the
// request-event batch is in flight) — confirmed in production runtime logs.
// The middleware never hands back its internal client, so capture instances
// at the prototype level; drain() re-flushes any non-empty queue.
const _clients = new Set();
let _clientHooked = false;

function trackZauthClients() {
	if (_clientHooked || typeof ZauthClient?.prototype?.queueEvent !== 'function') return;
	_clientHooked = true;
	const origQueueEvent = ZauthClient.prototype.queueEvent;
	ZauthClient.prototype.queueEvent = function (event) {
		_clients.add(this);
		return origQueueEvent.call(this, event);
	};
}

function trackZauthFetch() {
	if (_fetchWrapped || typeof globalThis.fetch !== 'function') return;
	_fetchWrapped = true;
	const realFetch = globalThis.fetch.bind(globalThis);
	globalThis.fetch = (input, init) => {
		const url = typeof input === 'string' ? input : input?.url || '';
		const promise = realFetch(input, init);
		if (url.includes(ZAUTH_HOST)) {
			_inflight.add(promise);
			promise.then(
				() => { _inflight.delete(promise); if (env.ZAUTH_DEBUG === '1') console.log('[zauth] Batch submitted'); },
				// Telemetry is fire-and-forget: a transient network blip reaching
				// back.zauthx402.com (or the lambda freezing mid-POST) must never be
				// logged at error level — it isn't a request failure and was
				// drowning genuine errors in the function logs. Warn, not error.
				(err) => { _inflight.delete(promise); console.warn('[zauth] telemetry delivery failed (non-fatal):', err?.message || err); },
			);
		}
		return promise;
	};
}

// The deploy environment reported to the Provider Hub dashboard. The SDK
// defaults to 'development'; without this, production telemetry would be
// mislabeled. VERCEL_ENV is 'production' | 'preview' | 'development' on Vercel.
function resolveEnvironment() {
	if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') return 'production';
	return env.VERCEL_ENV || 'development';
}

function buildMiddleware() {
	const apiKey = env.ZAUTH_API_KEY;
	if (!apiKey) {
		if (env.ZAUTH_DEBUG === '1' && !_bootLogged) {
			console.log('[zauth] disabled: ZAUTH_API_KEY not set');
			_bootLogged = true;
		}
		return null;
	}
	try {
		// Vercel serverless freezes the function the moment res.end returns,
		// killing the SDK's default 5-second batch timer (and any in-flight
		// POST to back.zauthx402.com). Force flush-per-event so submission
		// starts immediately; the `drain()` helper below keeps the lambda
		// alive long enough for that POST to complete.
		const includeBodies = env.ZAUTH_INCLUDE_BODIES === '1';
		const evmKey = env.ZAUTH_REFUND_PRIVATE_KEY || undefined;
		const solKey = env.ZAUTH_SOLANA_PRIVATE_KEY || undefined;
		const refundEnabled = Boolean(evmKey || solKey);

		trackZauthClients();
		const mw = zauthProvider(apiKey, {
			environment: resolveEnvironment(),
			shouldMonitor: shouldMonitorReq,
			debug: env.ZAUTH_DEBUG === '1',
			batching: { maxBatchSize: 1, maxBatchWaitMs: 0, retry: false },
			// Validate responses so the dashboard has health signal beyond status
			// codes. Our paid routes return JSON objects — reject empty collections
			// and bodies that only contain error fields.
			validation: {
				minResponseSize: 2,
				rejectEmptyCollections: true,
				errorFields: ['error', 'error_description'],
			},
			// Auto-refund callers who pay and then hit a genuine server-side
			// failure (5xx) or a timeout — NOT a valid empty result (see triggers).
			// Enabled only when at least one refund keypair is present. Caps are
			// set above our highest tool price ($0.05) with conservative daily/
			// monthly ceilings; all three are overridable via env without a deploy.
			refund: {
				enabled: refundEnabled,
				privateKey: evmKey,
				solanaPrivateKey: solKey,
				maxRefundUsd: Number(process.env.ZAUTH_REFUND_MAX_USD) || 0.1,
				dailyCapUsd: Number(process.env.ZAUTH_REFUND_DAILY_CAP_USD) || 25.0,
				monthlyCapUsd: Number(process.env.ZAUTH_REFUND_MONTHLY_CAP_USD) || 250.0,
				triggers: {
					serverError: true,
					// Anti-griefing: a valid empty result (search with zero matches, empty
					// claims window) is a normal billable outcome; auto-refunding it let
					// an attacker farm refunds up to the daily cap with empty-result
					// calls. Genuine failures still refund via serverError (5xx)/timeout.
					emptyResponse: false,
					timeout: true,
					schemaValidation: false,
				},
				onRefund: (r) => {
					console.log(
						`[zauth] refund executed: $${r.amountUsd} → ${r.recipient} on ${r.network} tx:${r.txHash}`,
					);
				},
				onRefundError: (e) => {
					console.error(`[zauth] refund failed for ${e.url}: ${e.error}`);
				},
			},
			// Privacy: the monitored routes are payment and MCP endpoints. Ship
			// status/timing/validation telemetry, but NOT the request/response
			// bodies (payment payloads, tool args) unless explicitly opted in.
			// The SDK validates responses locally and only reports the verdict,
			// so health classification is unaffected when bodies are withheld.
			telemetry: {
				includeRequestBody: includeBodies,
				includeResponseBody: includeBodies,
				// redactHeaders replaces (not merges) the SDK default list, so we
				// restate its entries and add every header that can carry a payment
				// proof, session, or secret on these routes.
				redactHeaders: [
					'authorization',
					'cookie',
					'set-cookie',
					'x-api-key',
					'x-api-secret',
					'x-payment',
					'x-payment-intent',
					'x-payment-signature',
					'x-payment-response',
					'payment-signature',
					'sign-in-with-x',
				],
			},
		});
		trackZauthFetch();
		if (!_bootLogged) {
			console.log(`[zauth] monitoring enabled (refunds:${refundEnabled ? 'on' : 'off'})`);
			_bootLogged = true;
		}
		return mw;
	} catch (err) {
		console.error('[zauth] failed to build middleware:', err.message);
		return null;
	}
}

// Paid x402 surfaces, by path. Two groups:
//   1. MCP servers + payer/dispatcher routes (each one settles x402 payments).
//   2. Agent payment routes (delegated x402 calls + invoice payments).
//
// /api/x402/* paid services are deliberately NOT path-monitored. Every x402
// buyer flow starts with an unpaid request that gets the mandatory 402
// challenge — a body whose first field is `error`, which the SDK's response
// validation records as a failed call. Path-monitoring those routes therefore
// reported protocol-correct discovery traffic as downtime on the Provider Hub
// (success rates of 0–60% on endpoints that were healthy). Those routes are
// instead reported via the payment-header condition below: a request that
// actually attempts payment is monitored end-to-end, so genuine post-payment
// failures (and verification rejections of real payment attempts) still
// reach the dashboard.
const MONITORED_SERVERS =
	/\/api\/(wk-x402|mcp|mcp-3d|mcp-agent|mcp-bazaar|pump-fun-mcp|ibm-mcp|x402-pay)(\/|$)/;
const MONITORED_AGENTS =
	/\/api\/agents\/x402\/|\/api\/agents\/[^/]+\/x402\/|\/api\/agents\/payments\//;

function shouldMonitorReq(req) {
	const h = req.headers || {};
	if (h['x-payment-intent'] || h['x-payment'] || h['payment-signature']) return true;
	const p = req.path || '';
	if (MONITORED_SERVERS.test(p)) return true;
	return MONITORED_AGENTS.test(p);
}

function getMiddleware() {
	if (cached === undefined) cached = buildMiddleware();
	return cached;
}

/**
 * Diagnostic snapshot — does not invoke the middleware. Returns whether the
 * SDK initialized successfully and a key prefix safe to surface in responses.
 */
export function status() {
	const apiKey = env.ZAUTH_API_KEY;
	const initialized = getMiddleware() != null;
	return {
		initialized,
		hasKey: Boolean(apiKey),
		keyPrefix: apiKey ? apiKey.slice(0, 14) : null,
		environment: resolveEnvironment(),
		debug: env.ZAUTH_DEBUG === '1',
		refunds: {
			enabled: Boolean(env.ZAUTH_REFUND_PRIVATE_KEY || env.ZAUTH_SOLANA_PRIVATE_KEY),
			evm: Boolean(env.ZAUTH_REFUND_PRIVATE_KEY),
			solana: Boolean(env.ZAUTH_SOLANA_PRIVATE_KEY),
		},
	};
}

function shimResponse(res) {
	// The Express middleware does `res.json.bind(res)` / `res.send.bind(res)`
	// up-front, even if the handler never calls them. Provide Express-shaped
	// no-op fallbacks (delegating to `res.end`) so binding works. Our handlers
	// only call `res.end` directly, so these patched versions are never run.
	if (typeof res.json !== 'function') {
		res.json = function (body) {
			if (!res.getHeader('content-type')) {
				res.setHeader('content-type', 'application/json; charset=utf-8');
			}
			res.end(JSON.stringify(body));
		};
	}
	if (typeof res.send !== 'function') {
		res.send = function (body) {
			res.end(typeof body === 'string' ? body : JSON.stringify(body));
		};
	}
}

function shimRequest(req) {
	const url = req.url || '/';
	const qIdx = url.indexOf('?');
	const path = qIdx >= 0 ? url.slice(0, qIdx) : url;
	const xfProto = req.headers['x-forwarded-proto'];
	const protocol = (Array.isArray(xfProto) ? xfProto[0] : xfProto) || 'https';
	const xfFor = req.headers['x-forwarded-for'];
	const ip =
		(typeof xfFor === 'string' ? xfFor.split(',')[0].trim() : null) ||
		req.socket?.remoteAddress ||
		'';

	if (!('path' in req)) Object.defineProperty(req, 'path', { value: path });
	if (!('originalUrl' in req)) Object.defineProperty(req, 'originalUrl', { value: url });
	if (!('protocol' in req)) Object.defineProperty(req, 'protocol', { value: protocol });
	if (!('ip' in req)) Object.defineProperty(req, 'ip', { value: ip });
	if (typeof req.get !== 'function') {
		req.get = (name) => {
			const v = req.headers[String(name).toLowerCase()];
			return Array.isArray(v) ? v[0] : v;
		};
	}
	// `req.body` is undefined on raw Vercel handlers; the SDK only reads it
	// for an optional byte-size estimate, so leaving it undefined is fine.
}

/**
 * Run the zauth middleware once for this request. Safe to call on every
 * request — internal `shouldMonitor` filters non-x402 traffic. Returns
 * `true` if this request will be reported (caller should `await drain()`
 * after `res.end` to keep the lambda alive long enough to flush).
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean}
 */
export function instrument(req, res) {
	const mw = getMiddleware();
	if (!mw) return false;
	// Idempotency: dispatcher routes (wk.js, x402/service.js) run wrap() at the
	// top level AND invoke paidEndpoint-built handlers (also wrap()-ed) inside —
	// without this guard the SDK middleware would observe and report the same
	// request twice.
	if (req.__zauthInstrumented) return req.__zauthMonitored === true;
	req.__zauthInstrumented = true;
	try {
		shimRequest(req);
		shimResponse(res);
		const monitored = shouldMonitorReq(req);
		mw(req, res, () => {});
		req.__zauthMonitored = monitored;
		return monitored;
	} catch (err) {
		console.error('[zauth] middleware error:', err.message);
		return false;
	}
}

/**
 * Hold the lambda open until the SDK's telemetry actually reaches the zauth
 * backend, so Vercel doesn't freeze the function mid-flush and drop events.
 * Awaits the tracked in-flight POSTs AND re-flushes any event the SDK
 * stranded in its queue while a previous batch was submitting (its flush()
 * early-returns on `isFlushing` and never reschedules). Capped by
 * ZAUTH_DRAIN_MAX_MS (default 1500ms) so a hung backend can never stall the
 * response runtime. Only call this on requests where `instrument()` returned
 * true.
 */
export async function drain() {
	const capMs = Number(process.env.ZAUTH_DRAIN_MAX_MS) || 1500;
	const deadline = Date.now() + capMs;
	// The first POST may be scheduled on the next microtask; give it a beat
	// to register before deciding there is nothing to wait for.
	if (_inflight.size === 0) await beat(50);
	while (Date.now() < deadline) {
		if (_inflight.size > 0) {
			// A settling batch can strand an event queued meanwhile (see
			// trackZauthClients) — loop back and re-check the queues after.
			await settleInflight(deadline - Date.now());
			continue;
		}
		const stranded = [..._clients].filter((c) => c.eventQueue?.length && !c.isFlushing);
		if (stranded.length > 0) {
			await Promise.race([
				Promise.allSettled(stranded.map((c) => c.flush())),
				beat(deadline - Date.now()),
			]);
			continue;
		}
		// Queues empty; if a flush is mid-flight without its fetch registered
		// yet, give it a beat — otherwise everything is delivered.
		if ([..._clients].some((c) => c.isFlushing)) {
			await beat(25);
			continue;
		}
		return;
	}
}

function beat(ms) {
	return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function settleInflight(capMs) {
	const pending = Promise.allSettled([..._inflight]);
	return Promise.race([pending, beat(capMs)]);
}
