// Room-relative anchoring math (src/irl/room-anchor.js).
//
// The contract these tests pin is the whole point of the room frame: agents you
// place around one spot keep their EXACT relative geometry no matter what GPS
// does, and they project into the world on the right side of you. The headline
// scenario is the one a user described — standing in a room, cup ahead, an agent
// on the couch to the right, three behind, nothing to the left — verified to
// land where a real person would. Pure math, no DOM / Three.js / clock.

import { describe, it, expect } from 'vitest';

import {
	M_PER_DEG_LAT,
	mPerDegLng,
	geoToLocal,
	localToGeo,
	bearingDistanceToLocal,
	localToBearingDistance,
	localToTrueNorth,
	roomOriginWorld,
	agentWorldPosition,
	compassToYaw,
	placeAround,
} from '../src/irl/room-anchor.js';

const ORIGIN = { lat: 37.7749, lng: -122.4194 }; // arbitrary; math is origin-relative
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('metres-per-degree', () => {
	it('latitude is the fixed constant', () => {
		expect(M_PER_DEG_LAT).toBe(110540);
	});
	it('longitude shrinks with cos(latitude)', () => {
		expect(mPerDegLng(0)).toBeCloseTo(111320, 0);      // equator: full width
		expect(mPerDegLng(60)).toBeCloseTo(111320 / 2, 0); // 60° N: half width
		expect(mPerDegLng(89)).toBeLessThan(mPerDegLng(45));
	});
});

describe('geoToLocal / localToGeo round-trip', () => {
	it('a 3 m east, 2 m north offset survives the round-trip', () => {
		const here = localToGeo(ORIGIN.lat, ORIGIN.lng, 3, 2);
		const back = geoToLocal(ORIGIN.lat, ORIGIN.lng, here.lat, here.lng);
		expect(near(back.east, 3, 1e-3)).toBe(true);
		expect(near(back.north, 2, 1e-3)).toBe(true);
	});
	it('east is +lng, north is +lat', () => {
		const e = geoToLocal(ORIGIN.lat, ORIGIN.lng, ORIGIN.lat, ORIGIN.lng + 0.001);
		expect(e.east).toBeGreaterThan(0);
		expect(near(e.north, 0)).toBe(true);
		const n = geoToLocal(ORIGIN.lat, ORIGIN.lng, ORIGIN.lat + 0.001, ORIGIN.lng);
		expect(n.north).toBeGreaterThan(0);
		expect(near(n.east, 0)).toBe(true);
	});
});

describe('bearingDistanceToLocal', () => {
	it('cardinal bearings map to the right axes', () => {
		const N = bearingDistanceToLocal(0, 5);
		expect(near(N.north, 5, 1e-9) && near(N.east, 0, 1e-9)).toBe(true);
		const E = bearingDistanceToLocal(90, 5);
		expect(near(E.east, 5, 1e-9) && near(E.north, 0, 1e-9)).toBe(true);
		const S = bearingDistanceToLocal(180, 5);
		expect(near(S.north, -5, 1e-9)).toBe(true);
		const W = bearingDistanceToLocal(270, 5);
		expect(near(W.east, -5, 1e-9)).toBe(true);
	});
	it('round-trips through localToBearingDistance', () => {
		for (const [b, d] of [[0, 3], [47, 8.2], [123, 1.5], [270, 12], [359, 4]]) {
			const o = bearingDistanceToLocal(b, d);
			const rt = localToBearingDistance(o.east, o.north);
			expect(near(rt.bearingDeg, b, 1e-6)).toBe(true);
			expect(near(rt.distM, d, 1e-9)).toBe(true);
		}
	});
});

describe('localToTrueNorth (room frame rotation)', () => {
	it('is identity for a true-north-aligned room', () => {
		const r = localToTrueNorth(2, 3, 0);
		expect(r.east).toBe(2);
		expect(r.north).toBe(3);
	});
	it('rotating the frame 90° turns local-north into true-east', () => {
		// Room frame whose "north" axis points at compass 90° (east). A point 1 m
		// "north" in that frame is 1 m true-EAST in the world.
		const r = localToTrueNorth(0, 1, 90);
		expect(near(r.east, 1)).toBe(true);
		expect(near(r.north, 0)).toBe(true);
	});
	it('placeAround stores in the room frame so a rotated room still round-trips', () => {
		const viewer = { lat: ORIGIN.lat, lng: ORIGIN.lng }; // standing on the origin
		const placed = placeAround({
			originLat: ORIGIN.lat, originLng: ORIGIN.lng,
			viewerLat: viewer.lat, viewerLng: viewer.lng,
			bearingDeg: 90, distM: 3, originYawDeg: 30,
		});
		// Re-project to the world (viewer at origin → originWorld is {0,0}).
		const w = agentWorldPosition({
			originWorld: { x: 0, z: 0 },
			relEast: placed.relEast, relNorth: placed.relNorth,
			originYawDeg: 30,
		});
		// Bearing 90 at 3 m from the viewer ⇒ 3 m true-east ⇒ +X, z≈0.
		expect(near(w.x, 3, 1e-9)).toBe(true);
		expect(near(w.z, 0, 1e-9)).toBe(true);
	});
});

