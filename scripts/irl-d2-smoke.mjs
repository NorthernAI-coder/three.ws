// Live round-trip smoke for D2 — IRL live viewer presence.
//
//   node scripts/irl-d2-smoke.mjs
//
// Where irl-d1-smoke proves pin liveness, this proves the PRESENCE contract end-
// to-end: it boots the REAL multiplayer server (the same multiplayer/src/index.js
// prod runs, with the irl_world room wired exactly as deployed), connects two
// colyseus.js clients to one geocell room, and asserts the spec's acceptance
// checklist over the wire:
//   1. Two viewers in one cell → each sees a count of 2 (the "N viewing nearby").
//   2. Privacy: a viewer's broadcast position is the cell centre + jitter, never
//      the precise GPS it joined with (coarse-by-construction).
//   3. Ghost opt-in is OFF by default — no positioned marker is broadcast until a
//      viewer opts in; set_ghost flips it (and the shared avatar) LIVE, and opting
//      back out clears it live.
//   4. A heartbeat is accepted and keeps the viewer counted.
//   5. A viewer leaving drops the count for everyone else live.
//
// The 30 s heartbeat reaper (silent/backgrounded drop) is covered by the fast unit
// test in tests/irl-presence.test.js rather than a 30 s wait here, so this smoke
// stays sub-second. The server's pin hydration is pointed at a dead API base so the
// room starts empty — the run needs no DB, no env, and no network.
// Assertions throw on failure; a clean run prints "D2 SMOKE: PASS".

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { Client, getStateCallbacks } from 'colyseus.js';
import { IrlState } from '../multiplayer/src/irl-schemas.js';
import { encodeGeohash, decodeGeohashBounds } from '../multiplayer/src/geohash.js';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = 2598;
const HOST = '127.0.0.1';
const BASE_WS = `ws://${HOST}:${PORT}`;
const LIVENESS_MS = 1500; // the spec's "~1 s" plus headroom for CI scheduling jitter

const LAT = 37.7749;
const LNG = -122.4194;
const GEOCELL = encodeGeohash(LAT, LNG, 6);

let failures = 0;
function check(name, cond) {
	if (cond) console.log(`  ✓ ${name}`);
	else { console.error(`  ✗ ${name}`); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(pred, ms) {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) { if (pred()) return true; await sleep(20); }
	return pred();
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
			// Dead API base → onCreate's pin hydration fails fast and the room starts
			// empty, so presence is the only thing in state (deterministic).
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
			if (/FATAL|Error:|failed to start/.test(s) && !/pin load failed/.test(s)) {
				process.stderr.write(`[server] ${s}`);
			}
		});
		child.on('exit', (code) => { if (code) reject(new Error(`server exited early (${code})`)); });
	});
	return { child, ready };
}

// Connect a viewer and mirror what it SEES of the other viewers (id → live snapshot).
async function connectViewer(label, { ghost = false, avatar = '' } = {}) {
	const client = new Client(BASE_WS);
	const room = await client.joinOrCreate('irl_world',
		{ geocell: GEOCELL, deviceToken: label, lat: LAT, lng: LNG, ghost, avatar }, IrlState);
	const seen = new Map();
	const $ = getStateCallbacks(room);
	$(room.state).viewers.onAdd((v, id) => {
		const snap = () => seen.set(id, { ghost: v.ghost, avatar: v.avatar, lat: v.lat, lng: v.lng });
		snap();
		$(v).onChange(snap);
	});
	$(room.state).viewers.onRemove((_v, id) => seen.delete(id));
	return {
		room,
		seen,
		count: () => room.state.viewers.size,
		other: () => [...seen.entries()].find(([id]) => id !== room.sessionId)?.[1],
		heartbeat: (heading) => room.send('heartbeat', { heading }),
		setGhost: (g, a) => room.send('set_ghost', { ghost: g, avatar: a }),
		leave: () => room.leave().catch(() => {}),
	};
}

async function main() {
	const { child, ready } = startServer();
	let A, B;
	try {
		await ready;
		console.log(`server up on ${BASE_WS} — cell ${GEOCELL}\n`);

		console.log('1) two viewers in one cell — each sees a count of 2');
		A = await connectViewer('A');
		B = await connectViewer('B');
		check('both viewers joined the same room instance', A.room.roomId === B.room.roomId);
		check('A sees count 2', await waitUntil(() => A.count() === 2, LIVENESS_MS));
		check('B sees count 2', await waitUntil(() => B.count() === 2, LIVENESS_MS));

		console.log('\n2) presence is coarse — no precise GPS ever leaves the server');
		await waitUntil(() => !!A.other(), LIVENESS_MS);
		const bAsSeenByA = A.other();
		check('B is broadcast at a jittered position (≠ the precise input)',
			bAsSeenByA && bAsSeenByA.lat !== LAT && bAsSeenByA.lng !== LNG);
		const bounds = decodeGeohashBounds(GEOCELL);
		check('…and that position stays inside the ~1km cell it claims',
			bAsSeenByA &&
			bAsSeenByA.lat >= bounds.latMin && bAsSeenByA.lat <= bounds.latMax &&
			bAsSeenByA.lng >= bounds.lngMin && bAsSeenByA.lng <= bounds.lngMax);

		console.log('\n3) ghost opt-in is OFF by default; set_ghost flips it live');
		check('B is count-only by default (no ghost marker broadcast)', A.other()?.ghost === false);
		B.setGhost(true, 'https://three.ws/cdn/default.glb');
		check('A sees B appear as a ghost within the liveness budget',
			await waitUntil(() => A.other()?.ghost === true, LIVENESS_MS));
		check('A receives B shared avatar', A.other()?.avatar === 'https://three.ws/cdn/default.glb');

		console.log('\n4) opting back out clears the ghost live');
		B.setGhost(false, '');
		check('A sees B revert to count-only', await waitUntil(() => A.other()?.ghost === false, LIVENESS_MS));
		check('A no longer holds a shared avatar for B', A.other()?.avatar === '');

		console.log('\n5) a heartbeat is accepted and keeps the viewer counted');
		B.heartbeat(270);
		await sleep(200);
		check('count is still 2 after a heartbeat', A.count() === 2);

		console.log('\n6) a viewer leaving drops the count for everyone else, live');
		await B.leave();
		check('A sees count fall to 1 after B leaves', await waitUntil(() => A.count() === 1, LIVENESS_MS));
	} finally {
		await Promise.allSettled([A?.leave(), B?.leave()]);
		child.kill('SIGTERM');
	}

	if (failures) {
		console.error(`\nD2 SMOKE: FAIL (${failures} check${failures === 1 ? '' : 's'})`);
		process.exit(1);
	}
	console.log('\nD2 SMOKE: PASS');
}

main().catch((err) => {
	console.error('\nD2 SMOKE: ERROR —', err?.message || err);
	process.exit(1);
});
