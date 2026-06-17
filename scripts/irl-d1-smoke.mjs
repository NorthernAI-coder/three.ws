// Live round-trip smoke for D1 — IRL realtime pin sync.
//
//   node scripts/irl-d1-smoke.mjs
//
// Where irl-d3-smoke unit-tests the privacy filter, this one proves the actual
// liveness contract end-to-end: it boots the REAL multiplayer server (the same
// multiplayer/src/index.js prod runs, with the irl_world room + signed
// /internal/irl-publish webhook wired exactly as deployed), connects two
// colyseus.js clients to one geocell room, fires a signed publish, and asserts
// the change lands on the other client within the ~1 s liveness budget.
//
// It mechanises the spec's manual "two phones at the same spot" checklist:
//   1. A places a pin → it appears on B within ~1 s (schema delta).             [add]
//   2. A removes a pin → it disappears on B live.                               [remove]
//   3. A late joiner is handed the full current pin set on join (schema sync).  [late join]
//   4. A forged / tampered / stale publish is rejected (401) and never reaches  [auth]
//      the room — the channel can't be poisoned by an unsigned request.
//
// The server's pin hydration is pointed at a dead API base so onCreate loads an
// empty cell deterministically (it degrades gracefully on load failure), and the
// shared secret is fixed — so the run needs no DB, no env, and no network.
// Assertions throw on failure; a clean run prints "D1 SMOKE: PASS".

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { Client, getStateCallbacks } from 'colyseus.js';
import { IrlState } from '../multiplayer/src/irl-schemas.js';
import { encodeGeohash } from '../multiplayer/src/geohash.js';
import { hmacSha256, sha256Base64Url } from '../api/_lib/crypto.js';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = 2599;
const HOST = '127.0.0.1';
const BASE_HTTP = `http://${HOST}:${PORT}`;
const BASE_WS = `ws://${HOST}:${PORT}`;
const SECRET = 'd1-smoke-secret';
const LIVENESS_MS = 1500; // the spec's "~1 s" plus headroom for CI scheduling jitter

// A real coordinate (downtown SF) and the precision-6 cell it lands in — the
// client's room key and the publish's geocell must agree, so we derive both from
// the same encoder the app uses.
const LAT = 37.7749;
const LNG = -122.4194;
const GEOCELL = encodeGeohash(LAT, LNG, 6);

let failures = 0;
function check(name, cond) {
	if (cond) console.log(`  ✓ ${name}`);
	else { console.error(`  ✗ ${name}`); failures++; }
}

// ── Boot the real multiplayer server ─────────────────────────────────────────
function startServer() {
	const child = spawn(process.execPath, ['multiplayer/src/index.js'], {
		cwd: ROOT,
		env: {
			...process.env,
			PORT: String(PORT),
			HOST,
			NODE_ENV: 'development',            // allows origin-less node-client upgrades
			MULTIPLAYER_SHARED_SECRET: SECRET,
			HOLDER_PASS_SECRET: SECRET,
			// Dead API base → onCreate's pin hydration fails fast and the room starts
			// empty, so the test set is exactly what THIS run publishes (deterministic).
			WORLD_API_BASE: 'http://127.0.0.1:9',
			REDIS_URI: '',
			REDIS_URL: '',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const ready = new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('server did not start within 15s')), 15000);
		child.stdout.on('data', (b) => {
			if (String(b).includes('listening on ws://')) { clearTimeout(timer); resolve(); }
		});
		child.stderr.on('data', (b) => {
			const s = String(b);
			// Surface real boot failures; the dead-API pin-load warning is expected noise.
			if (/FATAL|Error:|failed to start/.test(s) && !/pin load failed/.test(s)) {
				process.stderr.write(`[server] ${s}`);
			}
		});
		child.on('exit', (code) => { if (code) reject(new Error(`server exited early (${code})`)); });
	});
	return { child, ready };
}

// ── A signed publish, mirroring api/_lib/irl-publish.js byte-for-byte ─────────
async function publish(type, pin, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
	const pinHash = await sha256Base64Url(JSON.stringify(pin ?? {}));
	const sig = await hmacSha256(secret, `irl:${GEOCELL}:${type}:${ts}:${pinHash}`);
	const res = await fetch(`${BASE_HTTP}/internal/irl-publish`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-mp-signature': sig, 'x-mp-timestamp': String(ts) },
		body: JSON.stringify({ geocell: GEOCELL, type, pin }),
	});
	const body = await res.json().catch(() => ({}));
	return { status: res.status, body };
}

