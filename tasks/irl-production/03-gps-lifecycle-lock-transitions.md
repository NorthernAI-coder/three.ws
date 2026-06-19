# Task 03 — GPS lifecycle and lock-state transitions

**Phase:** 1 (AR correctness) · **Effort:** M · **Files:** `src/irl.js`

## Why
A pin's real-world anchor depends on a healthy GPS watch and clean transitions
between the three camera regimes (local gyro lock → precise GPS lock). Today a
transient GPS loss can leave a zombie watch, a pre-fix lock can persist a pin at
the wrong place, and the local→GPS upgrade can visibly jump.

## Read first (verify before fixing)
- `initGPS()` / `onGPSPosition()` / `onGPSError()` — `src/irl.js:1202-1344`
- `setLocked()` lock branch + `_pendingGpsLock` — `src/irl.js:966-1011`
- `anchorGpsPin()` / `openCaptionPanel()` / `commitPin()` — `src/irl.js:1284-1474`
- The three camera regimes in `tick()` — `src/irl.js:~3946-4010` (GPS / gyro-local / frozen-AR)

## Scope — confirm, then fix

1. **Zombie GPS watch after a transient timeout.** `onGPSError()` shows a recovery
   state but never clears `gpsState.watchId`, while `initGPS()` is idempotent on
   `watchId != null`. After a transient indoor loss the watch can go dead with no
   restart path. On a **non-permission** error, clear `watchId` (and stop the watch)
   so a later grant/retry can re-establish it. Keep permission-denied on the
   designed re-request path.

2. **Deferred-lock pin-at-origin race.** When `setLocked(true)` runs before the
   first fix, `_pendingGpsLock` defers anchoring to `onGPSPosition`. Confirm the
   caption panel / `commitPin` cannot persist a pin with null/origin coordinates
   during this window. If a path exists, gate it on `gpsState.ready` and show a
   "Getting your location…" state until the fix lands (or the user cancels).

3. **Local→GPS upgrade jump.** When a fix arrives and `anchorGpsPin()` flips to
   `gpsModeActive`, the camera moves from the gyro pivot to viewer-origin and the
   avatar repositions via `gpsToWorld`. Make this settle smoothly (short ease, or at
   minimum no visible teleport of the avatar relative to the room). The status copy
   should set the expectation that the precise anchor is landing.

4. **GPS accuracy honesty.** If accuracy is poor (e.g. >25 m), reflect it in the
   pin's stored anchor and/or a subtle UI hint, rather than implying a precise
   placement. (Schema already stores `gpsAccuracyM`.)

## Out of scope
Sensor finite-guards (task 01); the local gyro-lock camera math itself (already shipped).

## Definition of done
- [ ] Transient GPS loss recovers without a reload (manual, real device).
- [ ] No pin can be persisted at origin/null coords; deferred lock shows a designed
      waiting state and resolves or cancels cleanly.
- [ ] Local→GPS transition has no jarring avatar teleport.
- [ ] Pure helpers (e.g. accuracy bucketing, transition easing param) unit-tested.
- [ ] `npm test` green; esbuild clean; changelog entry for the visible reliability win.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/03-gps-lifecycle-lock-transitions.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
