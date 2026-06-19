# Task 02 — Orientation changes, resize, and camera FOV fidelity

**Phase:** 1 (AR correctness) · **Effort:** M · **Files:** `src/irl.js`, `pages/irl.html`

## Why
The AR math assumes portrait. When a user rotates to landscape, or the viewport
resizes (browser chrome show/hide on scroll, split view), the camera optics and
the gyro frame drift out of agreement with the real world: the avatar changes
scale or slides off its anchor. A polished AR product holds the anchor through
rotation.

## Read first (verify before fixing)
- FOV derivation from the video track — `src/irl.js:342-359` (runs once in `enableAR`)
- Resize handler — search `addEventListener('resize'` and `function resize` in `src/irl.js`
- Gyro yaw/pitch math (portrait assumption) — `src/irl.js:858-894`, GPS branch `~3946-3964`
- Viewport meta + safe-area CSS — `pages/irl.html` `<meta name="viewport">` and `.irl-*` layout

## Scope — confirm, then fix

1. **FOV not re-derived on rotate.** The camera FOV is computed from the video
   track resolution once in `enableAR()`. On `orientationchange` the resize handler
   updates canvas size + `camera.aspect` but not FOV, so avatar scale is wrong in
   landscape. On orientation change (and when the video track's reported dimensions
   change), re-read `track.getSettings()` and re-derive FOV with the existing math.

2. **Portrait-only gyro frame.** The yaw/pitch mapping assumes portrait. On a
   screen-orientation change, fold `screen.orientation.angle` into the orientation
   interpretation so the lock stays true when the device is held in landscape
   (or document this as an explicit "portrait recommended" constraint with a
   one-time hint if landscape support is deferred — but prefer to support it).

3. **Resize/`visualViewport` robustness.** Ensure resize re-applies the perf tier's
   pixel ratio and `renderer.setSize` correctly, and that iOS Safari's dynamic
   toolbar (which fires resize on scroll) does not thrash. Debounce if needed.

4. **Safe-area + notch.** Verify all fixed-position controls respect
   `env(safe-area-inset-*)` in both orientations (joystick, bottom controls,
   topbar). See task 10 for the full responsive pass; here just the AR-canvas /
   camera-coupled pieces.

## Implementation guidance
- Listen to both `orientationchange` and `screen.orientation`'s `change` event
  (feature-detect; iOS support varies) plus `resize`, funnel into one
  `onViewportChanged()` that re-derives FOV + aspect + pixel ratio together.
- Keep the FOV re-derivation a no-op when AR is off (no video track).

## Out of scope
Sensor finite-guards (task 01); pure responsive CSS not coupled to the camera (task 10).

## Definition of done
- [ ] Rotating the device portrait↔landscape keeps the avatar at correct real-world
      scale and on its anchor (manual, real device — document results).
- [ ] No console errors on rapid rotate/resize; renderer pixel ratio honored.
- [ ] Any extracted angle math unit-tested.
- [ ] `npm test` green; esbuild clean.
- [ ] Changelog entry if behavior visibly improves for users.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/02-orientation-resize-fov.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
