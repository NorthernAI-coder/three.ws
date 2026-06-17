// PATCH /api/irl/pins { avatar_manifest } — C6 remote outfit change.
//
// Changing a placed agent's outfit re-skins it for EVERY nearby viewer, so the
// server is the security + correctness boundary: it must reject non-owners,
// reject invented slots/presets before baking, bake onto the pin's clean BASE
// (never the prior bake), bump avatar_version, and emit the realtime hook. These
// tests prove that boundary with the DB / auth / baker / realtime mocked so the
// suite stays offline (the bake core itself is covered by avatar-bake.test.js).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted spies so the vi.mock factories (which hoist above imports) can close
// over them. bakeSpy stands in for the real GLB bake+upload; emitSpy for the D1
// fan-out hook.
const { bakeSpy, emitSpy } = vi.hoisted(() => ({ bakeSpy: vi.fn(), emitSpy: vi.fn() }));

// Content-addressed SQL mock: ensureTable DDL → []; the WHERE-id SELECT returns
// the current pin (null → not found); the outfit UPDATE echoes the new look with
// a bumped version so success-path assertions see what every viewer will fetch.
let pinRow = null;
const sqlMock = vi.fn((strings, ...values) => {
	const q = Array.isArray(strings) ? strings.join(' ') : String(strings);
	if (/SELECT[\s\S]*FROM irl_pins[\s\S]*WHERE id =/i.test(q)) {
		return Promise.resolve(pinRow ? [pinRow] : []);
	}
	if (/UPDATE irl_pins SET[\s\S]*avatar_version\s*=\s*avatar_version \+ 1/i.test(q)) {
		// values: [manifestJson, baseUrl, newAvatarUrl, id, sessionId]
		const [manifestJson, , newAvatarUrl, id] = values;
		return Promise.resolve([{
			id,
			lat: pinRow?.lat ?? null,
			lng: pinRow?.lng ?? null,
			avatar_url: newAvatarUrl,
			avatar_manifest: manifestJson ? JSON.parse(manifestJson) : null,
			avatar_version: (Number(pinRow?.avatar_version) || 0) + 1,
		}]);
	}
	return Promise.resolve([]); // CREATE/ALTER/INDEX + anything else
});
vi.mock('../../api/_lib/db.js', () => ({ sql: (...a) => sqlMock(...a) }));

let sessionUser = null;
vi.mock('../../api/_lib/auth.js', () => ({
	getSessionUser: vi.fn(async () => sessionUser),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
	limits: { irlPinIp: vi.fn(async () => ({ success: true })) },
	clientIp: () => '127.0.0.1',
}));

// Baker stub — re-implements isBakeable with the real semantics (so the empty /
// cleared-manifest path is exercised honestly) and records bake calls.
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

vi.mock('../../api/_lib/irl-realtime.js', () => ({ emitPinUpdated: (...a) => emitSpy(...a) }));

const { default: handler } = await import('../../api/irl/pins.js');

const BAKED_URL = 'https://three.ws/cdn/irl/pins/pin-1/abc1234567890def.glb';

function makeReq(body) {
	return { url: '/api/irl/pins', method: 'PATCH', headers: { host: 'x' }, query: {}, body };
}
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
async function patch(body) {
	const res = makeRes();
	await handler(makeReq(body), res);
	let parsed = null;
	try { parsed = JSON.parse(res._body); } catch {}
	return { res, body: parsed };
}
function ranOutfitUpdate() {
	return sqlMock.mock.calls.some(([s]) =>
		/UPDATE irl_pins SET[\s\S]*avatar_version\s*=\s*avatar_version \+ 1/i.test(Array.isArray(s) ? s.join(' ') : String(s)));
}

beforeEach(() => {
	sqlMock.mockClear();
	bakeSpy.mockReset();
	bakeSpy.mockResolvedValue({ url: BAKED_URL });
	emitSpy.mockReset();
	pinRow = {
		id: 'pin-1',
		user_id: 'owner-uuid',
		avatar_url: '/api/avatars/av-1/glb',
		avatar_base_url: null,
		avatar_version: 0,
	};
	sessionUser = { id: 'owner-uuid' };
});

