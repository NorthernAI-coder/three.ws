# IRL-Live A4 — iOS gyro + GPS world-lock fallback

**Epic A · Effort: M · Depends on:** A2 (pose schema) · pairs with A1 for full device coverage

## Goal

On iOS Safari — which has **no WebXR** — world-lock the placed avatar using gyro
orientation plus GPS dead-reckoning. When locked, the avatar's world transform is
fixed at its GPS+pose anchor; the camera's rotation (`cameraYaw`/`cameraPitch`
from `onDeviceOrientation`) and GPS translation drive the *view*, so the avatar
**stays in its real spot** when the user pans the phone or walks, instead of
following the camera.

## Why it matters (user value)

iOS Safari is the single biggest slice of mobile traffic and gets zero WebXR.
Without a solid fallback, half the audience sees a floating, camera-glued avatar
— the exact thing IRL-Live exists to fix. This task makes the iPhone experience
feel anchored too, so "anyone at the location" genuinely includes iPhone users.
(See the `ios-safari-desktop-fallback` memory note — iOS Safari quirks are real;
design for them.)

## Current state (real files + lines)

- `src/irl.js` already has most of the machinery:
  - `onDeviceOrientation()` (line 654) converts gyro alpha/beta deltas into
    `cameraYaw`/`cameraPitch` once locked, preferring `deviceorientationabsolute`
    (line 670).
  - `setLocked(next)` (line 682) requests iOS motion permission
    (`DeviceOrientationEvent.requestPermission`, line 684), captures a gyro
    baseline, derives a GPS pin from `avatarRig.position` (lines 714–717), sets
    `gpsModeActive` (line 718), and saves via `openCaptionPanel` → `savePin`.
  - `gpsToWorld()` (line 778) maps lat/lng → local metres around the viewer.
  - `tick()` GPS-mode branch (lines 1352–1366): camera sits at
    `(0, EYE_HEIGHT, 0)`, rotation driven by `cameraYaw/Pitch`; the avatar is
    re-positioned from its GPS pin in `onGPSPosition` (lines 803–806).
- **Gap:** the avatar's anchor doesn't use A2's `anchor_height_m`/`anchor_yaw_deg`,
  GPS translation isn't applied to the *locked own* avatar as the user walks, and
  there is no designed state when motion permission is denied or absolute
  heading is unavailable.

## What to build

### 1. Fix the avatar to a full pose anchor, not just lat/lng

When `setLocked(true)` on iOS, store the same A2 pose the WebXR path stores so
the placement is reproducible and consistent with A1/A3:

```js
const headingDeg = ((cameraYaw * 180/Math.PI) % 360 + 360) % 360;
savePin(pinLat, pinLng, headingDeg, caption, {
  heightM: 0,                 // avatar feet on ground plane (y=0 in IRL scene)
  yawDeg:  headingDeg,
  gpsAccuracyM: gpsState.accuracy,
  altitudeM:    gpsState.altitude ?? null,
  source: 'gyro-gps',
});
```

Keep the existing `avatarYaw = -(headingDeg…)` snap (line 725) so the locked
avatar faces the stored bearing — matching how `spawnNearbyPin` rotates foreign
avatars (A3 §1).

### 2. Camera-relative → world-relative while locked

The view must update from the device, leaving the avatar planted. The GPS-mode
camera branch already does the rotation half (lines 1352–1366). Add the
**translation** half so walking moves the *camera through the world*, not the
avatar:

```js
if (gpsModeActive && avatarLocked && arActive) {
  // Avatar stays at its anchored GPS world point (set in onGPSPosition).
  const me = gpsToWorld(gpsState.lat, gpsState.lng); // viewer's live position
  camera.position.set(me.x, EYE_HEIGHT, me.z);       // walk = camera moves
  camera.rotation.order = 'YXZ';
  camera.rotation.y = cameraYaw;   // pan = gyro yaw
  camera.rotation.x = -cameraPitch;
  camera.rotation.z = 0;
  // camLookCurrent recomputed from yaw/pitch as today (lines 1362–1366)
}
```

The locked avatar's world position is already refreshed from its GPS pin each
fix (`onGPSPosition`, lines 803–806). Net effect: pan the phone → avatar slides
across the frame to stay on its real bearing; walk toward it → it grows and
holds its spot. Apply `anchor_height_m` to the avatar's `y` for floor-correct
placement on slopes/indoors.

### 3. Heading-frame correctness

Dead-reckoning is only consistent across users if yaw is **absolute** (compass),
not page-relative. Track which source fired:

```js
// prefersAbsOrientation already set (line 671). If only relative is available,
// the agent still locks locally but cross-user bearing (A3) degrades — flag it.
if (!prefersAbsOrientation) {
  setStatus('Compass heading unavailable — others may see this agent rotated',
            { warn: true });
}
```

Store the absolute-vs-relative distinction so A3 can weight it (reuse
`anchor_source = 'gyro-gps'`; optionally append `:rel` when only page-relative).

### 4. Designed states (the iOS-critical ones)

- **Motion permission denied** (`requestPermission()` ≠ 'granted', line 687):
  already sets an error status — upgrade to an `errorStateEl` with a "How to
  enable Motion & Orientation in Settings > Safari" action; the lock must not
  silently no-op.
- **GPS not ready** (`!gpsState.ready`): the lock currently still flips on but
  has no anchor — show "Waiting for location to pin precisely…" and defer the
  save until the first fix, rather than pinning at a default origin.
- **No absolute compass**: warn as in §3; still allow the lock (local view works).
- **Permission re-grant**: a tap on the locked state re-runs
  `requestPermission()` so a user who declined can recover without reload.

## Data / API changes

None new. Uses A2's `savePin(…, anchor)` signature + pose columns. No coin
referenced anywhere.

## Acceptance criteria

- [ ] On iOS Safari, locking pins the avatar; panning the phone leaves it on its
      real-world bearing (it does **not** follow the camera).
- [ ] Walking moves the camera through the world; the locked avatar grows/holds
      its spot rather than translating with the user.
- [ ] Placement persists the A2 pose (`yawDeg`, `gpsAccuracyM`, `source`),
      consistent with A1/A3.
- [ ] `anchor_height_m` is applied so the avatar sits on the ground plane.
- [ ] Motion-permission-denied, GPS-not-ready, and no-absolute-compass states
      are all designed and recoverable (re-tap re-requests permission).
- [ ] Absolute-vs-relative heading distinction recorded for A3 weighting.
- [ ] No console errors; unlocking restores normal follow camera (existing path).

## Out of scope

- WebXR floor anchoring (Android) → **A1**.
- Cross-user reconciliation + nudge calibration → **A3** (this task only ensures
  the iOS placement *produces* a correct, consistent pose to reconcile).

## Verify

- Real iPhone (Safari), not headless WebKit (the memory note: the iOS layout/
  sensor quirks only repro on device): lock, pan ±90° → avatar holds its spot;
  walk 3 m toward it → it enlarges and stays put.
- Decline the motion prompt → designed error with Settings guidance; re-tap →
  re-prompts.
- Lock before first GPS fix → "Waiting for location…", then auto-pins on fix.
- Confirm the saved row has `anchor_source='gyro-gps'` and a real
  `gps_accuracy_m`.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/A4-ios-gyro-anchor-fallback.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
