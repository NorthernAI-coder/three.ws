# R1 — "Place agents around me" (room authoring UI)

> Epic R · Size **L** · Edits `src/irl.js`, `pages/irl.html`, `src/irl.css`.

A mode in `/irl` where you stand in a room and **drop agents at fixed real-world
spots around you by aiming and setting a distance**. Point the phone at the
couch, set ~3 m, tap Place — an agent appears sitting there, facing you. Turn
away and it's gone; turn back and it slides into frame exactly where you left it.
Place three more behind you; the left wall stays empty. Every agent is anchored
into one shared **room** so the engine (already built) renders the layout
identically for the next person who opens `/irl` here.

## Why it matters

The whole engine — math, persistence, projection, world-locked render — is
already shipped and green, but **a user cannot create a room pin through the
product**. R1 is the authoring surface that turns the engine into a feature. It
must feel as good as dropping a pin in a top-tier map app: instant, legible,
forgiving.

## Current state (real symbols — verify lines, they shift under concurrent edits)

- **Own-avatar placement flow** in `src/irl.js`: `setLocked(true)` → `anchorGpsPin()`
  (derives lat/lng from the avatar's world position + compass heading) →
  `openCaptionPanel(lat, lng, headingDeg, source)` → `commitPin(...)` →
  `savePin(lat, lng, heading, caption, anchor)` which `POST`s `/api/irl/pins`.
  This places **one** "my avatar." R1 adds a distinct **multi-agent room** flow.
- **Room engine helpers** (use, don't reinvent): `pinRoom(pin)`, `pinWorldPos(pin)`
  in `src/irl.js`; `placeAround`, `roomOriginWorld`, `agentWorldPosition` in
  `src/irl/room-anchor.js`.
- **Live pose** available now: `gpsState` (`{ lat, lng, ready, accuracy }`),
  `lastCompassHeading`, `cameraYaw`, `prefersAbsOrientation`, `compassToYaw`.
- **Avatar/agent identity**: `_currentAvatarId`, `_currentAgentId`, `nameEl`,
  `resolveAvatarUrl(id)`, `_deviceToken`. Reuse the existing avatar picker the
  page already uses for the own-avatar.
- **Permissions**: `ensurePermission('camera'|'motion'|'location')`,
  `needsMotionGesture`, `setPermissionState` in `src/irl/onboarding.js`.
- **Pin interaction surfaces** already built: `openPinSheet(pin)`, the A3
  calibrate gesture, remove via `DELETE /api/irl/pins`. Reuse for editing a
  placed room agent (R2 extends calibrate to the room origin).
- **DEV harness** to develop against without a phone: `window.__irlSeedRoom()` /
  `window.__irlRoomCheck()`.

## What to build

### 1. Room session state

A single in-memory room the placements share, plus durable resume:

```js
// null until the first placement of a session establishes the room
let activeRoom = null; // { id, originLat, originLng, originYawDeg, createdAt, count }
```

- **Establish on first place:** capture `gpsState.lat/lng` as the origin and set
  `originYawDeg = 0` when an absolute compass heading is available
  (`prefersAbsOrientation` / a valid `webkitCompassHeading`) — the true-north
  frame. If only page-relative orientation exists, set `originYawDeg` to the
  current heading and tag placements `gyro-gps:rel` (R2 reconciles cross-user).
- **Room id:** derive a stable slug, e.g. `r-${geocell8}-${shortRand}` matching
  `^[a-z0-9-]{1,64}$`. One room per (place + session); reuse `activeRoom` for
  every subsequent drop until the user exits room mode.
- **Resume:** persist `activeRoom` to `localStorage` keyed by coarse geocell so
  returning to the same spot in a later session keeps adding to the same room
  (and so "my pins" can group by room). On load, if the nearby read returns pins
  with a `room_id` this device owns at this location, adopt that room.

### 2. Entry + mode

- Add a primary **"Place agents"** affordance to the `/irl` action bar (alongside
  the existing Pin/Place controls in `pages/irl.html`). Tapping it enters
  **room placement mode** (`body.classList.add('irl-room-mode')`), which requires
  camera + motion + location (gate via `ensurePermission`, reuse the existing
  permission cards — never a dead end).
- Entering shows the **aim HUD** (next section). A clear **Done** exits the mode
  back to normal viewing.

### 3. Aim + place HUD (the core interaction — make it excellent)

- **Reticle:** a centered, crisp aiming reticle over the camera feed marking where
  the agent will land. Subtle pulse; CSS `transform`/`opacity` only.
- **Live ghost preview:** render the selected avatar (or a lightweight proxy) at
  the prospective world position each frame using `placeAround` →
  `agentWorldPosition`, so the user sees the agent *in the room* before
  committing. Semi-transparent until placed. This is the "screenshot-worthy"
  moment — invest here.
- **Distance control:** a thumb-reachable slider (0.5–8 m, default 2.5 m) with a
  live "2.5 m" readout; the ghost moves as it changes. Optional tap-to-set by
  tapping the floor if a WebXR hit-test is available (R3), else slider only.
- **Bearing = live compass heading.** The ghost sits along the current heading;
  turning the phone moves where it will drop. Show a compass chip ("NE · 47°").
- **Facing:** agent faces the placer by default (`faceViewer: true`); offer a
  quick toggle to face-away.
- **Place button:** large, thumb-reachable. On tap: build the `room` block via
  `placeAround`, `POST /api/irl/pins` through a room-aware save (extend `savePin`
  or add `saveRoomPin`), spawn it immediately via the existing
  `spawnNearbyPin`/render path so it's world-locked at once, bump
  `activeRoom.count`, and give a crisp confirm (scale-in + optional haptic
  `navigator.vibrate?.(10)`; no fake timers).
- **Room badge:** "3 agents in this room" with the room name; tap to list/manage.

### 4. Multi-place, edit, move, remove

- After a place, stay in aim mode so the next agent can be dropped without
  re-entering. A subtle list/dots show what's placed.
- **Tap a placed agent** → `openPinSheet(pin)` for caption/avatar/remove; the A3
  calibrate gesture nudges a single agent. (R2 adds "move the whole room.")
- Remove uses the existing owner-gated `DELETE /api/irl/pins`. Update
  `activeRoom.count` and the badge.

### 5. Every state designed

- **No GPS fix yet:** aim HUD shows "Finding your spot…" with the live accuracy;
  Place is disabled until `gpsState.ready`. Never silently drop at (0,0).
- **Permission denied** (camera/motion/location): reuse the onboarding cards with
  the exact recovery steps; Place stays disabled with a reason.
- **Loose lock** (poor compass / large GPS accuracy): show the honest amber state
  (reuse the confidence-ring language) and the `gyro-gps:rel` warning copy that
  already exists — placement still works, cross-user bearing may drift.
- **POST rejected** (area_full / pin_limit / rate / content / network): surface
  the server's designed message (the `saveErrorFallback` map already exists);
  keep the ghost so the user can retry without re-aiming.
- **Empty room** (mode entered, nothing placed): a one-line coach — "Aim at a
  spot and tap Place to drop your first agent."

### 6. UX polish (the quality bar)

- Hover/active/focus on every control; full keyboard path (Tab to Place, Enter to
  drop, Esc to exit); ARIA labels on reticle/slider/Place/Done; `aria-live` on the
  room badge count.
- Responsive at 320 / 768 / 1440; thumb-zone layout on mobile; controls clear of
  the iOS home indicator.
- Respect `prefers-reduced-motion` (no pulse/scale for those users).
- Reuse existing design tokens / CSS vars in `src/irl.css`; no new ad-hoc colors.

## Definition of done

- A user can enter room mode, place several agents at distinct bearings/distances
  around them, see each lock to its real-world spot (turn away → gone, turn back →
  there), edit/move/remove them, and exit — all reachable from `/irl` nav.
- A second device (or a reload) loading `/irl` at the same location renders the
  same layout via the REST proximity read (verify with two browser contexts +
  the seed harness; full cross-device is an R5 on-device check).
- Placements POST the correct `room` block; `placeAround` is the only geometry
  source; any new pure helper has a unit test.
- All six states above are implemented and reachable. No console errors/warnings.
- `npm run typecheck` clean, `npm test` green, `vite build` clean.
- Changelog entry appended to `data/changelog.json` (tag `feature`) once the mode
  is user-visible. On-device acceptance handed to R5.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-room-anchor/R1-place-around-me.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
