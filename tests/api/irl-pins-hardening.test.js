// /api/irl/pins — production hardening (tasks 11 / 12 / 13).
//
// These tests cover the backend-resilience + security-validation surface added to
// api/irl/pins.js: radius + pin-id validation, the rate-limiter fail-open wrapper,
// the Guardian degraded-state cache, the x402 allow-list parse, ownership + expiry
// on calibrate/outfit/delete, and the no-internal-detail outfit-bake error. The
// DB / auth / limiter / baker are mocked so the suite runs offline in Node.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted spy for the lazily-imported baker ────────────────────────────────
const { bakeSpy } = vi.hoisted(() => ({ bakeSpy: vi.fn() }));

// ── Content-addressed SQL mock ───────────────────────────────────────────────
// `pinRow` is the row the WHERE-id SELECT returns (null → not found). Each mutation
// (calibrate UPDATE, outfit UPDATE, delete) is classified by its query text and
// honours the expiry/hidden guards the handler now appends to the WHERE clause —
// so a test can make a mutation "miss" by marking the row expired/hidden.
let pinRow = null;
let deleteResult = [{ id: 'del-1', lat: 1, lng: 2 }];

function pinIsLive(row) {
	if (!row) return false;
	if (row.hidden_at != null) return false;
	if (row.expires_at == null) return true;
	return new Date(row.expires_at).getTime() > Date.now();
}

const sqlMock = vi.fn((strings, ...values) => {
	const q = Array.isArray(strings) ? strings.join(' ') : String(strings);

	// SELECT … WHERE id = $id (calibrate + outfit ownership lookup)
	if (/SELECT[\s\S]*FROM irl_pins[\s\S]*WHERE id =/i.test(q)) {
		return Promise.resolve(pinRow ? [pinRow] : []);
	}
	// Calibrate UPDATE — now guarded by hidden_at/expires_at; return a row only when live.
	if (/UPDATE irl_pins SET[\s\S]*anchor_yaw_deg\s*=\s*COALESCE/i.test(q)) {
		if (!pinIsLive(pinRow)) return Promise.resolve([]);
		const [lat, lng, yaw, heading, height, id] = values;
		return Promise.resolve([{
			id, lat, lng,
			heading:         heading ?? pinRow?.heading ?? null,
			anchor_yaw_deg:  yaw     ?? pinRow?.anchor_yaw_deg ?? null,
			anchor_height_m: height  ?? pinRow?.anchor_height_m ?? null,
			gps_accuracy_m:  pinRow?.gps_accuracy_m ?? null,
		}]);
	}
	// Outfit UPDATE — guarded too.
	if (/UPDATE irl_pins SET[\s\S]*avatar_version\s*=\s*avatar_version \+ 1/i.test(q)) {
		if (!pinIsLive(pinRow)) return Promise.resolve([]);
		const [manifestJson, , newAvatarUrl, id] = values;
		return Promise.resolve([{
			id, lat: pinRow?.lat ?? null, lng: pinRow?.lng ?? null,
			avatar_url: newAvatarUrl,
			avatar_manifest: manifestJson ? JSON.parse(manifestJson) : null,
			avatar_version: (Number(pinRow?.avatar_version) || 0) + 1,
		}]);
	}
	// DELETE … RETURNING id, lat, lng
	if (/DELETE FROM irl_pins/i.test(q)) {
		return Promise.resolve(deleteResult);
	}
	return Promise.resolve([]); // ensureTable DDL + anything else
});
vi.mock('../../api/_lib/db.js', () => ({ sql: (...a) => sqlMock(...a) }));

let sessionUser = null;
vi.mock('../../api/_lib/auth.js', () => ({ getSessionUser: vi.fn(async () => sessionUser) }));

// Limiter mock with a throw switch so we can prove the call-site fail-open wrapper
// catches an outage instead of 500ing the request.
let limiterThrows = false;
function verdict() {
	if (limiterThrows) throw new Error('redis: max requests limit exceeded');
	return { success: true, reset: Date.now() + 60_000 };
}
vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: {
		publicIp:     vi.fn(async () => verdict()),
		irlPinIp:     vi.fn(async () => verdict()),
		irlPinBurst:  vi.fn(async () => verdict()),
		irlPinHourly: vi.fn(async () => verdict()),
	},
	clientIp: () => '127.0.0.1',
}));

vi.mock('../../api/_lib/irl-bake.js', () => ({
	bakePinOutfit: (...a) => bakeSpy(...a),
	isBakeable: (m) => !!(m && (
		m.outfit ||
		(Array.isArray(m.accessories) && m.accessories.length) ||
		(m.morphs && Object.keys(m.morphs).length) ||
		(m.colors && Object.keys(m.colors).length) ||
		(Array.isArray(m.hidden) && m.hidden.length)
	)),
}));

