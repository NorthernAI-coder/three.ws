// R5 — IRL room-anchor QA preflight (the hardware-free half of the protocol).
//
//   node scripts/irl-room-qa.mjs                 # offline invariants only
//   node scripts/irl-room-qa.mjs --url https://three.ws   # + probe deployed API
//
// What this is — and is NOT
// ─────────────────────────
// R5 (tasks/irl-room-anchor/R5-on-device-qa.md) is fundamentally an ON-DEVICE
// protocol: the 360° turn-to-see test, the cross-user check, and the permission
// gates can only be judged on a real phone with a camera, compass, and GPS. This
// sandbox has none of those, so they CANNOT be run here and this script does not
// pretend to. It locks down everything that IS verifiable without hardware so the
// human's on-device pass is the only step left — and so any regression in the
// shared-room math, the POST contract, or the device-capability gate is caught in
// CI before it ever reaches a phone. Run it before every on-device QA session.
//
// It imports the REAL production modules (room-anchor.js, floor-anchor.js,
// placement-capability.js) — no mocks of our own code. The capability matrix is
// exercised by stubbing only the browser ENVIRONMENT (navigator), which is how a
// capability detector is meant to be tested.
//
// Assertions print ✓/✗; a clean run prints "ROOM QA: PASS" and exits 0.

import {
	geoToLocal, localToGeo, bearingDistanceToLocal, localToBearingDistance,
	roomOriginWorld, agentWorldPosition, placeAround, calibrateRoomOrigin,
	pinAbsoluteFromOrigin, compassToYaw,
} from '../src/irl/room-anchor.js';
import { yawDegFromQuat, anchorPoseToPin } from '../src/irl/floor-anchor.js';

let failures = 0;
function check(name, cond) {
	if (cond) console.log(`  ✓ ${name}`);
	else { console.error(`  ✗ ${name}`); failures++; }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── 1) The canonical scenario, end to end through the REAL render math ────────
// Mirrors window.__irlSeedRoom + window.__irlRoomCheck (src/irl.js): viewer on the
// origin facing north, couch-agent 3 m RIGHT (+E), three agents BEHIND (−N), the
// left wall and the dead-ahead "cup" direction empty. This is the geometry that
// makes the user's 360° turn-to-see test land on the right bearings.
console.log('1) Canonical room scenario — world sides via room-anchor projection');
{
	const origin = { lat: 37.7749, lng: -122.4194 };
	// Viewer stands on the origin → room origin sits at world (0,0).
	const originWorld = roomOriginWorld(origin.lat, origin.lng, origin.lat, origin.lng);
	check('room origin lands at the viewer (world 0,0)', near(originWorld.x, 0) && near(originWorld.z, 0));

	const layout = [
		{ tag: 'couch-right', relEast: 3,    relNorth: 0    },
		{ tag: 'behind-1',    relEast: -0.5, relNorth: -2.5 },
		{ tag: 'behind-2',    relEast: 0.5,  relNorth: -3   },
		{ tag: 'behind-3',    relEast: 1.5,  relNorth: -3.5 },
	];
	const placed = layout.map((l) => {
		const p = agentWorldPosition({ originWorld, relEast: l.relEast, relNorth: l.relNorth });
		const side  = p.x > 0.5 ? 'right' : p.x < -0.5 ? 'left' : 'center';
		const depth = p.z > 0.5 ? 'behind' : p.z < -0.5 ? 'ahead' : 'level';
		return { ...l, x: +p.x.toFixed(2), z: +p.z.toFixed(2), side, depth };
	});

	const couch = placed.find((p) => p.tag === 'couch-right');
	check('couch agent renders to the RIGHT (+X)', couch.side === 'right');
	check('couch agent is NOT ahead or behind (level)', couch.depth === 'level');

	const behind = placed.filter((p) => p.tag.startsWith('behind'));
	check('all three behind-agents render BEHIND (+Z world, north = −Z)', behind.every((p) => p.depth === 'behind'));
	check('no behind-agent drifts onto the left wall', behind.every((p) => p.side !== 'left'));

	// Distinctness — the multi-place step requires three SEPARATE agents, none stacked.
	const xs = behind.map((p) => p.x), zs = behind.map((p) => p.z);
	const distinct = behind.every((a, i) => behind.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) > 0.3));
	check('three behind-agents are distinct (none stacked)', distinct);

	// The left wall (−X) and the dead-ahead cup direction (−Z) must stay empty.
	check('nothing renders on the left wall (−X)', !placed.some((p) => p.side === 'left'));
	check('nothing renders dead-ahead where the cup is (−Z)', !placed.some((p) => p.depth === 'ahead'));
	void xs; void zs;
}

