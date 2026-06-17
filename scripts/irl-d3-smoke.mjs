// Smoke test for D3 — IRL interaction broadcast, owner live-delivery layer.
//
//   node scripts/irl-d3-smoke.mjs
//
// Exercises the SSE owner-stream endpoint (api/irl/interactions-stream.js) with a
// mock req/res — no live DB needed — plus unit checks on the two security-critical
// pure functions that decide what leaves the server:
//   • publicRow()  — the privacy filter: the actor's identity (viewer_user_id /
//                    viewer_device) and any non-receipt payload must NEVER reach
//                    the owner. (Acceptance: "No raw GPS or wallet address of A
//                    reaches the owner or other viewers.")
//   • matches()    — owner isolation: an interaction is only ever delivered to the
//                    pin's actual owner, by session id OR device token.
//
// Assertions throw on failure; a clean run prints "D3 SMOKE: PASS".

// Force the no-DB path so the stream test is deterministic regardless of env.
delete process.env.DATABASE_URL;

import handler, { publicRow, matches } from '../api/irl/interactions-stream.js';

let failures = 0;
function check(name, cond) {
	if (cond) { console.log(`  ✓ ${name}`); }
	else { console.error(`  ✗ ${name}`); failures++; }
}

// ── Minimal mock req/res ─────────────────────────────────────────────────────
function mockReq({ method = 'GET', query = {}, headers = {} } = {}) {
	const listeners = {};
	return {
		method,
		query,
		headers,
		url: '/api/irl/interactions-stream',
		on(ev, cb) { (listeners[ev] ||= []).push(cb); return this; },
		emit(ev, ...a) { (listeners[ev] || []).forEach((cb) => cb(...a)); },
	};
}
function mockRes() {
	return {
		statusCode: 200,
		headers: {},
		body: '',
		writableEnded: false,
		_h: {},
		setHeader(k, v) { this._h[String(k).toLowerCase()] = v; },
		getHeader(k) { return this._h[String(k).toLowerCase()]; },
		writeHead(status, headers = {}) {
			this.statusCode = status;
			for (const [k, v] of Object.entries(headers)) this._h[String(k).toLowerCase()] = v;
			return this;
		},
		write(chunk) { if (!this.writableEnded) this.body += chunk; return true; },
		end(chunk) { if (chunk) this.body += chunk; this.writableEnded = true; return this; },
		on() { return this; },
	};
}

console.log('1) publicRow() — privacy filter');
{
	const row = {
		id: 'ix1', pin_id: 'pin1', agent_id: 'ag1', type: 'pay',
		message: null, amount: 50000, currency_mint: 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump',
		avatar_name: 'Greeter', caption: 'say hi', lat: 37.76, lng: -122.42,
		created_at: '2026-06-17T00:00:00Z',
		// Hostile/extra fields that must NOT survive the filter:
		viewer_user_id: 'actor-user-uuid', viewer_device: 'actor-device-token',
		owner_id: 'owner-uuid', owner_dev: null,
		payload: { signature: '0x' + 'a'.repeat(64), network: 'base', actorWallet: '0xdeadbeef', secret: 'leak' },
	};
	const safe = publicRow(row);
	check('drops viewer_user_id', !('viewer_user_id' in safe));
	check('drops viewer_device', !('viewer_device' in safe));
	check('drops owner_id/owner_dev', !('owner_id' in safe) && !('owner_dev' in safe));
	check('keeps the receipt signature', safe.payload.signature === row.payload.signature);
	check('keeps the receipt network', safe.payload.network === 'base');
	check('strips actorWallet from payload', !('actorWallet' in safe.payload));
	check('strips arbitrary payload keys', !('secret' in safe.payload));
	check('keeps owner-safe fields (amount, mint, avatar_name)',
		safe.amount === 50000 && safe.currency_mint === row.currency_mint && safe.avatar_name === 'Greeter');

	// A non-pay event must carry an EMPTY payload (no signature surface at all).
	const viewSafe = publicRow({ ...row, type: 'view', payload: { signature: 'x', anything: 1 } });
	check('view/tap payload is emptied (no signature surface)', Object.keys(viewSafe.payload).length === 0);
}

console.log('2) matches() — owner isolation');
{
	const row = { owner_id: 'owner-A', owner_dev: null };
	check('matches the owning session', matches({ ownerId: 'owner-A', ownerDev: null }, row) === true);
	check('rejects a different session', !matches({ ownerId: 'owner-B', ownerDev: null }, row));
	const anonRow = { owner_id: null, owner_dev: 'dev-token-1' };
	check('matches the owning device token', matches({ ownerId: null, ownerDev: 'dev-token-1' }, anonRow) === true);
	check('rejects a different device token', !matches({ ownerId: null, ownerDev: 'dev-token-2' }, anonRow));
	check('a null owner identity never matches a null row owner',
		!matches({ ownerId: null, ownerDev: null }, { owner_id: null, owner_dev: null }));
}

console.log('3) handler — OPTIONS preflight');
{
	const req = mockReq({ method: 'OPTIONS' });
	const res = mockRes();
	await handler(req, res);
	check('preflight is handled (response ended)', res.writableEnded === true);
}

console.log('4) handler — unauthenticated GET is rejected');
{
	const req = mockReq({ method: 'GET', query: {} });
	const res = mockRes();
	await handler(req, res);
	check('401 when no session and no deviceToken', res.statusCode === 401);
	check('error body explains how to authenticate', /sign in or pass deviceToken/.test(res.body));
}

console.log('5) handler — authed GET opens an SSE stream, degrades to heartbeat with no DB');
{
	const req = mockReq({ method: 'GET', query: { deviceToken: 'dev-token-1' } });
	const res = mockRes();
	await handler(req, res);
	check('200 OK', res.statusCode === 200);
	check('content-type is text/event-stream', String(res._h['content-type']).includes('text/event-stream'));
	check('disables Vercel edge buffering (X-Accel-Buffering: no)', res._h['x-accel-buffering'] === 'no');
	check('emits an initial hello frame', /event: hello/.test(res.body));
	// Simulate the client disconnecting — must tear down cleanly, no throw.
	let threw = false;
	try { req.emit('close'); } catch { threw = true; }
	check('clean teardown on client close', threw === false);
}

if (failures) {
	console.error(`\nD3 SMOKE: FAIL (${failures} check${failures === 1 ? '' : 's'})`);
	process.exit(1);
}
console.log('\nD3 SMOKE: PASS');
