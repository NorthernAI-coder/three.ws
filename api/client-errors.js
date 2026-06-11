// @ts-check
// Ingest endpoint for first-party client-side error reports sent by
// public/error-reporter.js (loaded on every page). Each accepted event is
// logged as one structured "[client-error]" line so browser errors from real
// users are searchable in the Vercel function logs (and any attached log
// drain), and JS errors are forwarded to Sentry when SENTRY_DSN is set.
//
// The client batches, dedupes, and hard-caps per page; this side re-validates
// and re-truncates everything anyway — the payload is attacker-controllable
// public input, so nothing from it is trusted or echoed back.

import { cors, json, method, readJson, readBody, wrap, error, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { captureException } from './_lib/sentry.js';
import { sendOpsAlert } from './_lib/alerts.js';

const MAX_EVENTS_PER_BATCH = 25;
const EVENT_TYPES = new Set(['error', 'unhandledrejection', 'resource', 'manual', 'csp']);
const LIMITS = { message: 500, stack: 4000, url: 500, name: 100, tag: 20 };

function str(value, max) {
	if (typeof value !== 'string' || !value) return undefined;
	return value.length > max ? `${value.slice(0, max)}…` : value;
}

function int(value) {
	return Number.isFinite(value) ? Math.trunc(value) : undefined;
}

// Reports whose page lives on a local dev / sandbox / private-LAN origin are
// tooling noise — failed Vite HMR sockets, headless-audit rejections, localhost
// favicon/glb 404s — and they are indistinguishable from real incidents once
// they hit the prod function logs. The client reporter (public/error-reporter.js)
// already refuses to send from these origins, but a stale dev server serving an
// older bundle, or a headless audit run, can still POST here. Drop them at the
// boundary so prod logs, Sentry, and ops paging only ever see real-user faults.
function isDevOriginPage(page) {
	if (!page) return false;
	let host;
	try {
		host = new URL(page).hostname;
	} catch {
		return false;
	}
	return (
		host === 'localhost' ||
		host === '127.0.0.1' ||
		host === '0.0.0.0' ||
		host === '[::1]' ||
		host === '::1' ||
		host.endsWith('.local') ||
		host.endsWith('.app.github.dev') || // GitHub Codespaces forwarded ports
		host.endsWith('.gitpod.io') ||
		host.endsWith('.csb.app') ||
		/^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host) // private LAN
	);
}

// Map both CSP report wire formats onto our event shape:
//   report-uri:  { "csp-report": { "violated-directive", "blocked-uri", ... } }
//   report-to:   [ { type: "csp-violation", body: { effectiveDirective, blockedURL, ... } } ]
function cspToEvents(raw) {
	const reports = Array.isArray(raw) ? raw.map((r) => r?.body || r) : [raw?.['csp-report'] || raw];
	return reports.filter(Boolean).map((r) => ({
		type: 'csp',
		message: `CSP violation: ${r['effective-directive'] || r.effectiveDirective || r['violated-directive'] || r.violatedDirective || 'unknown directive'}`,
		source: r['blocked-uri'] || r.blockedURL || r['document-uri'] || r.documentURL,
		line: r['line-number'] ?? r.lineNumber,
		col: r['column-number'] ?? r.columnNumber,
	}));
}

function sanitizeEvent(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const type = EVENT_TYPES.has(raw.type) ? raw.type : null;
	const message = str(raw.message, LIMITS.message);
	if (!type || !message) return null;
	return {
		type,
		name: str(raw.name, LIMITS.name),
		message,
		source: str(raw.source, LIMITS.url),
		line: int(raw.line),
		col: int(raw.col),
		stack: str(raw.stack, LIMITS.stack),
		tag: str(raw.tag, LIMITS.tag),
		ts: int(raw.ts),
	};
}

export default wrap(async (req, res) => {
	if (cors(req, res, { methods: 'POST,OPTIONS', credentials: false })) return;
	if (!method(req, res, ['POST'])) return;

	const ip = clientIp(req);
	const rl = await limits.clientErrorsIp(ip);
	if (!rl.success) return rateLimited(res, rl);

	// Browsers POST CSP violations (the `report-uri` directive in vercel.json's
	// CSP headers) with their own content types and shapes; normalize them into
	// the same event stream so blocked injections and broken third-party embeds
	// show up next to JS errors in the logs.
	const contentType = req.headers['content-type'] || '';
	const isCspReport =
		contentType.includes('application/csp-report') ||
		contentType.includes('application/reports+json');

	let body;
	try {
		if (isCspReport) {
			const raw = JSON.parse((await readBody(req, 64_000)).toString('utf8'));
			body = { events: cspToEvents(raw) };
		} else {
			body = await readJson(req, 64_000);
		}
	} catch (err) {
		return error(res, err.status || 400, 'validation_error', err.message || 'invalid body');
	}

	const rawEvents = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
	const events = rawEvents.map(sanitizeEvent).filter(Boolean);
	if (!events.length) return error(res, 400, 'validation_error', 'events array required');

	const page = str(body?.page, LIMITS.url);

	// Acknowledge dev/sandbox-origin batches without logging them. Returning 202
	// (not an error) keeps a stale client from retrying; the events simply never
	// pollute the prod logs / Sentry / ops channel.
	if (isDevOriginPage(page)) return json(res, 202, { received: 0, dropped: events.length });

	const context = {
		page,
		referrer: str(body?.referrer, LIMITS.url),
		viewport:
			body?.viewport && typeof body.viewport === 'object'
				? { w: int(body.viewport.w), h: int(body.viewport.h) }
				: undefined,
		ua: str(req.headers['user-agent'], 300),
		ip,
	};

	for (const event of events) {
		// One line per event keeps Vercel log search precise:
		// filter on "[client-error]" then on message/page substrings.
		console.error('[client-error]', JSON.stringify({ ...event, ...context }));

		// Resource 404s and CSP reports stay log-only — they group terribly as
		// exceptions and extensions trigger CSP constantly. Real JS errors carry
		// their original browser stack into Sentry and page the ops channel
		// (sendOpsAlert dedups per message per hour).
		if (event.type !== 'resource' && event.type !== 'csp') {
			const synthetic = new Error(event.message);
			synthetic.name = event.name || `client.${event.type}`;
			if (event.stack) synthetic.stack = event.stack;
			captureException(synthetic, {
				origin: 'client',
				page: context.page,
				source: event.source,
				line: event.line,
				col: event.col,
				ua: context.ua,
			});
			sendOpsAlert(
				`client ${event.type} on ${context.page || 'unknown page'}`,
				`${event.name ? `${event.name}: ` : ''}${event.message}${event.source ? `\n${event.source}:${event.line ?? '?'}` : ''}`,
				{ signature: `client:${event.type}:${event.message}:${event.source}` },
			);
		}
	}

	return json(res, 202, { received: events.length });
});
