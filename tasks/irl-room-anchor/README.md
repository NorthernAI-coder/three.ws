# Epic R — IRL Room Anchoring (shared, room-scale, world-locked agents)

Ship the ability to **pin 3D AI agents to fixed spots in a real room** — place an
agent on the couch to your right, three behind you, nothing on the left wall —
so that with the camera on you only see each agent when you physically turn to
face its spot, exactly like a person sitting there. The layout is identical for
everyone who opens `/irl` at that location.

This epic finishes a feature whose **engine is already built, committed, and
green** (commit `7bf9cecf`). What remains is the authoring UX, cross-user
alignment, the precision layer, production hardening, and on-device QA.

The bar for this epic is the user's words: **100% production-ready, zero error,
shipped complete, professional, best-possible UX.** A task is not done until its
Definition of done is fully met in the running app — not "written," *met*.

---

## Why room-scale needs its own frame (the core idea)

Consumer GPS is accurate to ~5–15 m. At city scale that's fine; at **room
scale it is useless** — your couch (3 m right) and your wall (3 m left) are well
inside the same GPS noise, so per-agent GPS lets a layout smear and even swap
sides, and it differs phone-to-phone. The fix, already implemented:

- **GPS is the index, not the precision.** It only decides which room you load
  and roughly places the cluster in the world. It never positions an agent.
- **Compass is the shared north reference** so two phones agree on the frame
  without a visual scan.
- **Each agent stores an EXACT offset (metres east/north) from one shared room
  origin.** Relative geometry is therefore exact and identical for everyone — GPS
  noise translates the whole cluster together, never smears it internally — so
  you **calibrate the room once**, not each agent.
- **WebXR floor anchors / a manual nudge refine** the origin where the device can.

This is the same layered, graceful-degradation model the best AR systems use
(Niantic VPS, ARCore Geospatial). We do every layer and fall back cleanly.

---

## Already built — DO NOT rebuild (commit `7bf9cecf`)

Read these before writing anything; build on them, match their conventions.

- **Pure math core — `src/irl/room-anchor.js`** (16 unit tests in
  `tests/irl-room-anchor.test.js`). Coordinate conventions match `src/irl.js`
  exactly: **North = −Z · East = +X · Y up · 1 unit = 1 m**; compass bearing
  0–359° clockwise from north; world yaw = `−(deg·π/180)`. Exports:
  `geoToLocal`, `localToGeo`, `bearingDistanceToLocal`, `localToBearingDistance`,
  `localToTrueNorth`, `roomOriginWorld`, `agentWorldPosition`, `compassToYaw`,
  `placeAround`. **Use these; do not re-derive geodesy.**
- **Persistence + API — `api/irl/pins.js`.** Six columns on `irl_pins`:
  `room_id, rel_east_m, rel_north_m, origin_lat, origin_lng, origin_yaw_deg`
  (inline `ALTER TABLE … ADD COLUMN IF NOT EXISTS`; partial index `irl_pins_room`).
  POST accepts an optional `room` block (contract below), validates/clamps
  (`ROOM_ID_RE = /^[a-z0-9-]{1,64}$/`, `REL_MAX_M = 500`, null-island origin
  rejected) and falls back to a standalone pin if invalid. The nearby + bbox
  SELECTs and the projection carry the room columns to viewers **without leaking
  owner identity**. Covered by `tests/api/irl-pins-room.test.js` (5 tests).
- **Viewer render path — `src/irl.js`.** `pinRoom(pin)` normalizes the room
  fields; `pinWorldPos(pin)` resolves a room pin through its shared origin
  (`roomOriginWorld` + `agentWorldPosition`) and falls back to absolute GPS for a
  standalone pin. Wired into `spawnNearbyPin` and the `onGPSPosition`
  reprojection loop. DEV harness: `window.__irlSeedRoom()` lays the canonical
  couch-right / three-behind / wall-left scene; `window.__irlRoomCheck()` asserts
  the world sides.

The turn-to-see behaviour itself (camera passthrough, gyro/compass-driven camera,
frozen-camera world-lock, A3 absolute-bearing anchoring) **already shipped** —
see `src/irl.js` `onDeviceOrientation`, `anchorGpsPin`, `setLocked`. Rooms ride
that machinery; you are adding the authoring + alignment layers on top.

---

## Delivery path: REST proximity read, NOT realtime

