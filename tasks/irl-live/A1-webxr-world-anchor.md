# IRL-Live A1 — WebXR world anchor (hit-test reticle + XRAnchor)

**Epic A · Effort: L · Depends on:** A2 (anchor pose schema)

## Goal

On WebXR-capable devices (primarily Android Chrome), let the user tap a real
floor point through a hit-test reticle to anchor the placed agent there. The
agent is bound to an `XRAnchor` so it stays glued to that world point as the
phone moves — no drift, no camera-relative slide. If WebXR is absent (iOS
Safari), defer cleanly to the gyro+GPS fallback in **A4**.

## Why it matters (user value)

Tap-to-place today (`spawnNearbyPin` / GPS-derived world position) jitters with
GPS noise and is camera-relative until locked. A real WebXR anchor makes the
agent sit on the actual floor where the user pointed — the difference between a
floating sticker and an agent that *belongs* in the room. This is the bar set by
Pokémon GO / Niantic Lightship; we should meet it where the hardware allows.

## Current state (real files + lines)

- `src/ar/webxr.js` — `WebXRSession` already runs `immersive-ar` with
  `requiredFeatures: ['hit-test']`, follows a hit-test surface in `_tick()`
  (lines 124–134), and anchors on first `select` by flipping `this._anchored`
  (`_handleSelect`, line 140). It does **not** create a real `XRAnchor`, draw a
  reticle, or report the anchored pose back for persistence.
- `src/irl.js` — IRL uses gyro+GPS only; it never calls `navigator.xr`.
  `arActive` (line 185), `gpsToWorld()` (line 778), `setLocked()` (line 682).
- `src/shared/state-kit.js` — `errorStateEl`, `emptyStateEl` for designed
  unsupported / permission states.

## What to build

### 1. Capability detect + entry button (`src/irl.js`)

Add a WebXR path alongside the existing camera button. Gate on real support, not
UA sniffing:

```js
import { WebXRSession } from './ar/webxr.js';
const xrSupported = await WebXRSession.isSupported(); // navigator.xr immersive-ar
if (xrSupported) {
  anchorBtn.hidden = false;          // "Place on floor" entry
} else {
  // No WebXR → A4 gyro+GPS lock is the anchor path. Leave the Pin button as-is.
}
```

### 2. Reticle + real XRAnchor (`src/ar/webxr.js`)

Extend `WebXRSession` with a ring reticle that tracks the hit-test surface, and
on `select` create a persistent anchor instead of just setting a flag:

```js
// In start(): build a thin TorusGeometry ring, add to scene, hide until a hit.
async _handleSelect(/* event */) {
  if (!this._latestHit) return;
  // Real anchor — survives small tracking corrections the raw pose does not.
  this._anchor = await this._latestHit.createAnchor?.(); // feature-detect
  this._anchored = true;
  this._reticle.visible = false;
  this._onAnchored?.(this._readAnchorPose()); // hand pose to A2 persistence
}
```

In `_tick()`, when anchored, drive `viewer.content` from the live anchor pose
each frame so it stays glued as the camera moves:

```js
if (this._anchor && frame) {
  const pose = frame.getPose(this._anchor.anchorSpace, this._localSpace);
  if (pose) viewer.content.matrix
    .fromArray(pose.transform.matrix), viewer.content.matrix.decompose(
      viewer.content.position, viewer.content.quaternion, viewer.content.scale);
}
```

Request `anchors` in optional features so devices without it still run:
`optionalFeatures: ['anchors', 'dom-overlay']`. If `createAnchor` is missing,
fall back to the existing hit-pose-follow (already implemented at lines 124–134)
— degraded but never broken.

### 3. Convert anchor pose → GPS pin (bridge to A2)

The reticle hit gives a *local* XR pose (metres from session origin). Convert
the horizontal offset to a GPS pin using the same metre-per-degree math IRL
already uses in `setLocked()` (lines 714–717), and capture the extra pose
fields A2 adds:

```js
const { position, quaternion } = anchorPose; // local-space, metres
const mLat = 110540, mLng = 111320 * Math.cos(gpsState.lat * Math.PI/180);
const pinLat = gpsState.lat + (-position.z / mLat);
const pinLng = gpsState.lng + ( position.x / mLng);
savePin(pinLat, pinLng, headingFromQuat(quaternion), caption, {
  anchorHeightM: position.y,          // floor height vs eye origin
  anchorYawDeg:  yawFromQuat(quaternion),
  gpsAccuracyM:  gpsState.accuracy,   // from watchPosition coords.accuracy
  altitudeM:     gpsState.altitude ?? null,
}); // extra-pose object consumed by A2's savePin signature
```

### 4. Designed states

- **Unsupported** (no WebXR): show nothing broken — the existing Pin button +
  A4 still work. Optionally a one-line chip "Floor anchoring unavailable on this
  browser — using compass lock."
- **Permission denied / session failed**: `errorStateEl({ title: 'Camera AR
  couldn't start', body, actions:[{label:'Retry'}] })`; never a blank canvas.
- **Searching for surface**: reticle hidden + status "Point at the floor and
  move your phone slowly." (real hit-test state, no fake spinner).

## Data / API changes

No new endpoint. `savePin()` (A2) gains an optional 5th arg carrying anchor pose
fields; POST body in `api/irl/pins.js` (A2) accepts them. Reads back via the
existing nearby-pins GET.

## Acceptance criteria

- [ ] `WebXRSession.isSupported()` gates the floor-anchor entry; iOS Safari
      never sees it and silently uses A4.
- [ ] A ring reticle tracks the real floor and hides once anchored.
- [ ] First tap creates a real `XRAnchor` (feature-detected); agent stays glued
      to that world point as the phone moves/walks.
- [ ] Devices without `createAnchor` fall back to hit-pose-follow — no error.
- [ ] Anchor pose is converted to a GPS pin and persisted via A2 (height, yaw,
      gps accuracy captured).
- [ ] Unsupported / permission-denied / searching states all designed via
      `state-kit.js`; no blank or frozen screen.
- [ ] No console errors; exiting AR restores the pre-AR transform (already in
      `_handleEnd`).

## Out of scope

- Cross-user pose agreement and nudge calibration → **A3**.
- iOS gyro dead-reckoning → **A4**.
- Visual/VPS relocalization → noted as future in A3.

## Verify

- Android Chrome on a real phone: enter, see reticle on floor, tap, walk a metre
  in each direction — agent holds its spot. Reload, confirm the pin reloads near
  the same place via nearby GET.
- Toggle airplane mode mid-session → error state with Retry, not a freeze.
- iOS Safari: floor-anchor entry absent; Pin (A4) still works.
- Desktop Chrome (no XR): `isSupported()` false, no entry, no console noise.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/A1-webxr-world-anchor.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
