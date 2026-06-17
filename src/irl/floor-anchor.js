// @ts-check
// Pure floor-anchor math for /irl WebXR placement.
//
// Why this exists
// ───────────────
// When you place an agent on the floor with WebXR (immersive-ar), the hit-test
// gives you an anchored pose in the session's LOCAL frame: metres from the
// eye-level origin the session started at, plus the surface's orientation as a
// quaternion. To make that placement durable and shareable we must turn that
// local pose into a GPS pin — a lat/lng + a compass heading the renderer can
// reload and re-place for any viewer.
//
// That conversion is just two pieces of math: a horizontal metre-offset →
// lat/lng projection, and a quaternion → yaw-degrees extraction. The projection
// is the SAME one room-anchor.js already exports and unit-tests; duplicating its
// metre-per-degree constants on this write path is exactly how a sign error
// ships silently and lands every saved anchor in the wrong spot for every viewer.
// So this module reuses room-anchor's localToGeo and owns only the quaternion
// math — no DOM, no Three.js, no I/O, plain numbers in/out so the test suite can
// verify it directly.
//
// Coordinate conventions — IDENTICAL to src/irl.js and room-anchor.js, do not drift:
//   World:   North = −Z · East = +X · Y = up · 1 unit = 1 metre.
//   Yaw:     degrees 0–359 clockwise from the local −Z axis (what savePin stores
//            and spawnNearbyPin reads back).

import { localToGeo } from './room-anchor.js';

/**
 * Yaw (rotation about world Y) in degrees, clockwise from the local −Z axis —
 * the same convention savePin stores and spawnNearbyPin reads back. Raw output
 * is the atan2 range (−180, 180]; callers normalise to [0,360) when persisting.
 * @param {number} x quaternion x
 * @param {number} y quaternion y
 * @param {number} z quaternion z
 * @param {number} w quaternion w
 * @returns {number} yaw in degrees, in (−180, 180]
 */
export function yawDegFromQuat(x, y, z, w) {
	const siny = 2 * (w * y + z * x);
	const cosy = 1 - 2 * (y * y + x * x);
	return Math.atan2(siny, cosy) * 180 / Math.PI;
}

/**
 * Anchored local-space pose (metres from the eye-level session origin) → the GPS
 * pin to persist. Reuses room-anchor's localToGeo so there is ONE projection and
 * one set of metre-per-degree constants for both the read and write paths.
 *
 * The session frame uses the same axes as the world: +X = east, −Z = north. So
 * the local x passes straight through as east, and we pass −z as north.
 *
 * @param {object} p
 * @param {number} p.originLat  GPS latitude of the session origin (the viewer's fix)
 * @param {number} p.originLng  GPS longitude of the session origin
 * @param {number} p.x  local east offset (metres, +X)
 * @param {number} p.y  local height offset (metres, +Y up) — negative = below eye level
 * @param {number} p.z  local south offset (metres, +Z); world north is −Z
 * @param {[number, number, number, number]} p.quat  surface orientation [x,y,z,w]
 * @returns {{ lat:number, lng:number, heading:number, heightM:number, quat:[number,number,number,number], source:'webxr' }}
 */
export function anchorPoseToPin({ originLat, originLng, x, y, z, quat }) {
	const { lat, lng } = localToGeo(originLat, originLng, /* east */ x, /* north */ -z);
	const heading = ((Math.round(yawDegFromQuat(quat[0], quat[1], quat[2], quat[3])) % 360) + 360) % 360;
	return {
		lat,
		lng,
		heading,
		heightM: y, // floor height relative to the eye-level session origin (negative = below)
		quat,
		source: 'webxr',
	};
}
