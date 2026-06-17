# E2 — Performance & scale (dense nearby agents stay smooth)

## Goal

Keep `/irl` at a steady frame rate when a busy location has many nearby pins:
**distance culling**, **GLB LOD / impostor billboards** beyond N metres, a
**concurrent-load cap + load queue**, an explicit **draw-call / texture budget**
(wired through `src/webgl-budget.js`), and **graceful degradation** on low-end
devices. Budgets are defined below, not left implicit.

## Why it matters

Every nearby pin currently spawns its own `Group` with a beacon, and any pin under
80 m tries to load a full GLB. A popular plaza could carry dozens of pins; a handful
of skinned-mesh avatars plus per-frame label projection will tank a mid-range phone
and trip *"Too many active WebGL contexts"* on top of the rest of the page. A
camera-AR product that stutters is dead on arrival — smoothness *is* the feature.

## Current state (real lines)

- **Load gate (the only throttle today):** `spawnNearbyPin()` `src/irl.js:981` —
  `loadedCount < 5 && pin.distance_m < 80` before `loadPinGLB()`. Crude: no queue,
  no eviction when the user walks away, no re-load when they walk back.
- **GLB load:** `loadPinGLB()` `src/irl.js:990` — a fresh `new GLTFLoader()` per
  pin (no shared loader, no DRACO/meshopt reuse), beacon swapped for the model.
- **Beacon placeholder:** `src/irl.js:958` — every pin always carries a
  transmission/emissive `MeshPhysicalMaterial` sphere (expensive material for a dot).
- **Per-frame work:** `updateLabels()` `:1254` and `updateRadar()` `:1230` iterate
  *all* `nearbyPins` every frame; radar rebuilds DOM dots each frame (`:1233`).
- **Renderer:** `src/irl.js:103` — `antialias:true`, `preserveDrawingBuffer:true`,
  `setPixelRatio(min(dpr,2))`, one 1024² shadow map (`:122`). No device-tiering.
- **Budget helper:** `src/webgl-budget.js` — `reserveWebGLContext()` /
  `releaseWebGLContext()` track `window.__agent3dReservedContexts`. IRL owns one
  long-lived context; it must `reserveWebGLContext()` once so the rest of the page
  stays under the browser cap, and it never spawns per-pin contexts (all pins share
  the single scene — keep it that way).
- `NEARBY_RADIUS = 150` (`:790`), fetch every 15 s (`:791`).

## What to build

### 1. Budgets (defined — tune per tier)

```js
// src/irl/perf-budget.js
export const TIER = detectTier(); // 'low' | 'mid' | 'high'

export const BUDGET = {
  high: { maxGLB: 8, lodNear: 18, lodFar: 45, cull: 150, pixelRatio: 2,  shadow: 1024, label: 24 },
  mid:  { maxGLB: 5, lodNear: 14, lodFar: 35, cull: 120, pixelRatio: 1.5, shadow: 512,  label: 16 },
  low:  { maxGLB: 2, lodNear: 10, lodFar: 22, cull: 80,  pixelRatio: 1,   shadow: 0,    label: 8  },
}[TIER];
// maxGLB = concurrent full avatars · lodNear = full GLB ≤ this · lodFar = impostor ≤ this
// cull = beyond this metres a pin is hidden entirely · label = max simultaneous HTML labels
```

`detectTier()` reads real signals: `navigator.hardwareConcurrency`,
`navigator.deviceMemory`, `devicePixelRatio`, a coarse mobile UA check, and an
optional one-frame GPU timer — no fake values, default to `mid` when unknown.

### 2. Distance culling

In a new `enforceLOD()` (called from `tick()`, throttled to ~4 Hz, not per frame):
for each pin compute distance from the camera and assign a band — `full` (GLB),
`impostor` (billboard), `dot` (cheap beacon), or `hidden` (set `group.visible=false`,
detach label). Crossing `BUDGET.cull` hides the pin and frees its label slot.

### 3. GLB LOD / impostor billboards beyond N metres

Beyond `lodNear` but within `lodFar`, render a **billboard impostor** instead of a
skinned GLB: a single camera-facing `PlaneGeometry` with a `SpriteMaterial`/textured
quad showing the avatar's thumbnail (`avatar_url`'s poster, or a render-to-texture
snapshot taken once when the GLB first loads). Impostors cost ~1 draw call and no
skinning. Replace the always-on `MeshPhysicalMaterial` beacon (`:958`) with a cheap
`MeshBasicMaterial`/sprite dot for the `dot` band.

