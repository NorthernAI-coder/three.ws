// Tests for the /api/avatars/:id/:action dispatcher's GLB proxy resolution.
//
// Two behaviours are covered, both offline via the demo-avatar fixture (the
// demo branch 302-redirects without touching R2 or the DB):
//   1. A `.glb`-terminating action (`model.glb`, `<uuid>.glb`, …) resolves to
//      the same GLB proxy as the bare `glb` action — so glТF viewers / NFT
//      marketplaces that sniff the URL extension can load three.ws avatars.
//   2. The demo branch redirects to the fixture's `glbUrl` (regression guard:
//      it previously read a non-existent `demo.url` and 404'd every demo).
//
// DB, R2, auth, and the zauth SDK are mocked so the suite runs with no network.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/_lib/zauth.js', () => ({ instrument: () => false, drain: async () => {} }));
vi.mock('../../api/_lib/sentry.js', () => ({ captureException: () => {} }));
// Any DB/R2 access means the demo short-circuit was skipped — fail loudly.
vi.mock('../../api/_lib/db.js', () => ({
	sql: () => { throw new Error('DB should not be queried for a demo avatar'); },
}));
vi.mock('../../api/_lib/r2.js', () => ({
	r2: { send: () => { throw new Error('R2 should not be hit for a demo avatar'); } },
	publicUrl: (key) => `https://cdn.test/${key}`,
}));
// No credentials on any request → every auth path resolves anonymous.
vi.mock('../../api/_lib/auth.js', () => ({
	getSessionUser: async () => null,
	authenticateBearer: async () => null,
	extractBearer: () => null,
	hasScope: () => false,
}));

import handler from '../../api/avatars/[id]/[action].js';
import { DEMO_AVATARS } from '../../api/_lib/demo-avatars.js';

const DEMO = DEMO_AVATARS[0]; // avatar_demo_disk_cz → https://three.ws/avatars/cz.glb

function makeReq({ id, action, method = 'GET' } = {}) {
	return {
		method,
		url: `/api/avatars/${id}/${action}`,
		headers: { host: 'three.ws' },
		query: { id, action },
	};
}

function makeRes() {
	return {
		statusCode: 200,
		_h: {},
		headersSent: false,
		writableEnded: false,
		setHeader(k, v) { this._h[k.toLowerCase()] = v; },
		getHeader(k) { return this._h[k.toLowerCase()]; },
		end() { this.writableEnded = true; this.headersSent = true; },
	};
}

async function invoke(opts) {
	const req = makeReq(opts);
	const res = makeRes();
	await handler(req, res);
	return res;
}

describe('GET /api/avatars/:id/:action — GLB proxy resolution', () => {
	it('redirects the bare `glb` action to the demo fixture glbUrl', async () => {
		const res = await invoke({ id: DEMO.avatarId, action: 'glb' });
		expect(res.statusCode).toBe(302);
		expect(res.getHeader('location')).toBe(DEMO.glbUrl);
	});

	it('resolves a `model.glb` action to the same GLB proxy', async () => {
		const res = await invoke({ id: DEMO.avatarId, action: 'model.glb' });
		expect(res.statusCode).toBe(302);
		expect(res.getHeader('location')).toBe(DEMO.glbUrl);
	});

	it('resolves a `<uuid>.glb` action (case-insensitive suffix) to the GLB proxy', async () => {
		const res = await invoke({ id: DEMO.avatarId, action: `${DEMO.avatarId}.GLB` });
		expect(res.statusCode).toBe(302);
		expect(res.getHeader('location')).toBe(DEMO.glbUrl);
	});

	it('serves wildcard CORS so third-party hosts can fetch the bytes', async () => {
		const res = await invoke({ id: DEMO.avatarId, action: 'model.glb' });
		expect(res.getHeader('access-control-allow-origin')).toBe('*');
	});

	it('does not treat `glb-versions` as the glb proxy', async () => {
		// glb-versions requires auth; with no session/bearer it must 401, proving
		// the `.glb` normalization did not swallow it into the glb handler (which
		// would have 302'd the demo instead).
		const res = await invoke({ id: DEMO.avatarId, action: 'glb-versions' });
		expect(res.statusCode).toBe(401);
	});

	it('404s an unknown action', async () => {
		const res = await invoke({ id: DEMO.avatarId, action: 'not-a-real-action' });
		expect(res.statusCode).toBe(404);
	});
});
