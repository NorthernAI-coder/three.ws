# IRL floor-anchor — verification sign-off (task 07)

> Closes the epic. Records what the fake-XR harness proves in CI vs. what only a
> real device can confirm, the one bug verification surfaced, and the DoD walk.

## What ships provable without a phone

WebXR `immersive-ar` can't be driven by a headless browser — no camera, no IMU,
no compositor — so before this task the floor-anchor session was only ever
exercised on one Android phone, and any regression in its session lifecycle or
pose math would have shipped invisibly. The harness closes that gap.

- **`tests/helpers/fake-xr.js`** — stand-ins for `navigator.xr`, `XRSession`,
  `XRFrame`, `XRHitTestResult`, `XRReferenceSpace` and `XRAnchor`. A test feeds a
  scripted sequence of frames (no-hit → hit at a known matrix → anchored), fires
  `select` / `visibilitychange` / `end`, and steps the render loop by hand. Three.js
  stays **real** (the reticle group, scene, content, XR camera, matrix math); only
  the GPU renderer and the XR device are faked.
- **`tests/ar-webxr-session.test.js`** — 14 lifecycle tests, green in CI with no
  hardware:
  - session bring-up wires `hit-test` (required), `anchors`/`local-floor`/`dom-overlay`
    (optional, the last only when a root is supplied);
  - `onHit` fires only on the searching↔found transition; the reticle Group and
    content track the hit pose; tap retires the reticle and emits `onAnchored` with
    the **tap-moment** pose and `{ degraded: false }`; the live anchor then drives
    content frame-to-frame;
  - **degraded path (task 05):** `createAnchor` rejecting *or* being absent still
    anchors, flagged `{ degraded: true }`, frozen at the tap pose — never broken;
    a second tap is ignored (anchor exactly once);
  - **OS-initiated end** restores the viewer (XR disabled, loop torn down, hit-test
    source cancelled, reticle/shadow/pulse disposed, controls re-enabled, content
    transform restored, visibilitychange unsubscribed) and runs **exactly once** —
    a redundant `end()` is a no-op;
  - **tracking loss** declares lost only after the sustained miss threshold, fires
    once, recovers on the first pose, and hides the reticle so no stale target is
    tappable; **visibility** changes fire per transition and pause per-frame work
    while hidden;
  - **write-path round-trip:** a known hit matrix → `_readAnchorPose` →
    `anchorPoseToPin` reloads to the exact east/north/height/heading we tapped
    (`source: 'webxr'`), end-to-end through the real session.

Pure layers already had their own suites and still pass: `ar-anchor-lifecycle`
(tracking machine, visibility enum, persist-gate save-exactly-once),
`irl-floor-anchor` (pose→pin math incl. sub-degree facing), `irl-room-anchor`.
Combined: **71/71 green.** `npm run typecheck` clean.

## Bug found and fixed during verification

The harness caught a real conflict the on-device testing never would have: on
tracking loss `_setTracking` hid the reticle, but later in the **same** `_tick`
the hit-block's dropout-tolerance branch re-showed it (`reticle.visible = _hadHit`),
leaving exactly the stale reticle the code comment promises is hidden. Fixed in
[src/ar/webxr.js](../../src/ar/webxr.js) by gating the re-show on
`!this._trackingState.lost`, so brief dropouts still hold a calm dim reticle while
genuine tracking loss keeps it hidden. Covered by the "hides the reticle on
tracking loss" test.

## Console audit (`/irl` AR flow)

The AR device layer — `src/ar/webxr.js`, `src/ar/depth-occlusion.js`,
`src/ar/anchor-lifecycle.js` — emits **no** console output on any path (the paused
tick is deliberately silent). The only AR-flow logs live in `src/irl.js`:

- `log.error('[irl] WebXR start failed:', err)` — fires only on a genuine session
  rejection (camera/motion denied, or a device that can't hold AR) and is paired
  with the actionable error UI (Retry / Use Pin instead). Intentional; `error` is
  un-gated by design (`src/shared/log.js`).
- `log.info('[irl] simulated location cleared …')` — dev-only simulated-GPS path;
  `info` is silenced in production unless `?debug` is set.

No other console lines originate in the AR flow. A full Playwright route audit
(`npm run audit:web`) cannot enter `immersive-ar` headlessly — which is the whole
reason this harness exists — so the in-session console is audited by source review
plus the harness; the surrounding `/irl` page is covered by the standard audit.

## Confirmed on real hardware vs. harness

| Behavior | Harness (CI) | Real device |
| --- | --- | --- |
| Session start / feature negotiation | ✅ asserted | ⬜ pending hardware pass |
| Hit-test reticle + content follow | ✅ asserted | ⬜ |
| Tap → anchor → live anchor follow | ✅ asserted | ⬜ |
| Degraded (no/failed `createAnchor`) fallback | ✅ asserted | ⬜ |
| Tracking-loss / recovery + reticle hide | ✅ asserted | ⬜ |
| Backgrounding pause / resume (call, lock) | ✅ asserted | ⬜ |
| OS-end restoration, idempotent | ✅ asserted | ⬜ |
| Pose → GPS pin numeric round-trip | ✅ asserted | ⬜ |
| Real-world occlusion (depth-sensing) | ⬜ device-only | ⬜ Android w/ depth |
| iOS AR Quick Look placement parity (task 06) | ⬜ device-only | ⬜ iPhone |
| Cross-user reload at the same spot/angle | ✅ math asserted | ⬜ two devices |

**Manual pass to record before final ship:** one Android WebXR device (anchor
hold, occlusion behind real geometry, recovery after a phone call) and one iPhone
(Quick Look entry/exit, placement parity). The harness's claims above should match
what those two devices show; note any divergence here.

## Definition of Done

- [x] Harness + lifecycle suite exercise hit/tap/anchor/degrade/visibility/end with
      no hardware; `npm test` suites green (71/71 across the AR/IRL pure + session
      tests), `typecheck` clean.
- [x] Write-path pose round-trip asserted numerically end-to-end.
- [x] Console audit clean; the two intentional `/irl` log lines documented benign.
- [x] One real bug surfaced by verification, fixed, and covered by a test.
- [x] Changelog entry added (`data/changelog.json`) and validated by
      `npm run build:pages`. `npm run changelog:push` left for post-deploy.
- [x] No mocks/fake data in shipped code; the harness lives under `tests/` only.
- [ ] Real-device pass (Android + iPhone) — pending physical hardware; table above.
