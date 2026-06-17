# R3 — WebXR floor-anchor precision refine (Android) + graceful iOS fallback

> Epic R · Size **M** · Edits `src/irl.js`, `src/ar/webxr.js`. Depends on R1.
> See `tasks/irl-room-anchor/README.md`. This is the precision layer — optional
> per device, never required.

## Goal

Where the device supports WebXR (Android Chrome), use **real AR plane detection**
to place and refine room agents on the actual floor with centimetre precision —
a hit-test reticle on the real ground, tap to drop — and bind that precision to
the room frame so it survives. On iOS Safari (no `immersive-ar`) and any
unsupported device, **fall back cleanly** to the R1 gyro+GPS aim flow with zero
console noise and no dead buttons.

## Why it matters

Gyro+GPS + the room frame already nails the *layout* and the turn-to-see feel.
WebXR adds what only on-device SLAM can: the agent's feet on the real floor at
the real spot, stable as you walk around it. Doing this as a *refinement layer*
(not a replacement) is what makes the system "every option, fused" — best
available precision per device, graceful everywhere else.

## Current state (real symbols)

- **WebXR session module exists:** `src/ar/webxr.js` (floor-anchor / hit-test
  session). `src/irl.js` has `detectFloorAnchorSupport()` (reveals the entry only
  when `immersive-ar` + hit-test are available — iOS never sees it) and a
  `persistFloorAnchor(pose)` path that converts an `XRAnchor` placement into a
  durable pin, including a `_pendingXrAnchorPose` deferral until the first GPS fix
  lands. Placement pose is tagged `anchor_source: 'webxr'` (A1).
- **Room engine** (R1): `placeAround`, `pinWorldPos`, room session `activeRoom`.
- **Reserved DB columns:** `anchor_quat` (JSONB `[x,y,z,w]`), `anchor_source`,
  `vps_provider`/`vps_id` (reserved) already exist on `irl_pins`.

## What to build

### 1. WebXR placement writes the room frame

- In room mode on a WebXR-capable device, the floor hit-test reticle replaces (or
  augments) the R1 distance slider: the reticle rides the detected floor; tap to
  drop the agent there.
- Convert the hit pose to a **room-relative offset**: take the XR-space position
  relative to the established room origin and express it as `relEast/relNorth`
  (+ `anchor_height_m` from the real floor height) so it persists in the room
  exactly like a gyro placement — same `room` block, `anchor_source: 'webxr'`,
  and store the orientation `quat`. The agent then renders for *all* viewers via
  the same `pinWorldPos` path; WebXR only improved *where* it was captured.
- If the room origin itself was established under WebXR, record the floor height /
  quat on the origin so R2's alignment starts from a better anchor.

### 2. Per-device refine

- On a WebXR device viewing an existing room, offer "refine on floor": re-run a
  hit-test for the agent the user is looking at and update its `rel_*`/height via
  the room-aware PATCH (reuse R2's calibrate path, bounds still enforced). This
  sharpens the local view without changing the shared origin unless the owner
  also calibrates the room (R2).

### 3. Graceful fallback (the non-negotiable half)

- iOS Safari / unsupported: `detectFloorAnchorSupport()` already hides the entry —
  confirm room mode silently uses the R1 gyro+GPS aim flow, **no WebXR button, no
  console errors, no "unsupported" toast**. The room a WebXR device created still
  renders perfectly on iOS via the room frame (that's the point of storing
  `rel_*`, not raw XR space).
- Session loss / hit-test unavailable mid-placement: drop back to the slider flow
  with a one-line, designed notice; never strand the user.

## Definition of done

- On Android Chrome, a user drops a room agent on the real floor via hit-test; it
  persists as a room pin (`anchor_source: 'webxr'`, height + quat stored) and
  renders for everyone via the shared frame.
- On iOS Safari, the same room renders correctly and placement uses the R1 flow
  with zero WebXR references and zero console noise.
- "Refine on floor" sharpens a single agent via the bounds-checked PATCH without
  corrupting the shared origin.
- `typecheck` clean, `npm test` green, `vite build` clean. Changelog entry (tag
  `feature`). On-device WebXR + iOS-fallback matrix handed to R5.
