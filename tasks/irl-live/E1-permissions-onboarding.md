# E1 — Permissions & onboarding (camera · motion · location)

## Goal

A first-run permission + onboarding flow for the three sensors IRL depends on —
**camera** (`getUserMedia`), **motion/orientation** (`DeviceOrientationEvent`),
and **location** (`navigator.geolocation`) — where every permission has a fully
*designed* state: prompt, granted, denied-with-recovery, and unsupported. Never a
blank screen, never a dead end. The iOS Safari motion gesture is handled explicitly.

## Why it matters

IRL is a phone-camera product. Today the camera path lives in `enableAR()`
(`src/irl.js:190`) and the motion gesture is buried inside `setLocked()`
(`src/irl.js:682`). A user who denies the camera prompt sees a 3-second toast
(`setStatus(... { error:true })`) and is then stranded — no explanation of *why*
we asked, no path to recover. iOS users who never tap **Pin** never get the
motion prompt at all, so world-lock silently does nothing. A first-run flow that
explains the value, requests each permission from a real gesture, and routes
every denial to a recovery card is the difference between "broken" and "best in class".

## Current state (real lines)

- **Camera** — `enableAR()` `src/irl.js:190`. Already handles `NotAllowedError`
  vs other errors (`:202`) and the missing-API case (`:191`, `:277`), but only as
  a transient `setStatus()` toast — no designed recovery surface.
- **Motion** — `setLocked()` `src/irl.js:684` calls
  `DeviceOrientationEvent.requestPermission()` from the Pin tap (a real gesture),
  but a `denied` result just toasts "Motion sensor access denied" (`:688`) and
  returns. Listeners are attached at `:670`/`:674`.
- **Location** — `initGPS()` `src/irl.js:823` calls `watchPosition` with an empty
  error callback (`:827`) — a denied GPS prompt is **swallowed**. `revealMyPinsBtn`
  / nearby-pin loading only fire on first fix (`:799`).
- No onboarding/intro surface exists; `pages/irl.html` boots straight into the scene.
- `state-kit.js` exports `emptyStateHTML` / `errorStateHTML` / `ensureStateKitStyles`
  — the just-shipped error-boundary bar. Use them here.

## What to build

A self-contained `src/irl/onboarding.js` module + a permission state machine.
Render into a new full-screen overlay `#irl-onboard` (added to `pages/irl.html`,
above the scene `z-index`). Drive it from `state-kit` shells so copy + visuals
match the platform.

```js
// src/irl/onboarding.js
import { emptyStateHTML, errorStateHTML, ensureStateKitStyles } from '../shared/state-kit.js';

export const PERMS = {
  camera:   { label: 'Camera',   why: 'See your agents anchored in the real world through your camera.' },
  motion:   { label: 'Motion',   why: 'Turn your phone to look around — agents stay pinned to real space.' },
  location: { label: 'Location', why: 'Place agents at real spots and discover the ones others left nearby.' },
};

// Feature detection — drives the "unsupported" state per sensor.
export const support = {
  camera:   () => !!navigator.mediaDevices?.getUserMedia,
  motion:   () => typeof DeviceOrientationEvent !== 'undefined',
  location: () => 'geolocation' in navigator,
};

// iOS 13+ gates motion behind an explicit gesture-bound requestPermission().
export const needsMotionGesture = () =>
  typeof DeviceOrientationEvent?.requestPermission === 'function';
```

**State per permission** — render with state-kit, one card at a time:

| State | Surface | Copy / action |
|---|---|---|
| `prompt` | `emptyStateHTML` | "Why we need <Camera>" + the `why` line + a primary **Enable** button (the gesture). |
| `granted` | inline check, advance | green check, auto-advance to next permission. |
| `denied` | `errorStateHTML` | "Camera is blocked" + OS-specific recovery steps + **Try again** + **Continue without** (degraded). |
| `unsupported` | `emptyStateHTML` (compact) | "This device can't <use the camera>" + what still works (e.g. orbit-only, no AR). |

**iOS motion gesture — explicit handling.** Request must run *inside* the click
handler of the onboarding **Enable** button, not deferred:

```js
async function requestMotion() {
  if (!support.motion()) return 'unsupported';
  if (needsMotionGesture()) {
    try {
      const res = await DeviceOrientationEvent.requestPermission(); // MUST be in the gesture
      return res === 'granted' ? 'granted' : 'denied';
    } catch { return 'denied'; }            // throws if not called from a user gesture
  }
  // Android / non-gated: assume usable; confirm by listening for one event.
  return await probeOrientation(); // resolve 'granted' on first deviceorientation, else 'denied' after 1500ms
}
```

Camera + location requests follow the same shape (`getUserMedia` reusing
`enableAR`'s logic; `getCurrentPosition` once to surface the prompt, then hand off
to the existing `watchPosition`). Map `GeolocationPositionError.PERMISSION_DENIED`
(code 1) → `denied`, `POSITION_UNAVAILABLE`/`TIMEOUT` → a retryable error.

**Flow.** On first visit (no `localStorage['irl_onboarded_v1']`): show the overlay
with a one-line pitch + the three permission cards in sequence. Each card lets the
user **Enable**, **Skip**, or recover from denial. Camera + location are required
for the full IRL loop; motion is recommended (orbit fallback exists). After the
sequence — or immediately on a repeat visit — persist results and dismiss the
overlay into the live scene. A **denied** sensor leaves a persistent re-request
chip in the topbar (e.g. "Enable camera") so recovery is always one tap away;
never leave the user with a non-functional button and no explanation.

**Wire-in (no logic duplicated).** `enableAR()`, `setLocked()`, and `initGPS()`
call into the onboarding module's `ensurePermission('camera'|'motion'|'location')`
which resolves the cached/granted state or re-opens the relevant card — so the
inline error toasts become the *fallback*, with the designed card as the primary path.

## Data / API changes

None. Pure client. Persist outcome in `localStorage['irl_onboarded_v1']`
(`{ camera, motion, location, ts }`) so we don't re-nag, and re-show a single
card only for a sensor the user later wants.

## Acceptance checklist

- [ ] First visit shows `#irl-onboard` with a value pitch + per-sensor cards.
- [ ] Each sensor has all four designed states (prompt / granted / denied / unsupported) via state-kit.
- [ ] iOS `DeviceOrientationEvent.requestPermission()` is called **inside** the Enable click handler; a denial routes to the recovery card, not a toast.
- [ ] Camera denial shows recovery steps + **Continue without** (scene still loads in orbit mode).
- [ ] Location denial is no longer swallowed (`initGPS` error cb routes to a state); My-pins + nearby load gate cleanly.
- [ ] Repeat visits skip onboarding; a denied sensor shows a re-request chip in the topbar.
- [ ] No blank screen in any branch; every dead path removed.
- [ ] Existing `enableAR`/`setLocked`/`initGPS` reuse the module — no duplicated permission logic.
- [ ] No console errors/warnings; respects `prefers-reduced-motion`.

## Out of scope

- The world-anchor math (Epic A). This task only governs *getting permission* and
  the onboarding shell; A1/A4 consume the granted sensors.
- Multiplayer presence prompts (Epic D).

## Verify

`npm run dev`, open `/irl` on a phone (or device-emulated DevTools with sensors).
Deny each permission in turn; confirm a designed recovery card appears and the
scene never blanks. On a real iPhone, confirm the motion card's Enable button
triggers the native iOS motion dialog and a denial shows recovery copy. Clear
`localStorage` and reload to re-trigger first-run. `npm test` stays green.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/E1-permissions-onboarding.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
