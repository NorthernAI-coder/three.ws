// Verifies the navigation-aware 5xx branch in wrap() (api/_lib/http.js): a real
// browser navigation that hits an uncaught server error is redirected to the
// branded /500 page carrying its support ref + the original (redacted) path,
// while a programmatic API / agent call keeps receiving the JSON error envelope.
// This is what makes the human error UX beautiful without changing the contract
// every x402 / agent client depends on.

import { describe, it, expect } from 'vitest';
import { wrap } from '../../api/_lib/http.js';

function mockReq({ method = 'GET', url = '/api/thing?x=1', headers = {} } = {}) {
	return { method, url, headers };
}

function mockRes() {
	return {
		statusCode: 200,
		headers: {},
		body: null,
		headersSent: false,
		writableEnded: false,
		setHeader(k, v) {
			this.headers[k.toLowerCase()] = String(v);
		},
		end(payload) {
			this.writableEnded = true;
			this.body = payload ?? null;
		},
	};
}

const boom = wrap(async () => {
	throw new Error('kaboom: https://mainnet.helius-rpc.com/?api-key=sk_live_LEAK');
});

describe('wrap() 5xx navigation routing', () => {
	it('redirects a top-level browser navigation to /500 with a ref and the from path', async () => {
		const req = mockReq({
			url: '/agent/abc?lat=37.77&token=secret',
			headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html' },
		});
		const res = mockRes();
		await boom(req, res);

		expect(res.statusCode).toBe(303);
		const loc = res.headers['location'];
		expect(loc).toMatch(/^\/500\.html\?/);

		const q = new URLSearchParams(loc.slice('/500.html?'.length));
		// A correlation ref is present and looks like our 16-hex id.
		expect(q.get('ref')).toMatch(/^[0-9a-f]{16}$/);
		// `from` round-trips the original path so "Try again" retries it…
		const from = q.get('from');
		expect(from).toContain('/agent/abc');
		// …but the geo + token are redacted out of it (it lands in the address bar).
		expect(from).not.toContain('37.77');
		expect(from).not.toContain('secret');
		expect(from).toContain('REDACTED');

		// Never leak the upstream API key, not even into the redirect URL.
		expect(loc).not.toContain('sk_live_LEAK');
	});

	it('returns the JSON envelope (not a redirect) for a programmatic API call', async () => {
		// No Sec-Fetch-Mode: navigate → treated as an API / agent caller.
		const req = mockReq({ headers: { accept: 'application/json' } });
		const res = mockRes();
		await boom(req, res);

		expect(res.statusCode).toBe(500);
		expect(res.headers['location']).toBeUndefined();
		const body = JSON.parse(res.body);
		expect(body.error).toBe('internal_error');
		expect(body.ref).toMatch(/^[0-9a-f]{16}$/);
		expect(body.error_description).toContain(body.ref);
		// The sanitized envelope never carries the raw upstream message / key.
		expect(res.body).not.toContain('sk_live_LEAK');
	});

	it('treats a fetch() request (sec-fetch-mode: cors) as an API call', async () => {
		const req = mockReq({ headers: { 'sec-fetch-mode': 'cors', accept: 'text/html' } });
		const res = mockRes();
		await boom(req, res);
		// Even though Accept prefers HTML, an explicit non-navigate mode wins.
		expect(res.statusCode).toBe(500);
		expect(res.headers['location']).toBeUndefined();
	});
});
