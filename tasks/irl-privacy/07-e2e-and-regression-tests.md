# 07 — E2E + regression coverage that locks the invariant in CI

> Size **M** · `tests/api/*`, `tests/*` (vitest), `tests/e2e/*` (playwright), and a
> tiny dev seam in `src/irl.js` if needed for deterministic GPS in a headless run.

## Goal

Turn the privacy invariant and the new UX behaviors into **automated** guarantees so
no future change can quietly reopen the roster or regress discovery. The Vercel
build is the only automated gate ([memory: github-actions-unavailable]), so these
must run under `vitest run` / `playwright test` locally and in that build.

## Why it matters

Task 01 proves the lockdown *once, by hand*. This makes it permanent. The room-anchor
work already shares these files; a later refactor could re-add a pin broadcast or a
window feed without anyone noticing — unless a test fails. Safety regressions must be
loud.

## Current state (real lines)

- `tests/api/irl-pins-location-guards.test.js` already asserts: no bbox/window feed,
  the hard radius cap (`Math.min(60, …)`), rate-limiting, and no owner-id projection.
  Build on it; don't duplicate.
- `tests/api/irl-pins-room.test.js` covers room-frame persistence + projection.
- Presence/reaction units exist (`tests/irl-*`); `IrlRoom` is presence+reactions only.
- Playwright suite lives under `tests/e2e/`; pre-start a dedicated dev server per
  [memory: vitest-cold-import-contention].

## What to build

1. **Realtime "no pins" regression (unit/integration).** Boot `IrlRoom` (or assert
   on its schema/handlers) and prove `state.pins` is never populated and there is no
   `applyPublish`/`_loadPins`/pin-publish path. A structural test that fails if a pin
   broadcast is reintroduced.
2. **API guards — extend** `irl-pins-location-guards`: add the cross-user `?mine`
   attempt (guessed `deviceToken` → no data) and assert `report`/calibrate/edit no
   longer call any publish module (the modules are gone; assert no import).
3. **Pure-logic units** for the new modules from tasks 03/04:
   `proximity-cue` (new arrivals, debounce, no re-fire on refresh) and the
   hysteresis band (enter 40 / exit ~55 / debounce). These are pure → cheap + fast.
4. **E2E happy path (Playwright, headless).** With a deterministic GPS seam
   (inject fixed `gpsState` or mock `geolocation`), and seeded pins
   (`__irlSeedPins`): assert (a) an out-of-range pin does **not** render, (b) moving
   into range renders it, (c) the empty-state explainer/empty prompt appears with
   zero pins, (d) no console errors. Keep it hermetic (no live network/DB).
5. **E2E privacy assertion.** In the same run, assert the page never holds a list of
   pin coordinates outside the in-range set (inspect the live `nearbyPins`/DOM) and
   that the WS client state exposes no pins.

## Acceptance checklist

- [ ] A structural test fails if `IrlRoom` ever re-syncs pins or a pin-publish path returns.
- [ ] `?mine` cross-user attempt covered → returns no data.
- [ ] `proximity-cue` + hysteresis band unit-tested (pure).
- [ ] Playwright happy-path: out-of-range hidden, in-range renders, empty state shown,
      no console errors — hermetic.
- [ ] Playwright privacy assertion: no out-of-range coordinates in client state/DOM.
- [ ] `vitest run` + `playwright test` green locally; suite stays within the
      calibrated timeouts ([memory: vitest-cold-import-contention]).

## Out of scope

The features themselves (01–06) — this task only *locks them in*. Don't lower any
vitest timeout.

## Verify

`npx vitest run irl` and the new e2e spec both green; then temporarily reintroduce a
fake pin broadcast in a scratch branch and confirm the structural test goes red
(then discard the scratch change).