describe('compassToYaw matches pinYawRad', () => {
	it('negates radians', () => {
		expect(compassToYaw(0)).toBe(-0);
		expect(near(compassToYaw(90), -Math.PI / 2)).toBe(true);
		expect(near(compassToYaw(180), -Math.PI)).toBe(true);
	});
});

describe("the user's room: cup ahead, couch right, three behind, wall left", () => {
	// Viewer stands on the room origin facing north (the cup is dead ahead, at
	// −Z). We place agents by compass bearing + distance, then project each into
	// the viewer's world frame and assert it sits where a real person would.
	const viewer = { lat: ORIGIN.lat, lng: ORIGIN.lng };
	const originWorld = roomOriginWorld(viewer.lat, viewer.lng, ORIGIN.lat, ORIGIN.lng);

	const place = (bearingDeg, distM) => {
		const p = placeAround({
			originLat: ORIGIN.lat, originLng: ORIGIN.lng,
			viewerLat: viewer.lat, viewerLng: viewer.lng,
			bearingDeg, distM,
		});
		return {
			...p,
			world: agentWorldPosition({ originWorld, relEast: p.relEast, relNorth: p.relNorth }),
		};
	};

	it('the couch agent (90°, 3 m) lands to the RIGHT: +X, on the floor plane', () => {
		const couch = place(90, 3);
		expect(couch.world.x).toBeGreaterThan(2.9);  // to the right (east)
		expect(near(couch.world.z, 0, 1e-6)).toBe(true);
		expect(near(couch.world.y, 0)).toBe(true);
	});

	it('the three agents behind (≈180°) land BEHIND: +Z (south), each distinct', () => {
		const behind = [place(170, 2), place(180, 3), place(195, 4)];
		for (const a of behind) expect(a.world.z).toBeGreaterThan(0); // behind = +Z
		// Distinct spots, not smeared onto one another.
		const zs = behind.map(a => a.world.z);
		expect(new Set(zs.map(z => z.toFixed(2))).size).toBe(3);
	});

	it('nothing is placed to the left — the frame has no agent there by construction', () => {
		// (No placement at 270°. This documents the scenario: the left wall stays
		// empty; the renderer only ever draws agents the room actually contains.)
		const right = place(90, 3);
		expect(right.world.x).toBeGreaterThan(0); // sanity: right is +X, so left (−X) is empty
	});

	it('an agent faces the viewer by default (you walk up, it looks at you)', () => {
		const couch = place(90, 3);          // placed pointing east…
		expect(couch.relYawDeg).toBe(270);   // …so it faces west, back toward the viewer
	});
});

describe('intra-room geometry is exact under GPS drift (the headline guarantee)', () => {
	// Place couch-right and wall-left in one room, then re-render them from a
	// SECOND viewer whose GPS is off by ~12 m. The cluster translates as one; the
	// agents must stay 4 m apart on opposite sides — never smear or swap.
	const couch = placeAround({ originLat: ORIGIN.lat, originLng: ORIGIN.lng, viewerLat: ORIGIN.lat, viewerLng: ORIGIN.lng, bearingDeg: 90, distM: 2 });
	const wall  = placeAround({ originLat: ORIGIN.lat, originLng: ORIGIN.lng, viewerLat: ORIGIN.lat, viewerLng: ORIGIN.lng, bearingDeg: 270, distM: 2 });

	it('relative offsets put them exactly 4 m apart, opposite sides', () => {
		expect(near(couch.relEast, 2, 1e-9)).toBe(true);
		expect(near(wall.relEast, -2, 1e-9)).toBe(true);
		expect(near(Math.abs(couch.relEast - wall.relEast), 4, 1e-9)).toBe(true);
	});

	it('a second viewer 12 m off-origin still sees them 4 m apart on the same sides', () => {
		// 12 m east of the origin (≈ a real GPS error).
		const off = localToGeo(ORIGIN.lat, ORIGIN.lng, 12, 0);
		const originWorld = roomOriginWorld(off.lat, off.lng, ORIGIN.lat, ORIGIN.lng);
		const cW = agentWorldPosition({ originWorld, relEast: couch.relEast, relNorth: couch.relNorth });
		const wW = agentWorldPosition({ originWorld, relEast: wall.relEast, relNorth: wall.relNorth });
		expect(near(cW.x - wW.x, 4, 1e-6)).toBe(true);   // still 4 m apart
		expect(cW.x).toBeGreaterThan(wW.x);              // couch still to the right of wall
		// And the whole cluster shifted left by the 12 m origin offset, together.
		expect(near(cW.x, -12 + 2, 1e-6)).toBe(true);
	});
});
