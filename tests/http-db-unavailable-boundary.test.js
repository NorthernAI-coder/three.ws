/**
 * http.js error boundary — database-unavailable degradation.
 *
 * A missing/rotated DATABASE_URL makes every DB-backed read reject. Two contracts
 * keep that from turning into a log + alert + Sentry storm:
 *   1. wrap() classifies the DB-down error as 503 (Retry-After) and does NOT emit
 *      the per-request `[api] unhandled` error line — it throttles to a warn.
 *   2. serverError() coerces a DB-down error to 503 + Retry-After regardless of
 *      the caller's nominal status (sitemap/deployments pass 500/502).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wrap, serverError } from '../api/_lib/http.js';

// Minimal ServerResponse stand-in: case-insensitive header store + end capture.
function fakeRes() {
	const headers = {};
	return {
		statusCode: 0,
		body: undefined,
		ended: false,
		headersSent: false,
		writableEnded: false,
		setHeader(k, v) { headers[String(k).toLowerCase()] = v; },
		getHeader(k) { return headers[String(k).toLowerCase()]; },
		end(b) { this.body = b; this.ended = true; this.writableEnded = true; },
		_headers: headers,
	};
}

function dbDownError() {
	// The exact shape thrown by the env accessor when DATABASE_URL is absent.
	return new Error('Missing required env var: DATABASE_URL');
}

let errSpy, warnSpy;
beforeEach(() => {
	errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	errSpy.mockRestore();
	warnSpy.mockRestore();
});

describe('wrap() under a DB outage', () => {
	it('returns 503 + Retry-After and does not log [api] unhandled at error level', async () => {
		const handler = wrap(async () => { throw dbDownError(); });
		const res = fakeRes();
		await handler({ method: 'GET', url: '/api/galaxy/flows', headers: {} }, res);

		expect(res.statusCode).toBe(503);
		expect(res.getHeader('retry-after')).toBe('30');
		expect(JSON.parse(res.body).error).toBe('service_unavailable');

		// No `[api] unhandled` error line — the outage is throttled to a warn instead.
		const unhandled = errSpy.mock.calls.some((c) => String(c[0]).includes('[api] unhandled'));
		expect(unhandled).toBe(false);
	});

	it('still logs and 500s a genuine (non-DB) handler bug', async () => {
		const handler = wrap(async () => { throw new Error('boom'); });
		const res = fakeRes();
		await handler({ method: 'GET', url: '/api/whatever', headers: {} }, res);

		expect(res.statusCode).toBe(500);
		const unhandled = errSpy.mock.calls.some((c) => String(c[0]).includes('[api] unhandled'));
		expect(unhandled).toBe(true);
	});
});

describe('serverError() under a DB outage', () => {
	it('coerces a DB-down error to 503 + Retry-After regardless of the nominal status', () => {
		const res = fakeRes();
		serverError(res, 500, 'sitemap_failed', dbDownError());

		expect(res.statusCode).toBe(503);
		expect(res.getHeader('retry-after')).toBe('30');
		expect(JSON.parse(res.body).error).toBe('service_unavailable');

		// Reported as a throttled warn, not the `[server-error]` error line.
		const serverErr = errSpy.mock.calls.some((c) => String(c[0]).includes('[server-error'));
		expect(serverErr).toBe(false);
	});

	it('keeps a genuine 5xx as-is with the [server-error] log line', () => {
		const res = fakeRes();
		serverError(res, 502, 'pulse_failed', new Error('upstream exploded'));

		expect(res.statusCode).toBe(502);
		expect(JSON.parse(res.body).error).toBe('pulse_failed');
		const serverErr = errSpy.mock.calls.some((c) => String(c[0]).includes('[server-error'));
		expect(serverErr).toBe(true);
	});
});