// Connect a client and expose the live pins map + a waiter for a specific pin id.
async function connectClient(label) {
	const client = new Client(BASE_WS);
	const room = await client.joinOrCreate('irl_world', { geocell: GEOCELL, deviceToken: label, lat: LAT, lng: LNG }, IrlState);
	const present = new Set();
	const addWaiters = new Map();   // id → resolve
	const removeWaiters = new Map();
	const $ = getStateCallbacks(room);
	$(room.state).pins.onAdd((pin, id) => {
		present.add(id);
		addWaiters.get(id)?.(pin); addWaiters.delete(id);
	});
	$(room.state).pins.onRemove((pin, id) => {
		present.delete(id);
		removeWaiters.get(id)?.(); removeWaiters.delete(id);
	});
	const waitFor = (map) => (id, ms) => new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`${label}: timeout waiting on ${id} (${ms}ms)`)), ms);
		map.set(id, (v) => { clearTimeout(t); resolve(v); });
	});
	return {
		room,
		present,
		has: (id) => present.has(id),
		waitAdd: (id, ms) => (present.has(id) ? Promise.resolve(room.state.pins.get(id)) : waitFor(addWaiters)(id, ms)),
		waitRemove: (id, ms) => (!present.has(id) ? Promise.resolve() : waitFor(removeWaiters)(id, ms)),
		leave: () => room.leave().catch(() => {}),
	};
}

async function main() {
	const { child, ready } = startServer();
	let A, B, C;
	try {
		await ready;
		console.log(`server up on ${BASE_WS} — cell ${GEOCELL}\n`);

		console.log('1) two viewers in one cell — a placed pin lands live on the other');
		A = await connectClient('A');
		B = await connectClient('B');
		check('both clients joined the same room instance', A.room.roomId === B.room.roomId);

		const pin = {
			id: 'smoke-pin-1', lat: LAT, lng: LNG, heading: 90,
			avatarUrl: 'https://three.ws/cdn/default.glb', avatarName: 'Greeter',
			caption: 'gm', agentId: 'agent-xyz', placedAt: Date.now(),
		};
		const t0 = Date.now();
		const pub = await publish('pin:add', pin);
		check('publish accepted (signed)', pub.status === 200);
		check('publish dispatched to ≥1 live room', Number(pub.body?.delivered) >= 1);

		const landed = await B.waitAdd(pin.id, LIVENESS_MS);
		const elapsed = Date.now() - t0;
		check(`B received the pin within ${LIVENESS_MS}ms (took ${elapsed}ms)`, elapsed <= LIVENESS_MS);
		check('B sees the full pin payload (caption + avatar + heading)',
			landed?.caption === 'gm' && landed?.avatarUrl === pin.avatarUrl && Math.round(landed?.heading) === 90);

		console.log('\n2) a late joiner is handed the full current set on join (schema sync)');
		C = await connectClient('C');
		// The pin was placed before C joined; Colyseus hands the full state on join,
		// applied in the room-state message that lands just after joinOrCreate resolves.
		// So we await the sync (resolves instantly if already present) rather than race it.
		await C.waitAdd(pin.id, LIVENESS_MS);
		check('C is handed the pin placed before it joined (join-time state sync)', C.has(pin.id));
		check('C and B/A share the same room instance', C.room.roomId === A.room.roomId);

		console.log('\n3) a removal disappears on the other viewers live');
		const tR = Date.now();
		const rem = await publish('pin:remove', { id: pin.id });
		check('remove publish accepted', rem.status === 200);
		await Promise.all([B.waitRemove(pin.id, LIVENESS_MS), C.waitRemove(pin.id, LIVENESS_MS)]);
		check(`B & C saw the removal within ${LIVENESS_MS}ms (took ${Date.now() - tR}ms)`, !B.has(pin.id) && !C.has(pin.id));

		console.log('\n4) the channel rejects forged / tampered / stale publishes');
		const unsigned = await fetch(`${BASE_HTTP}/internal/irl-publish`, {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ geocell: GEOCELL, type: 'pin:add', pin: { id: 'forged' } }),
		});
		check('unsigned publish → 401', unsigned.status === 401);

		const wrongSecret = await publish('pin:add', { id: 'forged-2', lat: LAT, lng: LNG }, { secret: 'not-the-secret' });
		check('wrong-secret publish → 401', wrongSecret.status === 401);

		const stale = await publish('pin:add', { id: 'forged-3', lat: LAT, lng: LNG }, { ts: Math.floor(Date.now() / 1000) - 600 });
		check('stale-timestamp publish → 401', stale.status === 401);

		check('no forged pin reached the room', !B.has('forged') && !B.has('forged-2') && !B.has('forged-3'));
	} finally {
		await Promise.allSettled([A?.leave(), B?.leave(), C?.leave()]);
		child.kill('SIGTERM');
	}

	if (failures) {
		console.error(`\nD1 SMOKE: FAIL (${failures} check${failures === 1 ? '' : 's'})`);
		process.exit(1);
	}
	console.log('\nD1 SMOKE: PASS');
}

main().catch((err) => {
	console.error('\nD1 SMOKE: ERROR —', err?.message || err);
	process.exit(1);
});
