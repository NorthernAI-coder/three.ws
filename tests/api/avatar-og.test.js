// Integration tests for /api/avatar/:id/og.
//
// The renderer itself (puppeteer + chromium) is exercised in
// tests/render-glb.test.js. Here we stub it at the module boundary and
// assert the endpoint's responsibilities: cache-first redirect, fallback
// rules, R2 + DB write-back on cache miss, in-memory concurrency lock.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const sqlMock = vi.fn(async () => []);
const getAvatarMock = vi.fn();
const renderGlbToPngMock = vi.fn();
const putObjectMock = vi.fn(async () => {});
const publicUrlMock = vi.fn((k) => `https://cdn.test/${k}`);

vi.mock('../../api/_lib/db.js', () => ({ sql: sqlMock }));
vi.mock('../../api/_lib/avatars.js', () => ({ getAvatar: getAvatarMock }));
vi.mock('../../api/_lib/render-glb.js', () => ({ renderGlbToPng: renderGlbToPngMock }));
vi.mock('../../api/_lib/r2.js', () => ({ putObject: putObjectMock, publicUrl: publicUrlMock }));

vi.mock('../../api/_lib/env.js', () => ({
	env: { APP_ORIGIN: 'http://localhost:3000' },
}));

vi.mock('../../api/_lib/zauth.js', () => ({ instrument: () => {}, drain: async () => {} }));
vi.mock('../../api/_lib/sentry.js', () => ({ captureException: () => {} }));
vi.mock('../../api/_lib/demo-avatars.js', () => ({
	DEMO_AVATARS: [
		{ avatarId: 'avatar_demo_alice', name: 'Alice', description: 'A demo', tags: ['demo'] },
	],
}));

const { default: handler, __testInternals } = await import('../../api/avatar-og.js');

// ── Helpers ────────────────────────────────────────────────────────────────

function mkReq({ url = '/api/avatar/avatar_demo_alice/og', method = 'GET', headers = {} } = {}) {
	return { url, method, headers: { host: 'three.ws', ...headers } };
}

function mkRes() {
	return {
		statusCode: 200,
		_h: {},
		_body: undefined,
		writableEnded: false,
		setHeader(k, v) { this._h[k.toLowerCase()] = v; },
		getHeader(k) { return this._h[k.toLowerCase()]; },
		end(b) { this._body = b; this.writableEnded = true; },
	};
}

beforeEach(() => {
	sqlMock.mockReset();
	sqlMock.mockResolvedValue([]);
	getAvatarMock.mockReset();
	renderGlbToPngMock.mockReset();
	putObjectMock.mockReset();
	putObjectMock.mockResolvedValue(undefined);
	publicUrlMock.mockReset();
	publicUrlMock.mockImplementation((k) => `https://cdn.test/${k}`);
	__testInternals._renderLocks.clear();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/avatar/:id/og — demo + 404 paths', () => {
	it('returns SVG card for known demo avatar', async () => {
		const req = mkReq({ url: '/api/avatar/avatar_demo_alice/og' });
		const res = mkRes();
		await handler(req, res);
		expect(res.statusCode).toBe(200);
		expect(res._h['content-type']).toMatch(/image\/svg/);
		expect(String(res._body)).toContain('Alice');
	});

	it('returns SVG 404 for unknown demo id', async () => {
		const req = mkReq({ url: '/api/avatar/avatar_demo_nope/og' });
		const res = mkRes();
		await handler(req, res);
		expect(res.statusCode).toBe(404);
		expect(res._h['content-type']).toMatch(/image\/svg/);
	});

	it('returns SVG 404 when DB lookup misses', async () => {
		getAvatarMock.mockResolvedValueOnce(null);
		const req = mkReq({ url: '/api/avatar/00000000-0000-0000-0000-000000000000/og' });
		const res = mkRes();
		await handler(req, res);
		expect(res.statusCode).toBe(404);
		expect(getAvatarMock).toHaveBeenCalledWith({ id: '00000000-0000-0000-0000-000000000000' });
	});

	it('returns SVG card for private avatars (no model_url)', async () => {
		getAvatarMock.mockResolvedValueOnce({
			id: 'a1',
			name: 'Private One',
			description: 'shh',
			thumbnail_url: null,
			model_url: null,
			storage_key: 'u/uid/x/abc.glb',
			tags: [],
		});
		const req = mkReq({ url: '/api/avatar/a1/og' });
		const res = mkRes();
		await handler(req, res);
		expect(res.statusCode).toBe(200);
		expect(res._h['content-type']).toMatch(/image\/svg/);
		expect(String(res._body)).toContain('Private One');
		expect(renderGlbToPngMock).not.toHaveBeenCalled();
	});
});

