// Unit tests for /api/client-errors — the client-side error report ingest.
// Verifies the real contract without network: validation and truncation of
// attacker-controllable input, the per-event "[client-error]" log line that
// Vercel log search depends on, Sentry forwarding for JS errors (but not
// resource 404s), rate limiting, and method/CORS handling.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable } from 'node:stream';

const state = { rateLimited: false };

vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: {
		clientErrorsIp: vi.fn(async () =>
			state.rateLimited
				? { success: false, limit: 30, remaining: 0, reset: Date.now() + 60_000 }
				: { success: true, limit: 30, remaining: 29, reset: Date.now() + 60_000 },
		),
	},
	clientIp: vi.fn(() => '203.0.113.7'),
}));

const captureException = vi.fn();
vi.mock('../../api/_lib/sentry.js', () => ({
	captureException: (...args) => captureException(...args),
	captureMessage: vi.fn(),
}));

const sendOpsAlert = vi.fn();
vi.mock('../../api/_lib/alerts.js', () => ({
	sendOpsAlert: (...args) => sendOpsAlert(...args),
}));

const { default: handler } = await import('../../api/client-errors.js');

function makeReq({ method = 'POST', body = null, raw = null, contentType } = {}) {
	const payload = raw ?? (body ? JSON.stringify(body) : '');
	const req = Readable.from(payload ? [Buffer.from(payload)] : []);
	req.method = method;
	req.url = '/api/client-errors';
	req.headers = {
		host: 'localhost',
		'content-type': contentType || 'application/json',
		'user-agent': 'TestBrowser/1.0',
	};
	return req;
}

function makeRes() {
	return {
		statusCode: 200,
		headers: {},
		body: '',
		writableEnded: false,
		setHeader(k, v) {
			this.headers[k.toLowerCase()] = v;
		},
		end(chunk) {
			if (chunk !== undefined) this.body += chunk;
			this.writableEnded = true;
		},
	};
}

async function invoke(reqOpts) {
	const res = makeRes();
	await handler(makeReq(reqOpts), res);
	let body = null;
	try {
		body = JSON.parse(res.body);
	} catch {
		/* non-JSON (e.g. empty 204) */
	}
	return { status: res.statusCode, body, res };
}

const errorEvent = (overrides = {}) => ({
	type: 'error',
	name: 'TypeError',
	message: 'x is not a function',
	source: 'https://three.ws/app.js',
	line: 12,
	col: 3,
	stack: 'TypeError: x is not a function\n    at boot (https://three.ws/app.js:12:3)',
	ts: 1_750_000_000_000,
	...overrides,
});

let consoleError;
beforeEach(() => {
	state.rateLimited = false;
	captureException.mockClear();
	sendOpsAlert.mockClear();
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	consoleError.mockRestore();
});

