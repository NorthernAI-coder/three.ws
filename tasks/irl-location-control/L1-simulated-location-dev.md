# L1 — Simulated location for testing (DEV-only)

> Epic · Size **S** · Touches `src/irl.js` only. DEV-gated, tree-shaken — never ships.
> The direct fix for "I want to test `/irl` on my iPhone without leaking my real spot."

## Goal

Let a developer or QA run the **entire** real `/irl` flow — place a pin, see the
nearby read, lock/anchor — at **any chosen coordinate**, with zero dependency on
the device's real GPS. Enabled two ways, both gated behind `import.meta.env.DEV`
so they are stripped from production bundles exactly like the existing
`__irlSeed*` harness (`src/irl.js:4405`):

- **URL param:** `…/irl?mockLoc=37.7749,-122.4194` (optionally `&mockAcc=8`).
- **Console:** `__irlMockLocation(37.7749, -122.4194)` to set, `__irlMockLocation(null)` to clear.

While active, a persistent on-screen **"SIMULATED LOCATION"** badge is shown so a
fake fix can never be mistaken for a real one, and the real `watchPosition` is
suppressed so no real coordinate is ever read or transmitted.

## Why it matters

Two hard blocks make on-device testing leak the tester's real location today:

1. **iOS Safari cannot spoof location** — no DevTools Sensors panel, and Web
   Inspector has no geolocation override. The only system-wide spoof is a paid
   third-party tool. So a real-device test writes the tester's true coordinates
   into the public `irl_pins` feed.
2. **A LAN dev build can't read GPS at all.** `navigator.geolocation` requires a
   secure context; over `http://<lan-ip>:3000` it's blocked, so `onGPSPosition`
   (`src/irl.js:1227`) never fires and the place flow is untestable.

Seeding `gpsState` directly sidesteps both: the flow runs on the fake fix, real
GPS is never touched, and it works over plain-http LAN. This is the foundation
that lets L2–L5 be exercised on a real phone safely.

## Current state (real lines)

- `src/irl.js:1123` `const gpsState = { lat: null, lng: null, ready: false, watchId: null, accuracy: null, altitude: null }`.
- `src/irl.js:1336` `initGPS()` starts the single `watchPosition` (idempotent on `gpsState.watchId`).
- `src/irl.js:1227` `onGPSPosition(pos)` is the only writer of `gpsState.lat/lng/ready`; on the **first** fix it calls `revealMyPinsBtn()` and `startPinSync()`, and resolves a `_pendingGpsLock`.
- `src/irl.js:4405` `if (import.meta.env.DEV) { window.__irlSeedPins = …; window.__irlPerf = …; window.__irlSeedRoom = …; }` — the established DEV-only window-API pattern to mirror.

## What to build

### 1. A single `applyMockFix(lat, lng, accuracy)` path

Reuse the real first-fix sequence rather than duplicating it. Factor the body of
`onGPSPosition`'s first-fix branch (seed `gpsState.lat/lng`, `ready = true`, then
`revealMyPinsBtn()` + `startPinSync()` + resolve `_pendingGpsLock`) into a small
helper, and have both `onGPSPosition` and `applyMockFix` call it, so a simulated
fix exercises the identical downstream code as a real one.

```js
// DEV-only. Seeds a synthetic fix and stops the real watch so no real coord is read.
function applyMockFix(lat, lng, accuracy = 10) {
  if (gpsState.watchId != null) { navigator.geolocation.clearWatch(gpsState.watchId); gpsState.watchId = null; }
  _mockLocation = true;
  gpsState.accuracy = accuracy;
  gpsState.altitude = null;
  onFirstOrBlendedFix(lat, lng);   // the extracted shared helper
  showMockBadge(lat, lng);
}
```

`initGPS()` must early-return when `_mockLocation` is set so a later call can't
re-attach the real watch and overwrite the fake fix.

### 2. URL-param entry (parse once at boot, DEV-only)

Inside the existing `if (import.meta.env.DEV) { … }` block, parse `mockLoc`
(`"lat,lng"`, both finite, lat ∈ [-90,90], lng ∈ [-180,180]) and optional
`mockAcc`. On a valid value call `applyMockFix(...)` and skip `initGPS()`. On a
malformed value, `log.warn` and fall through to real GPS — never throw.

### 3. Console entry + badge

```js
window.__irlMockLocation = (lat, lng, acc = 10) => {
  if (lat == null) { /* clear: hide badge, _mockLocation=false, initGPS() to resume real */ return 'cleared'; }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'usage: __irlMockLocation(lat, lng[, accuracyM])';
  applyMockFix(lat, lng, acc);
  return { mocked: { lat, lng, acc } };
};
```

The **badge** is a fixed-position pill (top-center, high z-index, `pointer-events:none`)
reading `📍 SIMULATED LOCATION · 37.7749, -122.4194`. Style it unmistakably (amber
border, mono coords) — its entire job is to prevent confusing a fake fix for real.
Tapping it does nothing; clearing the mock removes it.

### 4. Persist nothing, ship nothing

`_mockLocation` lives in module scope only (no localStorage — a refresh without the
param returns to real GPS). The whole feature sits inside `import.meta.env.DEV`
guards so Vite tree-shakes it out of the production build. **Verify the prod bundle
contains neither `__irlMockLocation` nor `SIMULATED LOCATION`.**

## Data / API changes

None. Client-only. No new endpoint, no schema change. The real `POST /api/irl/pins`
runs unchanged — it simply receives the simulated coordinate.

## Acceptance checklist

- [ ] `?mockLoc=37.7749,-122.4194` makes `gpsState.ready` true at that point with **no** real GPS prompt; My-pins reveals; nearby read fires for the fake spot.
- [ ] `__irlMockLocation(lat,lng)` sets, `__irlMockLocation(null)` clears and resumes real GPS.
- [ ] The real `watchPosition` is cleared/never started while mock is active; `initGPS()` is a no-op under mock.
- [ ] Placing a pin while mocked writes the **simulated** coordinate (confirm the POST body in the Network tab).
- [ ] The "SIMULATED LOCATION" badge shows the active coords and disappears on clear.
- [ ] Malformed `mockLoc` logs a warning and falls back to real GPS — no throw, no console error.
- [ ] **Production bundle (`npm run build`) contains no `__irlMockLocation` / `SIMULATED LOCATION` / `mockLoc` strings.**

## Out of scope

A user-facing "set my location" UI (that's L2's map picker). Persisting the mock
across reloads. Faking compass/heading (the magnetometer is untouched — heading
still reflects the real device, which is fine for placement testing).

## Verify

`npm run dev`, then:
1. Desktop: open `/irl?mockLoc=37.7749,-122.4194` → badge shows, no location prompt, place a pin → POST body carries `37.7749/-122.4194`.
2. Real iPhone over LAN: connect the phone to the same network, open `http://<your-lan-ip>:3000/irl?mockLoc=…` → the flow runs even though plain-http GPS is blocked; the pin lands at the fake spot, not your home.
3. `npm run build` → `grep -r "__irlMockLocation\|SIMULATED LOCATION" dist/` returns nothing.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-location-control/L1-simulated-location-dev.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