describe('GET /api/avatar/:id/og — cached thumbnail path', () => {
	it('302-redirects to thumbnail_url when set', async () => {
		getAvatarMock.mockResolvedValueOnce({
			id: 'a2',
			name: 'X',
			thumbnail_url: 'https://cdn.test/u/uid/x/abc_thumb.jpg',
			model_url: 'https://cdn.test/u/uid/x/abc.glb',
			storage_key: 'u/uid/x/abc.glb',
		});
		const req = mkReq({ url: '/api/avatar/a2/og' });
		const res = mkRes();
		await handler(req, res);
		expect(res.statusCode).toBe(302);
		expect(res._h.location).toBe('https://cdn.test/u/uid/x/abc_thumb.jpg');
		expect(renderGlbToPngMock).not.toHaveBeenCalled();
		expect(putObjectMock).not.toHaveBeenCalled();
	});
});

describe('GET /api/avatar/:id/og — server render path', () => {
	const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

	beforeEach(() => {
		// Stub the GLB HEAD request — content-length under the 10 MB cap.
		globalThis.fetch = vi.fn(async () => ({
			ok: true,
			headers: { get: (h) => (h.toLowerCase() === 'content-length' ? '1024' : null) },
		}));
	});

	it('renders, uploads to R2, updates DB, streams PNG', async () => {
		getAvatarMock.mockResolvedValueOnce({
			id: 'a3',
			name: 'Bob',
			thumbnail_url: null,
			model_url: 'https://cdn.test/u/uid/bob/123.glb',
			storage_key: 'u/uid/bob/123.glb',
			tags: [],
		});
		renderGlbToPngMock.mockResolvedValueOnce(PNG_MAGIC);

		const req = mkReq({ url: '/api/avatar/a3/og' });
		const res = mkRes();
		await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(res._h['content-type']).toBe('image/png');
		expect(res._h['cache-control']).toMatch(/max-age/);
		expect(res._body).toEqual(PNG_MAGIC);

		// Renderer called with the avatar's GLB URL.
		expect(renderGlbToPngMock).toHaveBeenCalledTimes(1);
		expect(renderGlbToPngMock.mock.calls[0][0].glbUrl).toBe(
			'https://cdn.test/u/uid/bob/123.glb',
		);

		// R2 write: sibling key with _og.png suffix.
		expect(putObjectMock).toHaveBeenCalledTimes(1);
		expect(putObjectMock.mock.calls[0][0].key).toBe('u/uid/bob/123_og.png');
		expect(putObjectMock.mock.calls[0][0].contentType).toBe('image/png');
		expect(putObjectMock.mock.calls[0][0].body).toEqual(PNG_MAGIC);

		// DB write: update statement was issued.
		expect(sqlMock).toHaveBeenCalledTimes(1);
		const sqlArgs = sqlMock.mock.calls[0];
		expect(sqlArgs[0].join('?')).toMatch(/update avatars set thumbnail_key/);
		expect(sqlArgs).toContain('u/uid/bob/123_og.png');
		expect(sqlArgs).toContain('a3');
	});

	it('falls back to the named card on GLB-too-large precheck', async () => {
		// 50 MB content-length triggers the 12 MB cap.
		globalThis.fetch = vi.fn(async () => ({
			ok: true,
			headers: { get: (h) => (h.toLowerCase() === 'content-length' ? String(50 * 1024 * 1024) : null) },
		}));
		getAvatarMock.mockResolvedValueOnce({
			id: 'a4',
			name: 'Big',
			thumbnail_url: null,
			model_url: 'https://cdn.test/u/uid/big/123.glb',
			storage_key: 'u/uid/big/123.glb',
		});

		const req = mkReq({ url: '/api/avatar/a4/og' });
		const res = mkRes();
		await handler(req, res);

		// A branded card naming the avatar beats the anonymous site logo for crawlers.
		expect(res.statusCode).toBe(200);
		expect(res._h['content-type']).toMatch(/image\/svg/);
		expect(String(res._body)).toContain('Big');
		expect(renderGlbToPngMock).not.toHaveBeenCalled();
		expect(putObjectMock).not.toHaveBeenCalled();
	});

	it('falls back to the named card when the renderer throws', async () => {
		getAvatarMock.mockResolvedValueOnce({
			id: 'a5',
			name: 'Err',
			thumbnail_url: null,
			model_url: 'https://cdn.test/u/uid/err/123.glb',
			storage_key: 'u/uid/err/123.glb',
		});
		renderGlbToPngMock.mockRejectedValueOnce(new Error('chromium crashed'));

		const req = mkReq({ url: '/api/avatar/a5/og' });
		const res = mkRes();
		await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(res._h['content-type']).toMatch(/image\/svg/);
		expect(String(res._body)).toContain('Err');
		expect(putObjectMock).not.toHaveBeenCalled();
		expect(sqlMock).not.toHaveBeenCalled();
	});

	it('serializes concurrent renders for the same avatar id', async () => {
		const avatar = {
			id: 'a6',
			name: 'Once',
			thumbnail_url: null,
			model_url: 'https://cdn.test/u/uid/once/123.glb',
			storage_key: 'u/uid/once/123.glb',
		};
		getAvatarMock.mockResolvedValue(avatar);

		// Block the render until both requests have started.
		let resolveRender;
		renderGlbToPngMock.mockImplementation(
			() => new Promise((resolve) => { resolveRender = resolve; }),
		);

		const req1 = mkReq({ url: '/api/avatar/a6/og' });
		const req2 = mkReq({ url: '/api/avatar/a6/og' });
		const res1 = mkRes();
		const res2 = mkRes();
		const p1 = handler(req1, res1);
		const p2 = handler(req2, res2);
		// Give microtasks a chance to hit the lock check.
		await new Promise((r) => setImmediate(r));
		resolveRender(PNG_MAGIC);
		await Promise.all([p1, p2]);

		// Renderer invoked once despite two concurrent requests.
		expect(renderGlbToPngMock).toHaveBeenCalledTimes(1);
		expect(putObjectMock).toHaveBeenCalledTimes(1);
		expect(sqlMock).toHaveBeenCalledTimes(1);
		// Both responses got the PNG.
		expect(res1._body).toEqual(PNG_MAGIC);
		expect(res2._body).toEqual(PNG_MAGIC);
		expect(res1.statusCode).toBe(200);
		expect(res2.statusCode).toBe(200);
	});

	it('serves the self-contained card on render failure, never an attacker-controllable redirect', async () => {
		// The fallback used to 302 to a logo URL built from request host headers,
		// which a spoofed `x-forwarded-host` could repoint at an attacker site. The
		// failure path now renders a self-contained SVG card inline — no Location
		// header, so the header can't influence where a crawler is sent.
		getAvatarMock.mockResolvedValueOnce({
			id: 'a7',
			name: 'X',
			thumbnail_url: null,
			model_url: 'https://cdn.test/u/uid/x/x.glb',
			storage_key: 'u/uid/x/x.glb',
		});
		renderGlbToPngMock.mockRejectedValueOnce(new Error('boom'));
		const req = mkReq({
			url: '/api/avatar/a7/og',
			headers: {
				host: 'three.ws',
				'x-forwarded-host': 'staging.three.ws',
				'x-forwarded-proto': 'https',
			},
		});
		const res = mkRes();
		await handler(req, res);
		expect(res.statusCode).toBe(200);
		expect(res._h['content-type']).toMatch(/image\/svg/);
		expect(res._h.location).toBeUndefined();
	});
});