describe('api/client-errors', () => {
	it('rejects non-POST methods', async () => {
		const { status, body } = await invoke({ method: 'GET' });
		expect(status).toBe(405);
		expect(body.error).toBe('method_not_allowed');
	});

	it('answers OPTIONS preflight with 204', async () => {
		const { status } = await invoke({ method: 'OPTIONS' });
		expect(status).toBe(204);
	});

	it('rejects an empty or missing events array', async () => {
		for (const body of [{}, { events: [] }, { events: 'nope' }]) {
			const { status, body: out } = await invoke({ body });
			expect(status).toBe(400);
			expect(out.error).toBe('validation_error');
		}
	});

	it('rejects invalid JSON', async () => {
		const { status, body } = await invoke({ raw: '{not json' });
		expect(status).toBe(400);
		expect(body.error).toBe('validation_error');
	});

	it('accepts a batch and logs one [client-error] line per event', async () => {
		const { status, body } = await invoke({
			body: {
				page: 'https://three.ws/play',
				viewport: { w: 1440, h: 900 },
				events: [errorEvent(), errorEvent({ type: 'unhandledrejection', message: 'boom' })],
			},
		});
		expect(status).toBe(202);
		expect(body.received).toBe(2);
		const lines = consoleError.mock.calls.filter(([tag]) => tag === '[client-error]');
		expect(lines).toHaveLength(2);
		const logged = JSON.parse(lines[0][1]);
		expect(logged.message).toBe('x is not a function');
		expect(logged.page).toBe('https://three.ws/play');
		expect(logged.ua).toBe('TestBrowser/1.0');
		expect(logged.ip).toBe('203.0.113.7');
	});

	it('forwards JS errors to Sentry with the client stack, but not resource events', async () => {
		await invoke({
			body: {
				events: [
					errorEvent(),
					{ type: 'resource', tag: 'img', message: 'failed to load img', source: 'https://three.ws/x.png' },
				],
			},
		});
		expect(captureException).toHaveBeenCalledTimes(1);
		const [err, ctx] = captureException.mock.calls[0];
		expect(err.name).toBe('TypeError');
		expect(err.stack).toContain('at boot (https://three.ws/app.js:12:3)');
		expect(ctx.origin).toBe('client');
	});

	it('drops malformed events and truncates oversized fields', async () => {
		const { status, body } = await invoke({
			body: {
				events: [
					errorEvent({ message: 'a'.repeat(2000), stack: 'b'.repeat(10_000) }),
					{ type: 'bogus-type', message: 'x' },
					{ type: 'error' }, // no message
					'not-an-object',
				],
			},
		});
		expect(status).toBe(202);
		expect(body.received).toBe(1);
		const logged = JSON.parse(
			consoleError.mock.calls.find(([tag]) => tag === '[client-error]')[1],
		);
		expect(logged.message.length).toBe(501); // 500 + ellipsis
		expect(logged.stack.length).toBe(4001);
	});

	it('caps a batch at 25 events', async () => {
		const { status, body } = await invoke({
			body: { events: Array.from({ length: 40 }, () => errorEvent()) },
		});
		expect(status).toBe(202);
		expect(body.received).toBe(25);
	});

	it('pages the ops channel for JS errors but not resource events', async () => {
		await invoke({
			body: {
				page: 'https://three.ws/play',
				events: [
					errorEvent(),
					{ type: 'resource', tag: 'img', message: 'failed to load img', source: 'https://three.ws/x.png' },
				],
			},
		});
		expect(sendOpsAlert).toHaveBeenCalledTimes(1);
		expect(sendOpsAlert.mock.calls[0][0]).toContain('client error on https://three.ws/play');
	});

	it('ingests report-uri CSP reports (application/csp-report)', async () => {
		const { status, body } = await invoke({
			contentType: 'application/csp-report',
			raw: JSON.stringify({
				'csp-report': {
					'document-uri': 'https://three.ws/play',
					'violated-directive': 'script-src',
					'effective-directive': 'script-src',
					'blocked-uri': 'https://evil.example/x.js',
					'line-number': 7,
				},
			}),
		});
		expect(status).toBe(202);
		expect(body.received).toBe(1);
		const logged = JSON.parse(
			consoleError.mock.calls.find(([tag]) => tag === '[client-error]')[1],
		);
		expect(logged.type).toBe('csp');
		expect(logged.message).toBe('CSP violation: script-src');
		expect(logged.source).toBe('https://evil.example/x.js');
		// CSP stays log-only: no Sentry, no ops page.
		expect(captureException).not.toHaveBeenCalled();
		expect(sendOpsAlert).not.toHaveBeenCalled();
	});

	it('ingests report-to CSP reports (application/reports+json)', async () => {
		const { status, body } = await invoke({
			contentType: 'application/reports+json',
			raw: JSON.stringify([
				{
					type: 'csp-violation',
					body: {
						documentURL: 'https://three.ws/',
						effectiveDirective: 'object-src',
						blockedURL: 'https://evil.example/applet',
					},
				},
			]),
		});
		expect(status).toBe(202);
		expect(body.received).toBe(1);
		const logged = JSON.parse(
			consoleError.mock.calls.find(([tag]) => tag === '[client-error]')[1],
		);
		expect(logged.message).toBe('CSP violation: object-src');
	});

	it('returns 429 with Retry-After when the IP is rate limited', async () => {
		state.rateLimited = true;
		const { status, body, res } = await invoke({ body: { events: [errorEvent()] } });
		expect(status).toBe(429);
		expect(body.error).toBe('rate_limited');
		expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
	});
});