describe('PATCH /api/irl/pins outfit — auth + ownership gate', () => {
	it('401s an unauthenticated caller (auth gate precedes the handler)', async () => {
		sessionUser = null;
		const { res } = await patch({ id: 'pin-1', avatar_manifest: { colors: { outfit: '#7a1f2b' } } });
		expect(res.statusCode).toBe(401);
		expect(bakeSpy).not.toHaveBeenCalled();
	});

	it('404s when the pin no longer exists', async () => {
		pinRow = null;
		const { res, body } = await patch({ id: 'gone', avatar_manifest: { colors: { outfit: '#7a1f2b' } } });
		expect(res.statusCode).toBe(404);
		expect(body.error).toMatch(/not found/i);
	});

	it('403s a signed-in non-owner and never bakes or updates', async () => {
		sessionUser = { id: 'someone-else' };
		const { res, body } = await patch({ id: 'pin-1', avatar_manifest: { colors: { outfit: '#7a1f2b' } } });
		expect(res.statusCode).toBe(403);
		expect(body.error).toMatch(/only the owner/i);
		expect(bakeSpy).not.toHaveBeenCalled();
		expect(ranOutfitUpdate()).toBe(false);
	});
});

describe('PATCH /api/irl/pins outfit — manifest validation (before bake)', () => {
	it('400s a non-object manifest', async () => {
		const { res, body } = await patch({ id: 'pin-1', avatar_manifest: ['nope'] });
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/must be an object or null/i);
		expect(bakeSpy).not.toHaveBeenCalled();
	});

	it('400s an invented colour slot before any bake runs', async () => {
		const { res, body } = await patch({ id: 'pin-1', avatar_manifest: { colors: { cape: '#000000' } } });
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/unknown color slot/i);
		expect(bakeSpy).not.toHaveBeenCalled();
	});

	it('400s an invented accessory preset id', async () => {
		const { res, body } = await patch({ id: 'pin-1', avatar_manifest: { accessories: ['jetpack-9000'] } });
		expect(res.statusCode).toBe(400);
		expect(body.error).toMatch(/unknown preset id/i);
		expect(bakeSpy).not.toHaveBeenCalled();
	});
});

describe('PATCH /api/irl/pins outfit — owner re-skin persists for everyone', () => {
	it('bakes onto the captured base, bumps version, returns the new avatar_url, and emits the realtime hook', async () => {
		const manifest = { colors: { outfit: '#7a1f2b' }, hidden: ['glasses'] };
		const { res, body } = await patch({ id: 'pin-1', avatar_manifest: manifest });
		expect(res.statusCode).toBe(200);
		// Bake targets the pin's base GLB (avatar_base_url null → falls back to avatar_url).
		expect(bakeSpy).toHaveBeenCalledWith({ pinId: 'pin-1', baseUrl: '/api/avatars/av-1/glb', manifest });
		expect(body.pin.avatar_url).toBe(BAKED_URL);
		expect(body.pin.avatar_version).toBe(1);
		expect(body.pin.avatar_manifest).toEqual(manifest);
		// Realtime fan-out fired with the persisted row.
		expect(emitSpy).toHaveBeenCalledTimes(1);
		expect(emitSpy.mock.calls[0][0]).toMatchObject({ id: 'pin-1', avatar_url: BAKED_URL, avatar_version: 1 });
	});

	it('re-bakes from the stored base on a later edit (never stacks on the prior bake)', async () => {
		// Second edit: the pin already has a captured base + a previously baked url.
		pinRow.avatar_base_url = '/api/avatars/av-1/glb';
		pinRow.avatar_url = 'https://three.ws/cdn/irl/pins/pin-1/oldhash.glb';
		pinRow.avatar_version = 3;
		const manifest = { accessories: ['hat-baseball'] };
		const { res, body } = await patch({ id: 'pin-1', avatar_manifest: manifest });
		expect(res.statusCode).toBe(200);
		// Critically: baseUrl is the captured base, NOT the already-baked avatar_url.
		expect(bakeSpy).toHaveBeenCalledWith({ pinId: 'pin-1', baseUrl: '/api/avatars/av-1/glb', manifest });
		expect(body.pin.avatar_version).toBe(4);
	});

	it('reverts to the bare base for an empty/cleared manifest (no bake)', async () => {
		const { res, body } = await patch({ id: 'pin-1', avatar_manifest: {} });
		expect(res.statusCode).toBe(200);
		expect(bakeSpy).not.toHaveBeenCalled();        // nothing bakeable → skip the bake
		expect(body.pin.avatar_url).toBe('/api/avatars/av-1/glb'); // served base again
		expect(body.pin.avatar_version).toBe(1);       // still a versioned change
		expect(emitSpy).toHaveBeenCalledTimes(1);
	});

	it('502s and does not persist when the bake throws', async () => {
		bakeSpy.mockRejectedValueOnce(new Error('libvips exploded'));
		const { res, body } = await patch({ id: 'pin-1', avatar_manifest: { colors: { hair: '#0e0e0e' } } });
		expect(res.statusCode).toBe(502);
		expect(body.error).toMatch(/could not bake/i);
		expect(ranOutfitUpdate()).toBe(false);
		expect(emitSpy).not.toHaveBeenCalled();
	});
});
