# Task: Mobile layout + low-perf rendering path for /club

## Repo context

Working tree: `/workspaces/three.ws`. The /club page has a mobile
breakpoint at `@media (max-width: 800px)` in
[pages/club.html](../../pages/club.html) that switches the grid to
stacked. That handles layout but not rendering cost — once prompts
01–04 ship the venue, dancers, bloom, mirror ball, and volumetric
cones, a mid-range Android phone will not survive at 60 fps.

## Rails (CLAUDE.md — non-negotiable)

- No "mobile downgrade" that renders a different scene — render the
  same scene with fewer pixels/passes/lights, do not fake it.
- No `setTimeout`-throttled animate loop. Drop work, not frames.
- Real detection: hardwareConcurrency + deviceMemory + pointer
  type + GPU tier. Pick a profile once at boot.
- Done = a real iPhone 12 and a real Pixel 6 render the club at
  ≥30 fps with no Safari/Chrome warnings.

## What to implement

### Step 1 — perf-profile detection

New file `src/club-perf.js`:

```js
export function detectProfile() {
  const ua = navigator.userAgent;
  const isMobile = /(iPhone|iPad|Android|Mobi)/i.test(ua);
  const lowMem = (navigator.deviceMemory ?? 8) < 4;
  const lowCores = (navigator.hardwareConcurrency ?? 8) < 4;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;

  if (!isMobile && !lowMem && !lowCores) return 'high';
  if (isMobile && (lowMem || lowCores)) return 'low';
  if (coarse) return 'medium';
  return 'medium';
}

export const PROFILES = {
  high: {
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    shadows: true,
    shadowMapSize: 1024,
    bloom: true,
    chromaticAberration: true,
    mirrorBall: true,
    cubeCam: true,
    volumetricCones: true,
    crowdInstances: 80,
    discoLights: 4,
  },
  medium: {
    pixelRatio: Math.min(window.devicePixelRatio, 1.5),
    shadows: true,
    shadowMapSize: 512,
    bloom: true,
    chromaticAberration: false,
    mirrorBall: true,
    cubeCam: false,        // mirror ball uses static reflection texture
    volumetricCones: true,
    crowdInstances: 40,
    discoLights: 4,
  },
  low: {
    pixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 0,
    bloom: false,
    chromaticAberration: false,
    mirrorBall: false,
    cubeCam: false,
    volumetricCones: false,
    crowdInstances: 12,
    discoLights: 2,
  },
};
```

### Step 2 — apply profile at boot

In [src/club.js](../../src/club.js) `bootstrap()`:

```js
import { detectProfile, PROFILES } from './club-perf.js';
const profile = PROFILES[detectProfile()];

renderer.setPixelRatio(profile.pixelRatio);
renderer.shadowMap.enabled = profile.shadows;
```

Pass the profile into:

- `attachVenue` (skips mirror-ball cube cam if `cubeCam === false`;
  uses a static `MeshBasicMaterial` reflection texture instead).
- `PoleStation` (skips volumetric cone construction if
  `volumetricCones === false`).
- `EffectComposer` (skips bloom pass if `bloom === false`,
  skips chromatic aberration pass if not configured).
- Crowd instance count.
- `discoLights` count.

### Step 3 — dynamic scaling

Even with a profile, a phone can throttle mid-session. Add a frame-
budget watchdog in the animate loop:

```js
let frameAvg = 1 / 60;
function animate() {
  const dt = Math.min(clock.getDelta(), 0.066);
  frameAvg = frameAvg * 0.94 + dt * 0.06;
  // ...
}
```

If `frameAvg > 1 / 28` for >2 consecutive seconds, downgrade one
step (`high → medium → low`) and re-apply. Never upgrade
automatically — a recovery means the user moved off a busy moment;
sticking at lower quality is safer.

Emit a debug `console.info('[club] downgrading profile to', next)`
so we can diagnose from a remote screenshot.

### Step 4 — mobile layout polish

The existing breakpoint at `max-width: 800px` stacks the panel
under the canvas, but the panel becomes a long scroll. Mobile-only
tweaks:

- Hide the leaderboard widget under a collapsed disclosure
  `<details>` to keep the viewport mostly canvas.
- The right panel becomes a swipe-up bottom sheet (CSS `transform`
  on a single drag handle, no JS gesture library).
- VIP cam button on each pole card gets bigger touch target
  (44×44 min).
- `touch-action: none` on the canvas (already set), but `pan-y` on
  the panel so the user can scroll the feed without orbit
  intercepting.

### Step 5 — pause when hidden

Add a `visibilitychange` listener that pauses `animate` when the
tab is hidden:

```js
let rafId = null;
function animate() {
  // ...
  rafId = requestAnimationFrame(animate);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(rafId);
  else { clock.getDelta(); animate(); } // discard the gap delta
});
```

Saves battery on mobile when the user backgrounds the tab.

### Step 6 — asset budget

The combined first-load budget after prompts 01–04:

| Asset | Cap |
|---|---|
| `club-venue.glb` | 8 MB compressed |
| 4× dancer GLBs | 8 MB total |
| `pole.glb` + `stage.glb` | 1 MB |
| `mirrorball.glb` (if shipped) | 200 KB |
| HDRI | 2 MB |
| Animation clip JSON (lazy) | ~150 KB per clip; lazy-loaded |
| Audio (lazy) | ~1 MB per track; lazy-loaded |
| JS bundle (Vite) | ≤500 KB gzipped |

Total eager budget: ~20 MB. On a 4G connection (~3 Mbps real)
that's ~7s. With Vite's preload + http/2, plausibly under 5s.

Wire a `setStatus` progress bar that aggregates progress events
across the parallel loads (already piped from prompt 01).

### Step 7 — tests

`tests/club-perf.test.js`:

- Stub `navigator.deviceMemory`, `hardwareConcurrency`,
  `userAgent`. Assert profile detection picks the right tier for
  each combination.
- Assert `PROFILES.low` disables bloom + shadows + cube cam.

### Step 8 — manual end-to-end

Required device matrix:

- iPhone 12 / Safari (latest) — should select `medium`, render
  ≥30 fps.
- Pixel 6 / Chrome — should select `medium`, render ≥30 fps.
- A 2020 ChromeBook — should select `low`, render ≥30 fps.
- Modern Mac/PC desktop — `high`, ≥60 fps.

Document the observed profile + fps per device in
`docs/club/PERF_NOTES.md`.

## Definition of done

- `src/club-perf.js` detects profile and exports it.
- All scene/render features gate on profile flags.
- Watchdog downgrades on sustained slow frames.
- Pause on hidden tab.
- Tested on real iPhone + Pixel + ChromeBook.
- Tests green.

## Constraints

- Do not gate features by user agent string parsing alone. Use the
  capability signals (`deviceMemory`, `hardwareConcurrency`,
  `pointer: coarse`); UA is a fallback only.
- Do not show a "your device is too slow" message — silently degrade.
- Do not skip the `visibilitychange` pause — on mobile, leaving the
  rAF loop running in a hidden tab heats the phone.
- Do not auto-upgrade the profile mid-session.