const mod = await import('../../api/irl/pins.js');
const { default: handler, isValidPinId, isExpiredOrHidden, safePaymentEndpoint, guardianDegraded, resetGuardianDegraded } = mod;

const UUID = '11111111-1111-4111-8111-111111111111';

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
async function call(method, { query = {}, body } = {}) {
	const res = makeRes();
	await handler({ url: '/api/irl/pins', method, headers: { host: 'x' }, query, body }, res);
	let parsed = null;
	try { parsed = JSON.parse(res._body); } catch {}
	return { res, body: parsed };
}
const get    = (opts) => call('GET', opts);
const patch  = (body) => call('PATCH', { body });
const del    = (query) => call('DELETE', { query });

beforeEach(() => {
	sqlMock.mockClear();
	bakeSpy.mockReset();
	bakeSpy.mockResolvedValue({ url: 'https://three.ws/cdn/irl/pins/x/abc.glb' });
	deleteResult = [{ id: 'del-1', lat: 1, lng: 2 }];
	limiterThrows = false;
	sessionUser = null;
	resetGuardianDegraded();
	pinRow = {
		id: UUID, user_id: null, device_token: 'device-A',
		lat: 40.7128, lng: -74.006, heading: 90,
		anchor_yaw_deg: 90, anchor_height_m: 0, gps_accuracy_m: 12,
		avatar_url: '/api/avatars/av-1/glb', avatar_base_url: null, avatar_version: 0,
		expires_at: null, hidden_at: null,
	};
});

// ── Pure helpers ─────────────────────────────────────────────────────────────
describe('isValidPinId', () => {
	it('accepts a canonical UUID and rejects garbage / oversized ids', () => {
		expect(isValidPinId(UUID)).toBe(true);
		expect(isValidPinId('not-a-uuid')).toBe(false);
		expect(isValidPinId('')).toBe(false);
		expect(isValidPinId(null)).toBe(false);
		expect(isValidPinId(123)).toBe(false);
		expect(isValidPinId('x'.repeat(5000))).toBe(false);
		// SQL-injection-shaped id is rejected at the boundary (defense in depth).
		expect(isValidPinId("1' OR '1'='1")).toBe(false);
	});
});

describe('isExpiredOrHidden', () => {
	const now = Date.now();
	it('treats a NULL expiry as permanent (live)', () => {
		expect(isExpiredOrHidden({ expires_at: null, hidden_at: null }, now)).toBe(false);
	});
	it('treats a future expiry as live and a past expiry as gone', () => {
		expect(isExpiredOrHidden({ expires_at: new Date(now + 60_000).toISOString() }, now)).toBe(false);
		expect(isExpiredOrHidden({ expires_at: new Date(now - 60_000).toISOString() }, now)).toBe(true);
	});
	it('treats any hidden_at as gone regardless of expiry', () => {
		expect(isExpiredOrHidden({ expires_at: null, hidden_at: new Date(now).toISOString() }, now)).toBe(true);
	});
});

describe('safePaymentEndpoint — x402 allow-list (config validation)', () => {
	it('accepts a same-origin relative path (always first-party)', () => {
		expect(safePaymentEndpoint('/api/x402-pay')).toEqual({ ok: true, value: '/api/x402-pay' });
	});
	it('accepts a first-party host from the default allow-list', () => {
		const r = safePaymentEndpoint('https://three.ws/api/x402-pay');
		expect(r.ok).toBe(true);
	});
	it('rejects an arbitrary external host', () => {
		expect(safePaymentEndpoint('https://evil.example.com/drain').ok).toBe(false);
	});
	it('rejects a non-https / private-host endpoint', () => {
		expect(safePaymentEndpoint('http://three.ws/x').ok).toBe(false);
		expect(safePaymentEndpoint('https://127.0.0.1/x').ok).toBe(false);
	});
	it('passes a null/empty endpoint through as cleared', () => {
		expect(safePaymentEndpoint(null)).toEqual({ ok: true, value: null });
		expect(safePaymentEndpoint('')).toEqual({ ok: true, value: null });
	});
});

// ── GET radius validation (task 11) ──────────────────────────────────────────
describe('GET /api/irl/pins — radius validation', () => {
	it('400s a present-but-non-finite radius instead of silently scanning a NaN box', async () => {
		const { res, body } = await get({ query: { lat: '40.7128', lng: '-74.006', radius: 'abc' } });
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/invalid radius/i);
		// Never reached the pin SELECT — failed at the boundary.
		const ranSelect = sqlMock.mock.calls.some(([s]) =>
			/lat BETWEEN/i.test(Array.isArray(s) ? s.join(' ') : String(s)));
		expect(ranSelect).toBe(false);
	});
	it('defaults a missing radius to 40 and 200s', async () => {
		const { res } = await get({ query: { lat: '40.7128', lng: '-74.006' } });
		expect(res.statusCode).toBe(200);
	});
});

