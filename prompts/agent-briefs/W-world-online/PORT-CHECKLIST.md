# Port Checklist — bring `/walk` + `world.three.ws` systems into `/play`

> Companion to [W00-program-overview.md](W00-program-overview.md). This is the concrete,
> dependency-ordered work list for closing the gap between `/play` (the isometric Coin
> Communities plaza) and the two richer surfaces we already run: `/walk` (in-repo three.js +
> Rapier + Colyseus) and `world.three.ws` (hosted Hyperfy).
>
> **Reuse-first is mandatory.** Almost everything below already exists in the repo and is
> wired into `/walk` only — or is built but orphaned. The job is to *lift and wire*, not
> reinvent. Do not switch engines. Do not build a second world client.

---

## Ground truth (verified in-repo, 2026-06-11)

- `/play` = [src/game/coincommunities.js](../../../src/game/coincommunities.js) (2289 LOC).
  Renders a **flat `PlaneGeometry` plaza**, `WORLD_RADIUS = 58`
  ([coincommunities.js:59](../../../src/game/coincommunities.js#L59)), a **single fixed
  `PerspectiveCamera`** ([:413](../../../src/game/coincommunities.js#L413)), and **zero
  physics** (`grep` for `rapier|PhysicsWorld` → 0 hits).
- `/walk` = [src/walk.js](../../../src/walk.js) (3696 LOC). Has Rapier physics, heightfield
  terrain, a 4-mode camera system, friends/presence, and AR.
- **Both `/play` and `/walk` already join the SAME authoritative room** — `walk_world`
  (`WalkRoom`). `/play` via [community-net.js](../../../src/game/community-net.js), `/walk`
  via [walk-net.js](../../../src/walk-net.js). **Multiplayer is NOT a gap** — the netcode is
  shared. Every item below is a **client-side render/physics/UX** port.
- The server already carries vehicle constants (`VEHICLE_WORLD_RADIUS_M`, max-step, max-speed)
  in [WalkRoom.js](../../../multiplayer/src/rooms/WalkRoom.js) — driving is partly server-ready.

### Already-in-repo assets to lift (do not rewrite)

| System | File | Status today |
|---|---|---|
| Rapier wrapper + kinematic character controller | [src/physics/physics-world.js](../../../src/physics/physics-world.js) | wired into `/walk` only |
| Heightfield terrain (shared mesh + collider source) | [src/game/terrain.js](../../../src/game/terrain.js) | wired into `/walk` only |
| 4-mode camera (follow/cinematic/firstperson/topdown) | [src/walk.js:466-520](../../../src/walk.js#L466-L520) | inline in `/walk` — needs extraction |
| Friends / presence panel | [src/game/friends-panel.js](../../../src/game/friends-panel.js) | wired into `/walk` + `friends.js` |
| Client vehicle manager (Rapier raycast vehicle) | [src/game/vehicles.js](../../../src/game/vehicles.js) | **orphaned — zero importers** |
| Day/night cycle | [src/game/day-night.js](../../../src/game/day-night.js) | **orphaned — zero importers** |
| Activities/minigame loop | [src/game/play-activities.js](../../../src/game/play-activities.js) | **orphaned — zero importers** |
| Generic world persistence (Postgres index + R2 blob) | [api/world/[action].js](../../../api/world/[action].js), `api/_lib/world-store.js` | live API, **`/play` doesn't use it** |

---

## Phase 1 — Physical world foundation (unblocks the most; do first) — SHIPPED 2026-07-08

Maps to **W01**. Goal: `/play` stops being a flat clamped disc and becomes a real 3D space
with gravity, collision, a drivable district, and a free camera. Pure lift from `/walk`.

- [x] **P1.1 — Mount `PhysicsWorld` in `coincommunities.js`.** Done, with one adaptation: by
  the time this landed, `district.js` + `world-zones.js` already existed (built in an earlier
  session, tagged "W01" in their own headers, but never wired in) as the intended drivable-city
  answer for this brief — so physics mounts a flat `addGround()` + the district's building
  colliders (`addStaticBox` per `district.colliders`) rather than a second heightfield. Rapier
  boots once in the constructor (`_initPhysics()`, memoized like `/walk`'s `initRapier()`), the
  kinematic character controller persists across coin switches, `_stepLocal` feeds it
  camera-relative displacement + integrated gravity every frame, and `physics.step(dt)` runs
  right after in `_loop()` (move-before-step, per physics-world.js's contract). Falls back to
  the old direct-mutation path until Rapier's WASM resolves.
- [x] **P1.2 — Real ground collision for the plaza+district.** Superseded by the district
  answer above: `terrain.js`'s rolling-hill heightfield is still `/walk`'s ground (unchanged);
  `/play`'s Downtown plaza + district streets are flat by design (asphalt/sidewalks), so a flat
  `addGround()` matches the rendered geometry exactly instead of fighting it with hills.
- [x] **P1.3 — Raise/replace the 58 m clamp.** Movement now clamps to the square
  `WORLD_BOUND`/`DISTRICT` from [world-zones.js](../../../src/game/world-zones.js)
  (`clampToBounds`, half=200) instead of the old `WORLD_RADIUS` disc (58, kept only as the
  Downtown plaza's *visual* radius for dressing/build-placement/NPC-roam, unrelated to movement
  now). This already matches `WalkRoom`'s own `WORLD_HALF_M`/`WORLD_BOUND_M` server clamp
  one-for-one — no server change needed.
- [x] **P1.4 — Extract the camera-mode system into a shared module.** Done as
  [src/game/camera-modes.js](../../../src/game/camera-modes.js): `CAMERA_MODES`,
  `CAMERA_MODE_LABELS`, `CAMERA_MODE_FOV`, the pure `computeCameraForMode()` math, and a
  `createCameraModeController()` stateful wrapper (cycling, localStorage persistence, cross-fade
  transition). Fully wired into `coincommunities.js` (press **C** to cycle; 'follow' reproduces
  the original fixed orbit exactly). `walk.js` was intentionally left on its own inline
  controller wiring (haptics/session-save/DOM-indicator are walk-specific) — a follow-up can
  point it at the shared constants/math if it's worth the risk on that much larger file.
- [x] **P1.5 — Wire the orphaned day/night cycle.** `createDayNightCycle(env, district)` now
  runs every frame in `_tickEnv`, driven by the same deterministic `worldClock(Date.now())`
  used by `/agent-screen`'s ambient stage — zero network sync, every client agrees on the sky.
  `district.setNight(k)` brings up building windows + streetlamps at dusk for free (the hook
  was already built into `day-night.js`, just never called).

**Phase 1 done when:** an avatar in `/play` is stopped by real colliders (not a disc clamp) —
verified end-to-end against a local Colyseus room: a district building blocks a straight-line
walk a few metres short of its wall — can switch all four camera modes (verified via keyboard +
screenshot), the world has a day/night sky driving real light/fog values, and every client in a
`?coin=` world computes the identical district + sky from the same seed/clock. Real Rapier +
real district + real day/night — no mocks. Next: **W02** (vehicles) can now assume a live
`PhysicsWorld` + character controller + district colliders to enter/exit a car against.

---

## Phase 2 — Vehicles & driving

Maps to **W02**. Depends on Phase 1 (needs the Rapier world + terrain colliders).

- [ ] **P2.1 — Wire the orphaned client `VehicleManager`.** Import
  [src/game/vehicles.js](../../../src/game/vehicles.js) into `/play`, spawn at least one drivable
  vehicle, and hook enter/exit to proximity (`VEHICLE_ENTER_RANGE_M` already exists server-side).
- [ ] **P2.2 — Network vehicle state through `WalkRoom`.** The server already has
  `VEHICLE_WORLD_RADIUS_M` / `vehicleMaxStepM` / `vehicleMaxSpeedMps`. Confirm the room's
  vehicle schema is sent to `/play` clients via `CommunityNet` and that remote vehicles render
  via [src/game/vehicle-mesh.js](../../../src/game/vehicle-mesh.js).
- [ ] **P2.3 — Driving camera + HUD.** Reuse the camera-modes module (P1.4) for a chase cam;
  add a speed/throttle readout to the existing `WorldHudSystem`
  ([src/game/hud/](../../../src/game/hud/)).

**Phase 2 done when:** a player walks up to a car, presses to enter, drives it across terrain
with collision, a second browser sees the car move smoothly, and exit returns to on-foot.

---

## Phase 3 — Persistent, buildable world (the Hyperfy parity items)

Maps to **W01 persistence + Hyperfy's build/upload/persistence model**. These are the things
`world.three.ws` has that neither `/play` nor `/walk` fully has yet.

- [ ] **P3.1 — Persist the coin-world build through the existing world store.** `/play` already
  has limited prop building (`WorldObjects`/`PropGhost`, capped to 12 m). Route saves/loads
  through the live [api/world/[action].js](../../../api/world/[action].js) +
  `api/_lib/world-store.js` (Postgres index + R2 blob, optimistic-concurrency etags), keyed by
  coin mint as `worldId`. This is the Hyperfy "save every 30s" pattern, already half-built here.
- [ ] **P3.2 — Lift the build-radius cap.** With persistence + permissions
  (`world-store.canWriteWorld`), expand beyond the 12 m `clearMaxRadius`
  ([coincommunities.js:298](../../../src/game/coincommunities.js#L298)) so holders can build a
  real place, governed by the per-world permission model rather than a hard cap.
- [ ] **P3.3 — Player asset uploads (GLB).** Hyperfy lets players upload GLB/VRM. We already
  have [src/game/avatar-upload.js](../../../src/game/avatar-upload.js) and an R2 pipeline —
  extend it to world props, size-limited like Hyperfy's `PUBLIC_MAX_UPLOAD_SIZE`. Validate and
  sanitize server-side before serving.
- [ ] **P3.4 — (stretch) VRM avatar support.** Hyperfy is VRM-native; we're GLB-native. Evaluate
  adding a VRM loader path alongside GLB in the avatar pipeline. Lower priority — only if a
  clear holder demand exists. Do **not** block Phases 1–2 on it.

**Phase 3 done when:** a holder builds in their coin world, reloads the page, and the build is
still there; a second visitor sees the same persisted build; permissions stop non-owners from
overwriting it.

---

## Phase 4 — Living-world & social parity

Maps to **W08/W09**. `/play` already has NPCs (`WorldLife`), voice, cosmetics — these add the
`/walk` social surface and the orphaned activities loop.

- [ ] **P4.1 — Wire the orphaned activities/minigame loop.** Import
  [src/game/play-activities.js](../../../src/game/play-activities.js) `PlayActivities` into
  `/play` and surface it through the HUD.
- [ ] **P4.2 — Port the friends/presence panel.** Bring
  [src/game/friends-panel.js](../../../src/game/friends-panel.js) (already used by `/walk` and
  `friends.js`) into `/play` so players see and join friends across coin worlds.
- [ ] **P4.3 — Minimap.** `/walk` and Hyperfy both orient the player in a larger space; with the
  expanded world from Phase 1, add a minimap to `WorldHudSystem`.

---

## Cross-cutting rules (from CLAUDE.md — apply to every item)

- **No mocks, no stubs, no TODOs, no fake loading.** Real Rapier, real terrain, real
  `walk_world` netcode, real R2/Postgres persistence.
- **$THREE is the only coin.** Worlds are keyed by arbitrary user-supplied mints at runtime
  (the generic plumbing exception) — never hardcode or surface any non-`$THREE` mint.
- **Every state designed:** loading skeleton, empty world, physics-init failure, asset-upload
  rejection, save conflict (409 etag) — all handled and actionable.
- **Definition of done per item:** `npm run dev`, exercise in a real browser at 320/768/1440,
  zero console errors, Network tab shows real `walk_world` + `api/world` traffic, `npm test`
  green, `git diff` self-reviewed.
- **Changelog:** each phase that ships a user-visible change gets a `data/changelog.json` entry
  (tags: `feature`/`improvement`), per CLAUDE.md.

## Suggested order

`P1.1 → P1.2 → P1.3 → P1.4 → P1.5` (foundation) → `P2.x` (vehicles) → `P3.1 → P3.2 → P3.3`
(persistence/build) → `P4.x` (social). P1 unblocks everything; the three orphaned modules
(`vehicles.js`, `day-night.js`, `play-activities.js`) are the cheapest early wins because they
already exist and just need importing.
