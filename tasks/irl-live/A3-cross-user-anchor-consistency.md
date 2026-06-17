# IRL-Live A3 — Cross-user anchor consistency

**Epic A · Effort: L · Depends on:** A2 (pose schema), A1 + A4 (the two render paths it reconciles)

## Goal

Make **every** viewer see a placed agent in the **same** real-world spot. Align
each viewing device's compass heading and GPS to the stored pose, compensate for
GPS drift, and add a lightweight "nudge to calibrate" gesture: the owner (or a
trusted viewer) drags the agent a few centimetres / degrees and the corrected
pose re-saves for everyone. Be honest about GPS accuracy limits and lay the
explicit path to visual/VPS anchoring.

## Why it matters (user value)

Multiplayer is the whole point of IRL-Live: "anyone at the location sees
anyone's placed agent, live." If two phones disagree by 8 metres, the illusion
breaks and the social moment (meet at the agent, pay it, screenshot it) dies.
Cross-user consistency is what turns placed agents from a private AR toy into a
shared layer of the world.

## Current state (real files + lines)

- `src/irl.js` — every viewer already loads foreign pins (`loadNearbyPins`
  line 901) and positions them with `gpsToWorld()` (line 778), which is
  **relative to the viewer's own GPS origin** (`gpsState`, line 774). Heading is
  applied per-pin in `spawnNearbyPin` (line 955: `g.rotation.y = -(heading…)`).
  There is no compass-frame alignment between devices and no drift handling.
- A2 adds `anchor_height_m`, `anchor_yaw_deg`, `gps_accuracy_m`, `altitude_m`.
- `src/shared/state-kit.js` for the calibration affordance's states.

## What to build

### 1. Stored-pose frame alignment (read path)

When rendering a foreign pin, place it in the viewer's local frame from the
**stored absolute pose**, not the viewer's incidental heading:

```js
// gpsToWorld already maps lat/lng → local metres around the viewer.
const wp = gpsToWorld(pin.lat, pin.lng);
pin.group.position.set(wp.x, pin.anchor_height_m ?? 0, wp.z);
// Orientation is absolute compass yaw (stored), independent of viewer facing:
pin.group.rotation.y = -((pin.anchor_yaw_deg ?? pin.heading ?? 0) * Math.PI/180);
```

Because both the placing device and the viewer reference **absolute** compass
yaw (the client already prefers `deviceorientationabsolute`, `src/irl.js`
line 670) and a shared geodetic frame (lat/lng), the agent lands in the same
bearing for everyone. Use `anchor_height_m` so it sits on the floor, not at the
viewer's incidental eye height.

### 2. GPS drift compensation

GPS jitters frame-to-frame. Smooth the *viewer's* origin, not the pin, so pins
don't swim:

```js
// Low-pass the viewer origin; ignore fixes worse than the stored pin accuracy.
function blendOrigin(prev, fix) {
  if (fix.accuracy > 35) return prev;        // reject very noisy fixes
  const k = Math.min(0.4, 12 / fix.accuracy); // trust tighter fixes more
  return { lat: prev.lat + (fix.lat-prev.lat)*k, lng: prev.lng + (fix.lng-prev.lng)*k };
}
```

Render a **confidence ring** under each agent scaled by
`max(viewer_accuracy, pin.gps_accuracy_m)` so users *see* the uncertainty
instead of being misled into thinking it's centimetre-perfect.

### 3. "Nudge to calibrate" UI

A small, deliberate affordance — not free-drag (which would let anyone move
anyone's agent). Long-press a pin the device owns (or that the user placed →
`device_token`/`user_id` match) to enter calibrate mode:

```js
// Drag = horizontal nudge in metres; two-finger rotate = yaw nudge in degrees.
// Clamp to small corrections so this is calibration, not relocation.
const dLat = clamp(dragNorthM, -3, 3) / 110540;
const dLng = clamp(dragEastM,  -3, 3) / (111320*Math.cos(lat*Math.PI/180));
const newYaw = (storedYaw + clamp(rotateDeg, -45, 45) + 360) % 360;
// On release, re-save the corrected pose for everyone:
await fetch('/api/irl/pins', { method:'PATCH', credentials:'include',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ id, calibrate:{ lat:lat+dLat, lng:lng+dLng,
    anchorYawDeg:newYaw, anchorHeightM:newHeight } }) });
```

Extend the PATCH handler in `api/irl/pins.js` (currently caption-only,
lines 170–182) to accept a `calibrate` object **only** when
`user_id = session.id` (owner-gated; anonymous device-token owners may calibrate
their own via `device_token` match). Validate the nudge is within bounds server
side too (reject deltas > a few metres / 45°) so calibration can never be abused
to teleport an agent.

### 4. Honest accuracy + the VPS path

- Show a one-line note in the inspect/calibrate UI: "Position is GPS-accurate to
  ~Xm. Drag to fine-tune." using `pin.gps_accuracy_m`.
- Document the ceiling: consumer GPS is ~5–15 m open-sky, far worse in urban
  canyons / indoors — sub-metre cross-user agreement needs **visual positioning
  (VPS)**. A2 already reserved `vps_provider` / `vps_id`. The future path:
  capture a feature snapshot at placement, relocalize viewers against it, and
  store the VPS frame in those columns. Build the nudge + confidence ring now so
  the UX degrades gracefully until VPS lands. No coin is involved anywhere here.

### 5. Designed states

- **Low accuracy** (`gps_accuracy_m > 25`): amber confidence ring + "Find a spot
  with clearer sky for a tighter lock" tip — never silently misplace.
- **Calibration denied** (not owner): inline "Only the owner can calibrate this
  agent" via `errorStateEl`, no drag.
- **Save failed**: revert the nudge optimistically-undo + retry chip; never
  leave a half-applied local-only correction.

## Data / API changes

- `PATCH /api/irl/pins` accepts `{ id, calibrate: { lat, lng, anchorYawDeg,
  anchorHeightM } }`, owner-gated, server-side bounds-checked; updates the A2
  pose columns. No new table.

## Acceptance criteria

- [ ] Foreign pins render from stored absolute yaw + `anchor_height_m`, so two
      devices at the same place see the same bearing/floor position.
- [ ] Viewer GPS origin is low-pass smoothed; noisy fixes (>35 m) ignored; pins
      don't swim frame-to-frame.
- [ ] A confidence ring communicates real uncertainty from `gps_accuracy_m`.
- [ ] Long-press calibrate is owner-gated; nudge is clamped to small deltas and
      re-saves the pose for all viewers via PATCH.
- [ ] PATCH rejects out-of-bounds calibrate deltas and non-owners server-side.
- [ ] Accuracy is stated honestly in copy; VPS path documented and its reserved
      columns referenced, not faked.
- [ ] Low-accuracy / denied / save-failed states all designed.

## Out of scope

- Implementing an actual VPS provider (reserved columns only).
- Realtime propagation of a calibration to already-loaded viewers → that rides
  on **D1** realtime pin sync; here a re-fetch suffices.

## Verify

- Two phones at one location: place on phone A, confirm phone B shows the agent
  in the same real spot and bearing (within the displayed accuracy ring).
- Calibrate-nudge on the owner phone, re-fetch on the other → corrected pose.
- Attempt calibrate from a non-owner device → blocked client + 403/404 server.
- Indoors / urban canyon: confidence ring widens, copy warns; agent still
  placed, just honestly uncertain.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/A3-cross-user-anchor-consistency.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