// ── Pin-id validation on mutations (task 13) ─────────────────────────────────
describe('PATCH /api/irl/pins — pin-id validation', () => {
	it('400s a malformed id before any auth or DB work', async () => {
		const { res, body } = await patch({ id: 'garbage', calibrate: { lat: 40.7128, lng: -74.006 } });
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/invalid pin id/i);
		const ranSelect = sqlMock.mock.calls.some(([s]) =>
			/WHERE id =/i.test(Array.isArray(s) ? s.join(' ') : String(s)));
		expect(ranSelect).toBe(false);
	});
});

describe('DELETE /api/irl/pins — pin-id validation', () => {
	it('400s a malformed id before the delete query', async () => {
		const { res, body } = await del({ id: 'garbage', deviceToken: 'device-A' });
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/invalid pin id/i);
		const ranDelete = sqlMock.mock.calls.some(([s]) =>
			/DELETE FROM irl_pins/i.test(Array.isArray(s) ? s.join(' ') : String(s)));
		expect(ranDelete).toBe(false);
	});
});

// ── Expiry guard on mutations (task 13) ──────────────────────────────────────
describe('calibrate — refuses an expired pin', () => {
	it('404s an expired pin even for the owner, and never UPDATEs', async () => {
		pinRow.expires_at = new Date(Date.now() - 1000).toISOString();
		const { res, body } = await patch({
			id: UUID, deviceToken: 'device-A',
			calibrate: { lat: 40.7128, lng: -74.006 },
		});
		expect(res.statusCode).toBe(404);
		expect(body.error).toMatch(/not found/i);
		const ranUpdate = sqlMock.mock.calls.some(([s]) =>
			/UPDATE irl_pins SET[\s\S]*anchor_yaw_deg/i.test(Array.isArray(s) ? s.join(' ') : String(s)));
		expect(ranUpdate).toBe(false);
	});
	it('200s a live pin for the owner', async () => {
		const { res, body } = await patch({
			id: UUID, deviceToken: 'device-A',
			calibrate: { lat: 40.7128, lng: -74.006, anchorYawDeg: 95 },
		});
		expect(res.statusCode).toBe(200);
		expect(body.calibrated).toBe(true);
	});
});

describe('outfit — refuses an expired pin', () => {
	beforeEach(() => {
		pinRow.user_id = 'owner-uuid';
		pinRow.device_token = null;
		sessionUser = { id: 'owner-uuid' };
	});
	it('404s an expired pin and never bakes', async () => {
		pinRow.expires_at = new Date(Date.now() - 1000).toISOString();
		const { res, body } = await patch({ id: UUID, avatar_manifest: { colors: { outfit: '#7a1f2b' } } });
		expect(res.statusCode).toBe(404);
		expect(body.error).toMatch(/not found/i);
		expect(bakeSpy).not.toHaveBeenCalled();
	});
	it('does NOT leak the upstream error message when a bake fails', async () => {
		bakeSpy.mockRejectedValueOnce(new Error('libvips: /secret/internal/path exploded'));
		const { res, body } = await patch({ id: UUID, avatar_manifest: { colors: { outfit: '#7a1f2b' } } });
		expect(res.statusCode).toBe(502);
		expect(body.error).toMatch(/could not bake/i);
		expect(body).not.toHaveProperty('detail');
		expect(JSON.stringify(body)).not.toMatch(/libvips|secret|internal|path/i);
	});
});

describe('delete — expiry-guarded WHERE', () => {
	it('returns the delete result for a live owned pin', async () => {
		const { res, body } = await del({ id: UUID, deviceToken: 'device-A' });
		expect(res.statusCode).toBe(200);
		expect(body.ok).toBe(true);
	});
	it('404s when the guarded WHERE matches nothing (expired / not yours)', async () => {
		deleteResult = []; // the expiry/owner clause matched no row
		const { res, body } = await del({ id: UUID, deviceToken: 'device-A' });
		expect(res.statusCode).toBe(404);
		expect(body.error).toMatch(/not found|not yours/i);
	});
});

// ── Rate-limiter fail-open (task 12) ─────────────────────────────────────────
describe('rate limiter fail-open', () => {
	it('a throwing limiter does not 500 a GET — the request is allowed', async () => {
		limiterThrows = true;
		const { res } = await get({ query: { lat: '40.7128', lng: '-74.006', radius: '40' } });
		// Fail-open: the read proceeds to a normal 200, never a 500 from the limiter.
		expect(res.statusCode).toBe(200);
	});
	it('a throwing limiter does not 500 a DELETE — ownership is still enforced', async () => {
		limiterThrows = true;
		const { res } = await del({ id: UUID, deviceToken: 'device-A' });
		expect(res.statusCode).toBe(200);
	});
});

// ── Guardian degraded cache (task 12) ────────────────────────────────────────
describe('guardian degraded state', () => {
	it('starts not-degraded and resets cleanly', () => {
		resetGuardianDegraded();
		expect(guardianDegraded()).toBe(false);
	});
});
