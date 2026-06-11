// Ingest endpoint for first-party client-side error reports sent by
// public/error-reporter.js (loaded on every page). Each accepted event is
// logged as one structured "[client-error]" line so browser errors from real
// users are searchable in the Vercel function logs (and any attached log
// drain), and JS errors are forwarded to Sentry when SENTRY_DSN is set.
//
// The client batches, dedupes, and hard-caps per page; this side re-validates
// and re-truncates everything anyway — the payload is attacker-controllable
// public input, so nothing from it is trusted or echoed back.

import { cors, json, method, readJson, wrap, error, rateLimited } from './_lib/http.js';
import { limits, clientIp } from './_lib/rate-limit.js';
import { captureException } from './_lib/sentry.js';

const MAX_EVENTS_PER_BATCH = 25;
const EVENT_TYPES = new Set(['error', 'unhandledrejection', 'resource', 'manual']);
const LIMITS = { message: 500, stack: 4000, url: 500, name: 100, tag: 20 };

function str(value, max) {
	if (typeof value !== 'string' || !value) return undefined;
	return value.length > max ? `${value.slice(0, max)}…` : value;
}

function int(value) {
	return Number.isFinite(value) ? Math.trunc(value) : undefined;
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

	let body;
	try {
		body = await readJson(req, 64_000);
	} catch (err) {
		return error(res, err.status || 400, 'validation_error', err.message || 'invalid body');
	}

	const rawEvents = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
	const events = rawEvents.map(sanitizeEvent).filter(Boolean);
	if (!events.length) return error(res, 400, 'validation_error', 'events array required');

	const context = {
		page: str(body?.page, LIMITS.url),
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

		// Resource 404s stay log-only — they group terribly as exceptions.
		// Real JS errors carry their original browser stack into Sentry.
		if (event.type !== 'resource') {
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
		}
	}

	return json(res, 202, { received: events.length });
});