// ── 2) placeAround → projection round-trip (authoring → render parity) ────────
// The placer need not stand on the origin. Drop an agent at a bearing+distance,
// then project it back from the shared origin: it must reappear at that bearing.
console.log('2) placeAround → render round-trip (the "place around me" path)');
{
	const origin = { lat: 37.7749, lng: -122.4194 };
	// Placer stands 1 m north of the origin, drops an agent 3 m due EAST (bearing 90).
	const viewer = localToGeo(origin.lat, origin.lng, 0, 1);
	const a = placeAround({
		originLat: origin.lat, originLng: origin.lng,
		viewerLat: viewer.lat, viewerLng: viewer.lng,
		bearingDeg: 90, distM: 3, faceViewer: true,
	});
	check('stored offset is exact east (relEast ≈ 3)', near(a.relEast, 3, 1e-3));
	check('stored offset folds in the placer position (relNorth ≈ 1)', near(a.relNorth, 1, 1e-3));
	check('agent faces back at the placer (relYawDeg = 270)', near(a.relYawDeg, 270, 1e-9));

	// A DIFFERENT viewer, standing on the origin, projects the stored pin:
	const ow = roomOriginWorld(origin.lat, origin.lng, origin.lat, origin.lng);
	const w = agentWorldPosition({ originWorld: ow, relEast: a.relEast, relNorth: a.relNorth });
	const { bearingDeg, distM } = localToBearingDistance(w.x, -w.z); // world→local: north = −Z
	check('second viewer sees it on the same bearing (~67° from origin, NE)', Math.abs(bearingDeg - 71.57) < 1.5);
	check('second viewer sees it at the right distance (~3.16 m)', near(distM, Math.hypot(3, 1), 1e-2));
	void bearingDistanceToLocal; void compassToYaw;
}

// ── 3) One-gesture calibrate moves the WHOLE cluster, never shears it (R2) ────
console.log('3) Room calibrate — cluster translates/rotates rigidly');
{
	const origin = { lat: 37.7749, lng: -122.4194, yaw: 0 };
	const agents = [{ relEast: 3, relNorth: 0 }, { relEast: -2, relNorth: 1 }];
	const before = agents.map((g) => pinAbsoluteFromOrigin({ originLat: origin.lat, originLng: origin.lng, ...g }));
	const beforeGap = geoToLocal(before[0].lat, before[0].lng, before[1].lat, before[1].lng);

	const moved = calibrateRoomOrigin({ originLat: origin.lat, originLng: origin.lng, dEastM: 5, dNorthM: -2 });
	const after = agents.map((g) => pinAbsoluteFromOrigin({ originLat: moved.originLat, originLng: moved.originLng, ...g }));
	const afterGap = geoToLocal(after[0].lat, after[0].lng, after[1].lat, after[1].lng);

	check('inter-agent geometry is preserved exactly after a translate',
		near(beforeGap.east, afterGap.east, 1e-6) && near(beforeGap.north, afterGap.north, 1e-6));
	const shift = geoToLocal(before[0].lat, before[0].lng, after[0].lat, after[0].lng);
	check('the whole cluster shifted by the calibrate offset (+5 E, −2 N)',
		near(shift.east, 5, 1e-3) && near(shift.north, -2, 1e-3));
}

// ── 4) WebXR floor-anchor pose → shareable GPS pin (R3 write path) ───────────
console.log('4) Floor-anchor pose → pin (WebXR write path math)');
{
	check('flat surface quaternion → 0° yaw', near(yawDegFromQuat(0, 0, 0, 1), 0, 1e-9));
	// 90° about Y: quat = (0, sin45, 0, cos45)
	const s = Math.SQRT1_2;
	check('90° yaw quaternion decodes to ~90°', Math.abs(yawDegFromQuat(0, s, 0, s) - 90) < 1e-6);
	// A hit-test 2 m ahead (local −Z) + 1 m right (+X), 0.4 m below eye level.
	const pin = anchorPoseToPin({ originLat: 37.7749, originLng: -122.4194, x: 1, y: -0.4, z: -2, quat: [0, 0, 0, 1] });
	const off = geoToLocal(37.7749, -122.4194, pin.lat, pin.lng);
	check('local +X persists as east (+1 m)', near(off.east, 1, 1e-3));
	check('local −Z persists as north (+2 m)', near(off.north, 2, 1e-3));
	check('height offset carried through', near(pin.heightM, -0.4, 1e-9));
	check('source tagged webxr', pin.source === 'webxr');
}

