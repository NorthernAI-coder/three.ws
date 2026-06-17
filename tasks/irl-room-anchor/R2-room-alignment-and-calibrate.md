# R2 — Cross-user room alignment + one-gesture room calibrate

> Epic R · Size **M** · Edits `src/irl.js`, `api/irl/pins.js`, `src/irl/room-anchor.js` (+ test).
> Depends on R1 (a room session exists). See `tasks/irl-room-anchor/README.md`.

## Goal

Make "shared at this location" **correct and honest** at room scale, and let an
owner **align an entire room with a single gesture** instead of nudging each
agent. When you arrive at a room someone placed, your phone aligns its local
frame to the room (compass north + your GPS offset from the origin) so the
cluster lands in front of you with its internal layout intact; if the whole
cluster is shifted a couple of metres from reality (GPS origin error), you grab
it and slide/rotate it onto its true spot **once**, moving every agent together.

## Why it matters

The room frame already guarantees exact *relative* geometry for everyone (R1 +
the engine). What's left is the *placement of the whole cluster in the viewer's
world* and the *cross-user agreement on north*. GPS gives the origin ±5–15 m and
compass gives north ±a few degrees, so without an alignment step the layout is
right but can sit a few metres off or rotated. Per-agent calibrate (already
shipped, A3) fixes one pin at a time — tedious and it can shear the layout.
Because every agent is rigidly tied to the origin, **calibrating the origin once
moves them all rigidly** — the correct, fast, layout-preserving tool.

## Current state (real symbols)

- **Render already aligns per-frame:** `pinWorldPos(pin)` →
  `roomOriginWorld(gpsState.lat, gpsState.lng, origin…)` + `agentWorldPosition`,
  recomputed in the `onGPSPosition` reprojection loop. So origin/viewer GPS and
  compass already drive the cluster; R2 adds the *correction* layer on top.
- **Per-pin calibrate (A3) shipped:** client gesture (long-press own agent →
  drag ±3 m / two-finger twist ±45° / height slider) → `PATCH /api/irl/pins`
  `{ id, deviceToken, calibrate:{ lat, lng, anchorYawDeg, anchorHeightM } }`,
  bounds-checked server-side (`handleCalibrate`, `CAL_MAX_MOVE_M=5`,
  `CAL_MAX_YAW_DEG=46`). Reuse this machinery, scoped to the origin.
- **Origin lives on every pin** (`origin_lat/lng`, `origin_yaw_deg`) — denormalized
  across the cluster, so a room calibrate is one `UPDATE … WHERE room_id = …`.

## What to build

### 1. Frame alignment on arrival (viewer side, `src/irl.js`)

- When the nearby read returns pins with a `room_id`, group them by room and
  treat each as a cluster sharing one origin. Rendering already uses the origin;
  ensure the **whole cluster is reprojected together** when the viewer's GPS
  origin blends (it is, via the loop — confirm room pins are included and not
  double-corrected during an active calibrate).
- **Compass-north alignment:** for a true-north room (`origin_yaw_deg === 0`),
  the viewer's live compass already aligns the frame — verify a room placed on
  one device renders on the correct bearings on another (two contexts / R5).
- **Relative-frame rooms** (`origin_yaw_deg !== 0`, placed without an absolute
  compass): the viewer cannot recover true north from GPS alone. Render using the
  stored `origin_yaw_deg` and **prompt a one-time "face the room's front and tap"
  alignment** so the viewer's frame is rotated to match. Down-weight/flag these
  (they're the `gyro-gps:rel` degradation path) and prefer absolute-compass rooms.

### 2. One-gesture room calibrate (the headline tool)

- **Enter room-calibrate** from the room badge/management sheet ("Align this
  room"). Show the whole cluster highlighted as one rig.
- **Drag** to translate the origin (N/E, bounded ±5 m to match server); **two-
  finger twist** to rotate the cluster about its origin (bounded ±45°); optional
  height. The whole cluster moves rigidly and live — reuse the A3 gesture math,
  applied to `roomOriginWorld` rather than a single pin.
- **Live readout** in honest units ("1.2 m N · 0.4 m E · 8°") and a confirm.

### 3. Server: room-scoped calibrate (`api/irl/pins.js`)

Add a PATCH branch, owner-gated and bounds-checked, that moves every pin in a
room the caller owns:

```jsonc
PATCH /api/irl/pins
{ "calibrateRoom": { "roomId": "living-room-7",
                     "dEastM": 1.2, "dNorthM": -0.4, "dYawDeg": 8 } ,
  "deviceToken": "<uuid>" }
```

- Resolve the new origin via the same geodesy (`localToGeo` / `room-anchor.js`);
  rotating the cluster about its origin re-derives each pin's absolute `lat/lng`
  from its unchanged `rel_east_m/rel_north_m` (`agentWorldPosition` /
  `localToTrueNorth` semantics) so the index stays consistent.
- **Bounds:** reuse `CAL_MAX_MOVE_M` / `CAL_MAX_YAW_DEG`; reject larger with the
  existing designed 422 codes. **Ownership:** every pin in the room must belong to
  the caller (`user_id` or `device_token`); deny otherwise — never move a stranger's
  agent. One `UPDATE … WHERE room_id = … AND <owner>` sets `origin_lat/lng/yaw`
  for the cluster; recompute and persist each pin's `lat/lng` so nearby reads stay
  correct. Add a unit test for the cluster-rotation math in `room-anchor.js`.

### 4. Honest confidence UI

- Keep the existing per-pin confidence ring; add a **room-level confidence**
  affordance (origin GPS accuracy) so users understand "the room is anchored to
  about ±N m — align it if it's off." Amber when loose; never imply cm precision.

## Definition of done

- A second device renders a placed room on the correct bearings/positions; a
  rotated/relative-frame room prompts the one-tap alignment and then matches.
- An owner aligns a whole room in one gesture; every agent moves rigidly and
  persists; a non-owner cannot; bounds enforced client + server with the existing
  422 codes. Cluster-rotation math unit-tested.
- No owner identifiers leak. `typecheck` clean, `npm test` green, `vite build`
  clean, no console noise. Changelog entry (tag `improvement`). On-device
  cross-user alignment handed to R5.
