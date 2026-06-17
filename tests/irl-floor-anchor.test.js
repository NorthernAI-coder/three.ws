// Pure floor-anchor math (src/irl/floor-anchor.js).
//
// The contract these tests pin is the WebXR write path: when you tap to place an
// agent on the floor, the anchored local pose must convert to a GPS pin that
// reloads where you tapped — for you and for every other viewer. A sign error
// here (the classic: storing +z as north instead of −z) ships silently and lands
// every saved anchor on the wrong side of the room. So we assert the projection
// round-trips through room-anchor's geoToLocal, the yaw extraction is right at
// every cardinal, and height/source ride through untouched. Pure math, no DOM /
// Three.js / clock — mirrors tests/irl-room-anchor.test.js.

import { describe, it, expect } from 'vitest';

import { yawDegFromQuat, anchorPoseToPin } from '../src/irl/floor-anchor.js';
import { geoToLocal } from '../src/irl/room-anchor.js';

const ORIGIN = { lat: 37.7749, lng: -122.4194 }; // arbitrary; math is origin-relative
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// A yaw about world-Y by `deg` degrees, encoded as a quaternion [x,y,z,w].
// yawDegFromQuat reads the same clockwise-from-−Z convention savePin stores, so a
// quaternion built as a +Y rotation of θ must read back as θ.
const yawQuat = (deg) => {
	const half = (deg * Math.PI) / 180 / 2;
	return [0, Math.sin(half), 0, Math.cos(half)];
};

describe('yawDegFromQuat', () => {
	it('the identity quaternion is 0° yaw', () => {
		expect(yawDegFromQuat(0, 0, 0, 1)).toBe(0);
	});

	it('cardinal yaw quaternions read back as 90 / 180 / 270', () => {
		expect(near(yawDegFromQuat(...yawQuat(90)), 90)).toBe(true);
		expect(near(Math.abs(yawDegFromQuat(...yawQuat(180))), 180)).toBe(true); // ±180 are the same heading
		// 270° comes back as −90° in the raw atan2 range; the persist path normalises it.
		expect(near(yawDegFromQuat(...yawQuat(270)), -90)).toBe(true);
	});

	it('a wider sweep round-trips through anchorPoseToPin into [0,360)', () => {
		for (const deg of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
			const { heading } = anchorPoseToPin({
				originLat: ORIGIN.lat, originLng: ORIGIN.lng,
				x: 0, y: 0, z: 0, quat: yawQuat(deg),
			});
			expect(heading).toBeGreaterThanOrEqual(0);
			expect(heading).toBeLessThan(360);
			expect(near(heading, deg, 1)).toBe(true); // rounded to whole degrees
		}
	});
});

describe('anchorPoseToPin', () => {
	const QUAT = yawQuat(0);

	it('a pose +2 m east / +3 m north of the origin round-trips back to (2, 3)', () => {
		// Local frame: +X = east, world north = −Z, so 3 m north is z = −3.
		const pin = anchorPoseToPin({
			originLat: ORIGIN.lat, originLng: ORIGIN.lng,
			x: 2, y: 0, z: -3, quat: QUAT,
		});
		const back = geoToLocal(ORIGIN.lat, ORIGIN.lng, pin.lat, pin.lng);
		expect(near(back.east, 2, 1e-3)).toBe(true);
		expect(near(back.north, 3, 1e-3)).toBe(true);
	});

	it('the sign of z is north-negated (catches the +z mistake)', () => {
		// Walking the agent to +z (south) must DECREASE latitude, not increase it.
		const south = anchorPoseToPin({ originLat: ORIGIN.lat, originLng: ORIGIN.lng, x: 0, y: 0, z: 5, quat: QUAT });
		const north = anchorPoseToPin({ originLat: ORIGIN.lat, originLng: ORIGIN.lng, x: 0, y: 0, z: -5, quat: QUAT });
		expect(south.lat).toBeLessThan(ORIGIN.lat);
		expect(north.lat).toBeGreaterThan(ORIGIN.lat);
		// +x is east → longitude increases.
		const east = anchorPoseToPin({ originLat: ORIGIN.lat, originLng: ORIGIN.lng, x: 5, y: 0, z: 0, quat: QUAT });
		expect(east.lng).toBeGreaterThan(ORIGIN.lng);
	});

	it('heightM passes through unchanged (negative = below eye level)', () => {
		const below = anchorPoseToPin({ originLat: ORIGIN.lat, originLng: ORIGIN.lng, x: 0, y: -1.4, z: 0, quat: QUAT });
		expect(below.heightM).toBe(-1.4);
		const above = anchorPoseToPin({ originLat: ORIGIN.lat, originLng: ORIGIN.lng, x: 0, y: 0.6, z: 0, quat: QUAT });
		expect(above.heightM).toBe(0.6);
	});

	it('quat passes through untouched and source is webxr', () => {
		const q = yawQuat(47);
		const pin = anchorPoseToPin({ originLat: ORIGIN.lat, originLng: ORIGIN.lng, x: 1, y: 0, z: 1, quat: q });
		expect(pin.quat).toBe(q);
		expect(pin.source).toBe('webxr');
	});
});

describe('round-trip property: anchorPoseToPin then geoToLocal is identity', () => {
	it('survives within 1e-6 for assorted offsets', () => {
		for (const [x, z] of [[0, 0], [2, -3], [-4, 1], [12, 12], [-7.5, -2.25], [0.1, -0.1]]) {
			const pin = anchorPoseToPin({ originLat: ORIGIN.lat, originLng: ORIGIN.lng, x, y: 0, z, quat: yawQuat(0) });
			const back = geoToLocal(ORIGIN.lat, ORIGIN.lng, pin.lat, pin.lng);
			expect(near(back.east, x, 1e-6)).toBe(true);   // east = +x
			expect(near(back.north, -z, 1e-6)).toBe(true); // north = −z
		}
	});
});
