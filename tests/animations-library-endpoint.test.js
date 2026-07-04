/**
 * GET /api/animations/library — full motion library manifest proxy.
 *
 * The endpoint proxies the R2-hosted library manifest (published by
 * scripts/mixamo-all.mjs --upload). Contract under test:
 *   - pre-launch (manifest object missing) → 200 { clips: [], total: 0 },
 *     never an error, so the gallery/embed/studio feature-detect by emptiness;
 *   - published manifest ({ clips: [...] } shape) → clips passed through with
 *     total derived server-side;
 *   - bare-array manifest (legacy shape) → also accepted;
 *   - non-GET → 405.
 */

import { describe, it, expect, vi } from 'vitest';

const getObjectBuffer = vi.fn();
vi.mock('../api/_lib/r2.js', () => ({ getObjectBuffer: (...a) => getObjectBuffer(...a) }));

const { default: handler } = await import('../api/animations/library.js');

function fakeReq(method = 'GET') {
	return { method, url: '/api/animations/library', headers: {} };
}

function fakeRes() {
	const headers = {};
	return {
		statusCode: 0,
		body: undefined,
		ended: false,
		setHeader(k, v) { headers[String(k).toLowerCase()] = v; },
		getHeader(k) { return headers[String(k).toLowerCase()]; },
		end(b) { this.body = b; this.ended = true; },
		_headers: headers,
	};
}

const CLIP = {
	name: 'mx-hip-hop-dancing',
	label: 'Hip Hop Dancing',
	icon: '💃',
	loop: true,
	duration: 4.4,
	bytes: 1174283,
	url: 'https://cdn.example/animations/library/clips/mx-hip-hop-dancing.json',
};

// No beforeEach reset: every test installs its own mockResolvedValue/
// mockRejectedValue, which fully replaces the previous implementation.
// (vitest 4's mockReset() leaves the fn throwing the prior rejection value
// during the reset window, which fails the rejection tests spuriously.)
describe('GET /api/animations/library', () => {
	it('returns an empty library when the manifest has not been uploaded yet', async () => {
		const missing = Object.assign(new Error('no such key'), { name: 'NoSuchKey' });
		getObjectBuffer.mockRejectedValue(missing);
		const res = fakeRes();
		await handler(fakeReq(), res);
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.body)).toEqual({ clips: [], total: 0, generated_at: null });
	});

	it('degrades to an empty library on storage errors instead of failing', async () => {
		getObjectBuffer.mockRejectedValue(new Error('socket hang up'));
		const res = fakeRes();
		await handler(fakeReq(), res);
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.body).clips).toEqual([]);
	});

	it('passes through a published { clips } manifest and derives total', async () => {
		getObjectBuffer.mockResolvedValue(Buffer.from(JSON.stringify({
			generated_at: '2026-07-04T00:00:00.000Z',
			total: 1,
			clips: [CLIP],
		})));
		const res = fakeRes();
		await handler(fakeReq(), res);
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body);
		expect(body.clips).toEqual([CLIP]);
		expect(body.total).toBe(1);
		expect(body.generated_at).toBe('2026-07-04T00:00:00.000Z');
		expect(res.getHeader('cache-control')).toContain('s-maxage=300');
	});

	it('accepts a bare-array manifest shape', async () => {
		getObjectBuffer.mockResolvedValue(Buffer.from(JSON.stringify([CLIP])));
		const res = fakeRes();
		await handler(fakeReq(), res);
		expect(JSON.parse(res.body).clips).toEqual([CLIP]);
	});

	it('rejects non-GET methods', async () => {
		getObjectBuffer.mockResolvedValue(Buffer.from('[]'));
		const res = fakeRes();
		await handler(fakeReq('POST'), res);
		expect(res.statusCode).toBe(405);
	});
});