### 4. Concurrent-load cap + load queue

Replace the ad-hoc `loadedCount < 5` check with a real queue:

```js
// src/irl/load-queue.js
const queue = []; let active = 0;
const loader = sharedGLTFLoader(); // ONE loader (+ DRACO/meshopt) reused across pins

export function requestGLB(pin, onDone) {
  queue.push({ pin, onDone });
  queue.sort((a, b) => a.pin.distance_m - b.pin.distance_m); // nearest first
  pump();
}
function pump() {
  while (active < BUDGET.maxGLB && queue.length) {
    const { pin, onDone } = queue.shift();
    active++;
    loader.loadAsync(pin.avatar_url)
      .then(onDone).catch(() => {})
      .finally(() => { active--; pump(); });
  }
}
export function evict(pin) { /* dispose geometry/material/textures, drop to impostor */ }
```

When a pin leaves `lodNear`, **evict** its GLB (dispose geometry + materials +
textures) and fall back to the impostor — bounded memory regardless of how many
pins the user walks past. Re-queue on re-approach.

### 5. Draw budget + texture budget (via webgl-budget)

- Call `reserveWebGLContext()` once at IRL boot; `releaseWebGLContext()` on unload.
- Track an approximate draw-call count = `active GLBs · avg + impostors + scene`.
  When projected draws exceed the tier ceiling, demote the farthest `full` pin to
  `impostor` even if it's inside `lodNear`. Cap simultaneous label DOM nodes at
  `BUDGET.label` (nearest-first), reusing the existing `updateLabels()` loop.
- Texture budget: impostor atlas + shared loader keep VRAM bounded; dispose on evict.

### 6. Graceful degradation on low-end devices

On `TIER==='low'`: `pixelRatio=1`, shadows off (`renderer.shadowMap.enabled=false`,
matching `BUDGET.shadow===0`), `maxGLB=2`, smaller cull radius, impostors preferred.
Add a frame-time watchdog: if the rolling avg frame time exceeds ~28 ms for ~2 s,
step down one tier live (drop pixelRatio, then disable shadows, then shrink `maxGLB`)
— and step back up if it recovers. Never freeze; always degrade visibly-gracefully.

## Data / API changes

None required. **Nice-to-have (optional):** have `GET /api/irl/pins` include a
`thumb_url` (poster) per pin so impostors don't need a client-side render-snapshot
on first sight. If absent, snapshot the GLB to a texture once on load.

## Acceptance checklist

- [ ] `detectTier()` picks low/mid/high from real device signals; `BUDGET` applied at boot.
- [ ] Pins beyond `BUDGET.cull` are fully hidden (no draws, no label).
- [ ] Pins in the LOD-far band render as impostor billboards (~1 draw call), not skinned GLBs.
- [ ] A shared GLTFLoader + load queue enforces `maxGLB` concurrency, nearest-first.
- [ ] Walking away from a pin evicts its GLB and disposes geometry/materials/textures; re-approach re-loads.
- [ ] `reserveWebGLContext()` called once; IRL never creates per-pin contexts.
- [ ] Label DOM nodes capped at `BUDGET.label`; `updateLabels`/`updateRadar` stay O(n) and skip culled pins.
- [ ] Low tier: shadows off, pixelRatio 1; frame-time watchdog steps tiers down/up live.
- [ ] Verified smooth (~55–60 fps mid-tier) with 30+ simulated nearby pins.
- [ ] No console errors; no "Too many active WebGL contexts" warning.

## Out of scope

- Realtime pin sync (Epic D) — E2 only governs *rendering* whatever pins are loaded.
- The permission/onboarding flow (E1) and designed-state pass (E4).

## Verify

`npm run dev`, open `/irl`, seed many pins near your GPS (or temporarily fan out a
local pin set) and walk the avatar through them. Watch the DevTools FPS meter and
`renderer.info.render.calls` — confirm draws stay bounded as pin count climbs, GLBs
load nearest-first up to the cap, distant pins are impostors, and far pins vanish.
Throttle CPU 6× to confirm the watchdog degrades instead of stalling. `npm test` green.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/E2-performance-scale.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