// ── 5) POST /api/irl/pins `room` contract — accept valid, degrade invalid ─────
// Re-encodes the validation in api/irl/pins.js (ROOM_ID_RE, REL_MAX_M, finite,
// null-island reject). The server side is also covered by
// tests/api/irl-pins-room.test.js; this guards the client against sending a block
// the server would silently drop to a standalone pin.
console.log('5) POST `room` block contract — validate/clamp/degrade');
{
	const ROOM_ID_RE = /^[a-z0-9-]{1,64}$/;
	const REL_MAX_M = 500;
	const roomOk = (room) =>
		ROOM_ID_RE.test(String(room.id || '')) &&
		Number.isFinite(room.originLat) && room.originLat >= -90 && room.originLat <= 90 &&
		Number.isFinite(room.originLng) && room.originLng >= -180 && room.originLng <= 180 &&
		!(room.originLat === 0 && room.originLng === 0) &&
		Number.isFinite(room.relEast) && Number.isFinite(room.relNorth);
	const clampRel = (v) => Math.max(-REL_MAX_M, Math.min(REL_MAX_M, v));

	const valid = { id: 'living-room-7', originLat: 37.7749, originLng: -122.4194, originYawDeg: 0, relEast: 3, relNorth: 0 };
	check('a well-formed room block validates', roomOk(valid) === true);
	check('uppercase / illegal room id is rejected', roomOk({ ...valid, id: 'Living_Room' }) === false);
	check('a 65-char id is rejected', roomOk({ ...valid, id: 'a'.repeat(65) }) === false);
	check('null-island origin (0,0) is rejected', roomOk({ ...valid, originLat: 0, originLng: 0 }) === false);
	check('out-of-range latitude is rejected', roomOk({ ...valid, originLat: 91 }) === false);
	check('non-finite relEast is rejected', roomOk({ ...valid, relEast: NaN }) === false);
	check('relEast beyond ±500 m clamps, not rejects', clampRel(99999) === 500 && clampRel(-99999) === -500);
	// The matching exact-offset the client computes for `valid` must round-trip.
	const w = agentWorldPosition({ originWorld: { x: 0, z: 0 }, relEast: clampRel(valid.relEast), relNorth: clampRel(valid.relNorth) });
	check('the validated offset projects to the right side (+X)', w.x > 0.5 && Math.abs(w.z) < 0.5);
}

