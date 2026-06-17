# 07 — Verification harness + final sign-off

> Epic IRL/floor-anchor · Size **M** · Run last.
> Makes the whole feature provable without a phone, then closes the epic.

## Goal

Build a repeatable way to exercise the floor-anchor flow without physical AR
hardware, use it to verify every prior task, and complete the Definition-of-Done:
clean console across all states, passing tests, a changelog entry, and a written
record of what was confirmed on real hardware versus the harness.

## Why it matters

WebXR can't be driven by the normal headless browser, so without a harness this
feature is only ever "tested on my one Android phone" — which means regressions
ship invisibly. A fake-XR harness turns the session lifecycle and pose math into
something CI and any agent can assert against, and it's the only honest way to
claim "zero error" without hand-waving.

## Current state (real lines)

- The session is structured for injection: `WebXRSession` takes a `viewer` shim and
  callbacks ([src/ar/webxr.js:32-75](../../src/ar/webxr.js#L32-L75)); the IRL host
  builds that shim explicitly ([src/irl.js:1512-1525](../../src/irl.js#L1512-L1525)).
  Hit results flow through `frame.getHitTestResults` / `getPose`
  ([src/ar/webxr.js:165-197](../../src/ar/webxr.js#L165-L197)) — all fakeable.
- Pure math from task 01 (`src/irl/floor-anchor.js`) is already unit-testable.
- Existing patterns to mirror: server test
  [tests/api/irl-pins-anchor-pose.test.js](../../tests/api/irl-pins-anchor-pose.test.js),
  pure-module test [tests/irl-room-anchor.test.js](../../tests/irl-room-anchor.test.js),
  and the headless-Playwright recipe noted in the IRL perf memory.

## What to build

1. **Fake-XR harness** — `tests/helpers/fake-xr.js`: minimal stand-ins for
   `XRSession`, `XRFrame`, `XRHitTestResult`, `XRReferenceSpace`, and `XRAnchor` that
   let a test:
   - feed a scripted sequence of hit poses (no-hit → hit at a known matrix),
   - fire `select` to trigger `_handleSelect`,
   - emit `visibilitychange` and `end`,
   - assert `onHit`/`onAnchored`/`onTracking`/`onEnd` fire with the right payloads.
   Inject by passing a fake `navigator.xr` (or a renderer stub) into `WebXRSession` —
   keep Three.js real where cheap, stub only the XR device layer.

2. **Lifecycle tests** — `tests/ar-webxr-session.test.js`:
   - hit→tap→anchored emits `onAnchored` with the captured tap-moment pose
     ([src/ar/webxr.js:205-221](../../src/ar/webxr.js#L205-L221));
   - `createAnchor` rejection falls back to frozen pose and still fires `onAnchored`
     (task 05 degraded path);
   - OS `end` runs full restoration idempotently;
   - tracking-loss and visibility transitions fire once, on change only.

3. **Pose round-trip test** (extends task 01): a known hit matrix → `_readAnchorPose`
   → `anchorPoseToPin` → expected lat/lng/heading/height, proving the whole write
   path numerically.

4. **Console-audit pass.** Run the route audit from the console-audit baseline against
   `/irl`, exercise the AR entry/exit, and confirm the only logs are intentional.
   Note any known-benign lines explicitly.

5. **Definition-of-Done sweep.** Walk the CLAUDE.md DoD list for the whole feature:
   every state designed, no dead paths, reachable from the UI, tests green,
   `npm run typecheck` clean, `git diff` reviewed.

6. **Changelog.** Append a holder-readable `data/changelog.json` entry (tag
   `feature` or `improvement`) summarizing the upgraded floor placement (occlusion,
   precise facing, iOS support, polish — whatever shipped), run `npm run build:pages`
   to validate, and leave `npm run changelog:push` for post-deploy.

## Acceptance checklist

- [ ] `tests/helpers/fake-xr.js` + `tests/ar-webxr-session.test.js` exercise
      hit/tap/anchor/degrade/visibility/end without hardware; `npm test` green.
- [ ] Write-path pose round-trip is asserted numerically end-to-end.
- [ ] Console audit on `/irl` AR flow is clean (or every line documented benign).
- [ ] DoD list walked and satisfied for the full feature; `typecheck` clean.
- [ ] Changelog entry added and `npm run build:pages` validates it.
- [ ] A short written note records what was verified on a real device vs. the harness.

## Out of scope

New product behavior — this task verifies and documents what tasks 01–06 built. If
verification surfaces a real bug, fix it (no error without a solution) and note it.

## Verify

`npm test` runs the new suites in CI without a device. Then a final manual pass on
real hardware (Android WebXR + iPhone from task 06) confirming the harness's claims
match reality, captured in the sign-off note.
