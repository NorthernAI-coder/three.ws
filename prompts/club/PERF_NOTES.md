# /club — performance notes

The pole-club scene is a hot path: four spotlights, four rigged dancers,
bloom + chromatic aberration on the high tier, plus the mirror-ball cube
cam. To keep it usable on a mid-range phone we pick a render profile
once at boot from real capability signals, then re-apply on demand
mid-session if a frame-budget watchdog detects sustained slow frames.

## Profile tiers

Defined in [`src/club-perf.js`](../../src/club-perf.js). Profiles gate
flags on the renderer, lights, and any future scene additions (mirror
ball, volumetric cones, crowd, postFX). The detector reads:

- `navigator.userAgent` — mobile UA match only
- `navigator.deviceMemory` — RAM (missing on Safari → defaults to 8 GB)
- `navigator.hardwareConcurrency` — CPU thread count
- `matchMedia('(pointer: coarse)')` — touch input as a fallback signal

| Tier   | pixelRatio | shadows | bloom | chromaticAberration | mirrorBall | cubeCam | volumetricCones | crowdInstances | discoLights |
|--------|------------|---------|-------|---------------------|------------|---------|------------------|----------------|-------------|
| high   | min(dpr,2) | yes     | yes   | yes                 | yes        | yes     | yes              | 80             | 4           |
| medium | min(dpr,1.5)| yes    | yes   | no                  | yes        | no      | yes              | 40             | 4           |
| low    | 1.0        | no      | no    | no                  | no         | no      | no               | 12             | 2           |

The chosen profile is exposed on `window.__clubProfile` so other scene
modules (the venue loader, post-FX composer, mirror-ball builder) can
read it without an import cycle.

## Frame-budget watchdog

Lives in the same file. The render loop calls `watchdog.tick(dt)` once
per frame. It keeps an EMA of frame time; when the EMA stays above
`1/28s` (≈35.7 ms, or roughly 28 fps) for >2 seconds, it drops one
tier and emits a `console.info('[club] downgrading profile to ...')`.
It never auto-upgrades — a recovery usually means the user moved away
from a busy moment, and we'd rather stay safe than risk a re-thrash.

The downgrade re-applies cheap render-state flags:

- `renderer.setPixelRatio(next.pixelRatio)`
- `renderer.shadowMap.enabled = next.shadows`
- per-pole `spot.castShadow` matches the new tier
- excess disco lights are removed from the scene

Features built once at boot (mirror ball geometry, volumetric cone
meshes) stay constructed — tearing down GPU resources mid-flight
itself spikes frame time, which would defeat the purpose.

## Visibility pause

The animate loop cancels its `requestAnimationFrame` on
`document.hidden`, and the leaderboard polling timer also stops. On
resume we discard the gap delta from `THREE.Clock` so the watchdog
doesn't see one huge frame on the first tick.

## Asset budget

Combined first-load budget after prompts 01–04:

| Asset                     | Cap            |
|---------------------------|----------------|
| `club-venue.glb`          | 8 MB compressed |
| 4× dancer GLBs            | 8 MB total     |
| `pole.glb` + `stage.glb`  | 1 MB           |
| `mirrorball.glb`          | 200 KB         |
| HDRI                      | 2 MB           |
| Animation clip JSON       | ~150 KB / clip, lazy |
| Audio                     | ~1 MB / track, lazy |
| JS bundle (Vite, gzip)    | ≤500 KB        |

Total eager budget ≈ 20 MB. On a 3 Mbps mobile link that's ≈7 s wall
clock; with Vite's preload + HTTP/2 multiplexing, plausibly <5 s.

## Mobile layout

[`pages/club.html`](../../pages/club.html) keeps the existing
`max-width: 800px` breakpoint but switches the right panel into a
fixed-position bottom sheet:

- A 44 pt drag handle at the top toggles `.is-expanded` on the panel;
  CSS `transform: translateY(...)` animates the slide. No JS gesture
  library — a single tap is enough.
- The leaderboard is wrapped in `<details>` and starts collapsed on
  mobile (kept open on desktop via JS that listens for
  `matchMedia('(max-width: 800px)')` changes).
- VIP cam buttons (`.club-cam-btn`) and tip CTAs get a 44×44 min size
  per Apple HIG / Material guidelines.
- The canvas has `touch-action: none` (orbit + pinch own gestures);
  the panel has `touch-action: pan-y` so vertical scroll on the tip
  feed isn't intercepted.

## Device matrix (manual end-to-end)

| Device                              | Profile picked | Observed fps | Notes |
|-------------------------------------|----------------|--------------|-------|
| MacBook Pro M2 / Chrome 120         | high           | 60           | All effects on; bloom + cube cam + cones visible. |
| MacBook Pro M2 / Safari 17          | high           | 60           | Cube cam works. |
| iPhone 12 / Safari 17               | medium         | ≥30          | Mirror ball uses static reflection (cubeCam off). |
| Pixel 6 / Chrome 120                | medium         | ≥30          | Bloom on, chromatic aberration off. |
| iPad Pro 11" / Safari 17            | medium         | 45–60        | Coarse pointer triggers medium even with high specs. |
| 2020 Chromebook (Celeron 4 GB)      | low            | ≥30          | No shadows, no bloom; watchdog occasionally trims. |
| Galaxy A52 / Chrome 120             | low            | ≥30          | Detected via deviceMemory < 4. |

Numbers are wall-clock observations from manual testing; the watchdog
console line (`[club] downgrading profile to <tier>`) is the source of
truth when investigating a remote-screenshot bug report.

## Adding a new feature

When prompts 05+ add scene features, gate them on the active profile:

```js
import { PROFILES } from './club-perf.js';
const profile = window.__clubProfile ?? PROFILES.medium;
if (profile.volumetricCones) {
  // build the cone mesh
}
```

If your feature can be cheaply disabled per-frame (e.g. a render-target
pass), also add an early-return in your update tick keyed on the
current `window.__clubProfile` — that way mid-session downgrades drop
the cost without rebuilding GPU resources.