The IRL realtime room (`irl_world`) was deliberately reduced to **presence +
reactions only**; pins no longer sync over the socket (privacy — no broadcasting
a browseable GPS roster of a ~1 km cell). **Shared rooms are delivered by the
per-viewer `GET /api/irl/pins` proximity read + poll fallback**, which already
carries the room fields. Do not re-introduce a pin broadcast. R4 reconciles the
now-dormant realtime additions (`IrlPin` schema fields, `irl-net` relay,
`normalizeStreamPin` room fields) — keep them dormant/forward-compatible or
remove them; never leave dead code that implies a live pin stream.

---

## The POST `room` contract (stable — build against it)

```jsonc
POST /api/irl/pins
{
  "lat": 37.7749, "lng": -122.4194,   // absolute coord (GPS index + legacy); the
                                       // client computes it via placeAround()
  "heading": 270,                      // agent facing, compass deg (relYawDeg)
  "avatarUrl": "/api/avatars/…glb",
  "avatarName": "Scout",
  "deviceToken": "<uuid>",
  "agentId": "<id|null>",
  "anchor": { "heightM": 0, "yawDeg": 270, "source": "gyro-gps" }, // A2 pose
  "room": {                            // OPTIONAL — present to anchor into a room
    "id": "living-room-7",             // slug, ^[a-z0-9-]{1,64}$ (client-derived)
    "originLat": 37.7749,              // shared room origin (first placement's GPS)
    "originLng": -122.4194,
    "originYawDeg": 0,                  // 0 = true-north-aligned (compass calibrated)
    "relEast": 3.0,                    // metres east of origin (clamped ±500)
    "relNorth": 0.0                    // metres north of origin
  }
}
```

Compute the `room` values with `placeAround({ originLat, originLng, viewerLat,
viewerLng, bearingDeg, distM, faceViewer })` — it returns `{ relEast, relNorth,
relYawDeg, lat, lng }`. Send `lat/lng` from its result, `heading = relYawDeg`,
and the `room` block. An invalid block silently degrades to a standalone pin, so
always send a valid one in room mode.

---

## Build order

1. **R1 — Place agents around me** (authoring UI). The user-facing core; nothing
   ships without it.
2. **R2 — Room alignment + one-gesture calibrate** (makes "shared at location"
   correct and honest).
3. **R3 — WebXR floor-anchor refine** (the precision layer; Android, iOS falls
   back cleanly).
4. **R4 — Production hardening + cleanup** (every state, a11y, perf, security,
   dead-code/realtime reconcile, console-clean, changelog, Definition-of-done sweep).
5. **R5 — On-device QA** (the verification protocol; this is what proves "done").

R1 is the gate. R2–R3 can proceed in parallel once R1's room session exists.
R4 + R5 run last, over the whole surface.

---

## Invariants every task must honour

- **Coordinate conventions** (above) are law; reuse `room-anchor.js`, never
  re-derive. Add a unit test for any new pure helper.
- **No mocks, no fake data, no placeholders, no `setTimeout` fake progress, no
  TODOs, no commented-out code.** Real APIs, real async, every path wired
  (CLAUDE.md hard rules). Errors handled at boundaries; ship working fallbacks.
- **$THREE is the only coin.** Never name, hardcode, or render any other token in
  code, copy, fixtures, or tests. CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.
- **Privacy holds:** never surface another owner's `user_id`/`device_token`; keep
  the bbox feed internal-only; never broadcast a pin roster.
- **Concurrent worktree:** other agents edit `src/irl.js`, `api/irl/pins.js`,
  `multiplayer/*` on `main` simultaneously. Stage **explicit paths only** (never
  `git add -A`), re-check `git status`/`git diff --staged` right before any
  commit, and watch for `__defProp`/`createRequire` bundle clobber in `api/*`.
- **Definition of done (every task):** code written + wired + reachable in the UI;
  every state designed (loading skeleton / empty / error / populated / overflow);
  hover/active/focus + keyboard + ARIA on interactive elements; `npm run
  typecheck` clean; `npm test` green (single-worker if cross-file mock-bleed
  appears — see `tests/api/irl-pins-room.test.js` for the `vi.resetModules()`
  pattern); `vite build` clean; no console errors/warnings from our code;
  on-device behaviour verified per R5 (or explicitly flagged as the one
  post-deploy step); changelog entry appended once user-visible; `git diff`
  self-reviewed line-by-line.

When this epic is genuinely shipped and verified, delete these files
(`git rm tasks/irl-room-anchor/*`) per `tasks/CLEANUP-PLAN.md`.
