# 01 — Pure floor-anchor math + unit tests

> Epic IRL/floor-anchor · Size **S** · Foundation — run first.
> Mirrors the pure-policy pattern of [src/irl/room-anchor.js](../../src/irl/room-anchor.js)
> and its test [tests/irl-room-anchor.test.js](../../tests/irl-room-anchor.test.js).

## Goal

Make the math that turns an anchored XR pose into a durable GPS pin **pure,
shared, and unit-tested**. Today it is hand-rolled inline inside the host with
duplicated constants and zero test coverage — the one part of the feature whose
correctness silently determines whether a saved pin reloads where the user tapped.

## Why it matters

`persistFloorAnchor` re-derives metres-per-degree and a yaw-from-quaternion by
hand. The same projection already exists, unit-tested, in `room-anchor.js`. Two
copies drift; an untested copy on the *write* path means a sign error ships
silently and every saved anchor lands in the wrong place for every viewer. A pure
module with tests is the cheapest possible insurance and unblocks confident edits
in tasks 02/05/07.

## Current state (real lines)

- [src/irl.js:1631-1635](../../src/irl.js#L1631-L1635) `yawFromQuat(q)` — quaternion
  → yaw degrees, hand-rolled, untested.
- [src/irl.js:1658-1664](../../src/irl.js#L1658-L1664) `persistFloorAnchor` hand-rolls
  `mLat = 110540`, `mLng = 111320 * cos(lat)`, then
  `pinLat = lat + (-position.z / mLat)`, `pinLng = lng + (position.x / mLng)`.
- [src/irl/room-anchor.js:46-73](../../src/irl/room-anchor.js#L46-L73) already exports
  `M_PER_DEG_LAT`, `mPerDegLng(lat)`, `geoToLocal`, `localToGeo` — the exact same
  projection, with the exact same axis convention (`north = −Z`, `east = +X`).
- Convention comment to preserve: [src/irl/room-anchor.js:34-38](../../src/irl/room-anchor.js#L34-L38).

## What to build

### 1. A pure module — `src/irl/floor-anchor.js`

No DOM, no Three.js, no I/O — plain numbers in/out, exactly like `room-anchor.js`.

```js
// yaw (deg, 0–359, clockwise from local −Z) from a quaternion's (x,y,z,w).
export function yawDegFromQuat(x, y, z, w) { /* move src/irl.js:1631 here, normalized 0–359 */ }

// Anchored local-space pose (metres from the eye-level session origin) → the GPS
// pin to persist. Reuses room-anchor's localToGeo so there is ONE projection.
// localX = +east, localZ = +north-ish but world north = −Z, so pass −z as north.
export function anchorPoseToPin({ originLat, originLng, x, y, z, quat }) {
  const { lat, lng } = localToGeo(originLat, originLng, /*east*/ x, /*north*/ -z);
  const heading = ((Math.round(yawDegFromQuat(...quat)) % 360) + 360) % 360;
  return { lat, lng, heading, heightM: y, quat, source: 'webxr' };
}
```

Import `localToGeo` from `./room-anchor.js`. Keep the `heightM` sign note from
[src/irl.js:1670](../../src/irl.js#L1670) (negative = below eye level) in a comment.

### 2. Rewire the host to the module

In [src/irl.js](../../src/irl.js): delete the inline `yawFromQuat` and the
hand-rolled `mLat`/`mLng` block; have `persistFloorAnchor` call
`anchorPoseToPin({ originLat: gpsState.lat, originLng: gpsState.lng, x: position.x,
y: position.y, z: position.z, quat: [q.x,q.y,q.z,q.w] })` and forward the result
straight into the existing `savePin(... { heightM, yawDeg, quat, source })` call.
Behaviour must be **identical** — this is a pure extraction, not a redesign.

### 3. Tests — `tests/irl-floor-anchor.test.js`

Mirror [tests/irl-room-anchor.test.js](../../tests/irl-room-anchor.test.js):

- `yawDegFromQuat`: identity quat → 0; 90°/180°/270° yaw quats → 90/180/270;
  output always in `[0,360)`.
- `anchorPoseToPin`: a pose `+2 m east / +3 m north` of a known origin round-trips
  through `geoToLocal` back to ~`(2, 3)` (sign sanity — catches the `−z` mistake);
  `heightM` passes through unchanged; `source === 'webxr'`.
- Round-trip property: `anchorPoseToPin` then `geoToLocal` is identity within 1e-6.

## Acceptance checklist

- [ ] `src/irl/floor-anchor.js` is pure (no `import 'three'`, no DOM) and reuses
      `room-anchor.js`'s projection — no duplicated metre-per-degree constants.
- [ ] `persistFloorAnchor` produces byte-identical `savePin` args vs. before.
- [ ] `tests/irl-floor-anchor.test.js` passes; covers yaw, sign, height, round-trip.
- [ ] `npm test` green; `npm run typecheck` clean if the file opts into `// @ts-check`.

## Out of scope

Orientation *replay* on render-back (that's 02). This task only makes the **write**
path pure and tested; it does not change what the viewer does with the stored quat.

## Verify

`npm test -- irl-floor-anchor` passes. Then `npm run dev` → place a floor anchor
on a WebXR device (or the 07 harness) and confirm the saved pin's `lat/lng/heading`
match the pre-refactor values for the same tap.