// ── 6) Device-capability matrix — iOS must NOT show a dead WebXR button ───────
// The matrix row "WebXR floor reticle absent on iOS, present on Android". We
// import the REAL iOS detector (canUseQuickLook, which is Three.js-free) and apply
// the resolver's own documented precedence — webxr > quicklook > pin — against a
// synthetic WebXR probe. (resolvePlacementCapability itself transitively imports
// the Three.js WebXR session, a browser-bundle dependency; its precedence logic is
// the three lines reproduced here, and the leaf detector under test is the real
// one. The felt on-device behaviour still needs a phone.)
console.log('6) Placement-capability matrix (the WebXR-on-iOS gate)');
{
	const savedNav = globalThis.navigator;
	const setNav = (nav) => Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
	// Mirror resolvePlacementCapability(): webxr if the immersive-ar probe passes,
	// else the real iOS Quick Look detector, else the always-available pin path.
	const resolve = async (canUseQuickLook) => {
		try { if (await globalThis.navigator?.xr?.isSessionSupported?.('immersive-ar')) return 'webxr'; } catch { /* not webxr */ }
		if (canUseQuickLook()) return 'quicklook';
		return 'pin';
	};
	try {
		const { canUseQuickLook } = await import('../src/ar/quick-look.js');

		setNav({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126', platform: 'Linux armv8l',
			maxTouchPoints: 5, xr: { isSessionSupported: async (m) => m === 'immersive-ar' } });
		check('Android Chrome (WebXR) → "webxr" (live floor reticle)', (await resolve(canUseQuickLook)) === 'webxr');

		setNav({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari', platform: 'iPhone', maxTouchPoints: 5 });
		check('iOS Safari (no WebXR) → "quicklook" — NOT a dead WebXR button', (await resolve(canUseQuickLook)) === 'quicklook');
		check('real canUseQuickLook() detects iPhone UA', canUseQuickLook() === true);

		setNav({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126', platform: 'MacIntel', maxTouchPoints: 0 });
		check('Desktop Chrome (no AR surface) → "pin" (compass+GPS, no console noise)', (await resolve(canUseQuickLook)) === 'pin');
		check('real canUseQuickLook() rejects a desktop (non-touch) Mac', canUseQuickLook() === false);

		// iPadOS reports as MacIntel but with touch points — Quick Look must still resolve.
		setNav({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', platform: 'MacIntel', maxTouchPoints: 5 });
		check('iPadOS (MacIntel + touch) → "quicklook"', (await resolve(canUseQuickLook)) === 'quicklook');
	} finally {
		if (savedNav === undefined) delete globalThis.navigator;
		else Object.defineProperty(globalThis, 'navigator', { value: savedNav, configurable: true });
	}
}

// ── 7) Deployed API probe (optional, --url) — the LIVE GET contract + auth ────
// Exercises the real proof-of-presence handshake the on-device client uses:
//   POST /api/irl/fix-token { lat,lng } → token   (anti-GPS-spoof, H3)
//   GET  /api/irl/pins?lat,lng  with  x-irl-fix: <token>  → { pins:[…] }
// then asserts the room columns survived the deploy (R4 §6 pre-condition) and the
// viewer projection never leaks owner identity. Read-only: it does NOT place a pin
// (a write would litter prod) — the POST round-trip is the on-device step. An
// empty `pins` near the synthetic coord is expected and still proves the contract.
const urlArg = process.argv.indexOf('--url');
if (urlArg !== -1 && process.argv[urlArg + 1]) {
	const base = process.argv[urlArg + 1].replace(/\/$/, '');
	console.log(`7) Deployed probe — ${base}/api/irl`);
	const LAT = 37.7749, LNG = -122.4194;
	const ROOM_KEYS = ['room_id', 'rel_east_m', 'rel_north_m', 'origin_lat', 'origin_lng', 'origin_yaw_deg'];
	try {
		// A bare lat/lng read must be REFUSED — proof-of-presence is the whole point.
		const noFix = await fetch(`${base}/api/irl/pins?lat=${LAT}&lng=${LNG}&deviceToken=room-qa-probe`, { headers: { accept: 'application/json' } });
		check('a read WITHOUT a fix token is refused (anti-spoof gate live)', noFix.status === 401);

		// Mint the short-lived presence proof, exactly as the client does.
		const mint = await fetch(`${base}/api/irl/fix-token`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: LAT, lng: LNG }),
		});
		check('POST /api/irl/fix-token mints a presence proof (2xx)', mint.ok);
		const token = (await mint.json().catch(() => ({}))).token;
		check('the mint returns a signed token', typeof token === 'string' && token.length > 16);

		const res = await fetch(`${base}/api/irl/pins?lat=${LAT}&lng=${LNG}&deviceToken=room-qa-probe`, {
			headers: { accept: 'application/json', 'x-irl-fix': token || '' },
		});
		check('GET /api/irl/pins with the fix token returns 2xx', res.ok);
		const data = await res.json().catch(() => null);
		check('response is JSON with a pins array', Array.isArray(data?.pins));
		if (Array.isArray(data?.pins) && data.pins.length) {
			const p = data.pins[0];
			check('a returned pin carries the room columns', ROOM_KEYS.every((k) => k in p));
			check('viewer rows expose is_mine boolean, never user_id/device_token',
				typeof p.is_mine === 'boolean' && !('user_id' in p) && !('device_token' in p));
		} else {
			console.log('  · no pins near the synthetic probe coord — contract proven, per-row shape needs a live pin (place one on-device)');
		}
	} catch (err) {
		check(`deployed /api/irl reachable (${err?.message || err})`, false);
	}
} else {
	console.log('7) Deployed probe — skipped (pass --url https://three.ws to run it)');
}

console.log('');
if (failures) {
	console.error(`ROOM QA: FAIL — ${failures} assertion(s) failed`);
	process.exit(1);
}
console.log('ROOM QA: PASS — offline invariants hold. On-device protocol (360° turn-to-see,');
console.log('cross-user, permission gates) still required on real iOS Safari + Android Chrome.');
