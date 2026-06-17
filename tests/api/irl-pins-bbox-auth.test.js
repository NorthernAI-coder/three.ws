// GET /api/irl/pins — location-scrape guards.
//
// Two protections, proven here:
//   1. The bbox window feed (which returns many pins over a multi-km box) is
//      INTERNAL-ONLY. It hydrates the Colyseus irl_world room server-to-server and
//      must reject any caller that doesn't present the shared multiplayer secret —
//      otherwise it's a one-call bulk download of every placement's exact GPS.
//   2. The public nearby feed is IP rate-limited, so the precise-coordinate feed
//      can't be systematically gridded into a global location scrape.
// DB / auth / limiter are mocked so the suite stays offline.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const PIN = {
	id: 'pin-1', user_id: 'owner-1', device_token: 'dev-1', agent_id: null,
	lat: 40.7128, lng: -74.006, heading: 0,
	avatar_url: null, avatar_name: 'Aria', caption: 'hi', x402_endpoint: null,
	placed_at: '2026-01-01T00:00:00Z', view_count: 0,
	anchor_height_m: null, anchor_yaw_deg: null, anchor_quat: null,
	gps_accuracy_m: null, altitude_m: null, anchor_source: null, avatar_version: 0,
};

// Any pin SELECT (nearby or bbox) carries `FROM irl_pins` + `lat BETWEEN`; return
// one in-range pin for those and [] for everything else (ensureTable DDL).
const sqlMock = vi.fn((strings) => {
	const q = Array.isArray(strings) ? strings.join(' ') : String(strings);
	if (/FROM\s+irl_pins/i.test(q) && /lat BETWEEN/i.test(q)) return Promise.resolve([PIN]);
	return Promise.resolve([]);
});
vi.mock('../../api/_lib/db.js', () => ({ sql: (...a) => sqlMock(...a) }));

vi.mock('../../api/_lib/auth.js', () => ({ getSessionUser: vi.fn(async () => null) }));

let publicVerdict = { success: true, reset: Date.now() + 60_000 };
vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: { publicIp: vi.fn(async () => publicVerdict) },
	clientIp: () => '127.0.0.1',
}));

const SECRET = 'test-mp-secret';
const { default: handler } = await import('../../api/irl/pins.js');

function makeRes() {
	return {
		statusCode: 200,
		_h: {},
		headersSent: false,
		writableEnded: false,
		setHeader(k, v) { this._h[k.toLowerCase()] = v; },
		getHeader(k) { return this._h[k.toLowerCase()]; },
		end(body) { this.writableEnded = true; this._body = body; },
	};
}
async function get({ query = {}, headers = {} } = {}) {
	const res = makeRes();
	await handler({ url: '/api/irl/pins', method: 'GET', headers: { host: 'x', ...headers }, query }, res);
	let parsed = null;
	try { parsed = JSON.parse(res._body); } catch {}
	return { res, body: parsed };
}
function ranPinSelect() {
	return sqlMock.mock.calls.some(([s]) => {
		const q = Array.isArray(s) ? s.join(' ') : String(s);
		return /FROM\s+irl_pins/i.test(q) && /lat BETWEEN/i.test(q);
	});
}

beforeEach(() => {
	sqlMock.mockClear();
	publicVerdict = { success: true, reset: Date.now() + 60_000 };
	process.env.MULTIPLAYER_SHARED_SECRET = SECRET;
});

describe('GET /api/irl/pins?bbox — internal-only', () => {
	it('403s a bbox request with no internal header and never queries pins', async () => {
		const { res } = await get({ query: { bbox: '40.70,-74.02,40.73,-73.99' } });
		expect(res.statusCode).toBe(403);
		expect(ranPinSelect()).toBe(false);
	});

	it('403s a bbox request with a wrong internal secret', async () => {
		const { res } = await get({
			query: { bbox: '40.70,-74.02,40.73,-73.99' },
			headers: { 'x-mp-internal': 'not-the-secret' },
		});
		expect(res.statusCode).toBe(403);
		expect(ranPinSelect()).toBe(false);
	});

	it('200s with the window pins when the correct secret is presented', async () => {
		const { res, body } = await get({
			query: { bbox: '40.70,-74.02,40.73,-73.99' },
			headers: { 'x-mp-internal': SECRET },
		});
		expect(res.statusCode).toBe(200);
		expect(Array.isArray(body.pins)).toBe(true);
		expect(body.pins[0].id).toBe('pin-1');
		expect(ranPinSelect()).toBe(true);
	});

	it('400s a bbox larger than the ~0.2° ceiling even with the secret', async () => {
		const { res, body } = await get({
			query: { bbox: '40.0,-75.0,41.0,-74.0' }, // 1° box
			headers: { 'x-mp-internal': SECRET },
		});
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/too large/);
		expect(ranPinSelect()).toBe(false);
	});

	it('does not rate-limit the internal hydration path', async () => {
		const { limits } = await import('../../api/_lib/rate-limit.js');
		limits.publicIp.mockClear();
		await get({ query: { bbox: '40.70,-74.02,40.73,-73.99' }, headers: { 'x-mp-internal': SECRET } });
		expect(limits.publicIp).not.toHaveBeenCalled();
	});
});

describe('GET /api/irl/pins — public nearby feed is rate-limited', () => {
	it('200s a normal nearby query and consults the public limiter', async () => {
		const { limits } = await import('../../api/_lib/rate-limit.js');
		limits.publicIp.mockClear();
		const { res, body } = await get({ query: { lat: '40.7128', lng: '-74.006', radius: '150' } });
		expect(res.statusCode).toBe(200);
		expect(body.pins[0].id).toBe('pin-1');
		// Owner identifiers are never projected into the public feed.
		expect(body.pins[0]).not.toHaveProperty('user_id');
		expect(body.pins[0]).not.toHaveProperty('device_token');
		expect(limits.publicIp).toHaveBeenCalledTimes(1);
	});

	it('429s the nearby feed when the public limiter is exhausted, before any DB read', async () => {
		publicVerdict = { success: false, reset: Date.now() + 30_000 };
		const { res } = await get({ query: { lat: '40.7128', lng: '-74.006', radius: '150' } });
		expect(res.statusCode).toBe(429);
		expect(ranPinSelect()).toBe(false);
	});
});
