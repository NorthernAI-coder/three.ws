# 05 — Session lifecycle & error hardening (zero dead ends)

> Epic IRL/floor-anchor · Size **M** · Depends on 01. Run before 03/04.
> Where "zero error, production-ready" is actually earned.

## Goal

Make the AR session survive everything the real world throws at it —
backgrounding, an incoming call, tracking loss, camera contention, a rejected
anchor, a tap during GPS warm-up — with a designed, recoverable outcome every
time. No frozen overlays, no silent failures, no console noise, no state where the
user is stuck looking at a glued avatar with no way forward.

## Why it matters

The happy path already works. Production readiness is entirely about the unhappy
ones, and AR has many: phones lock, permissions get revoked mid-session, ARCore
loses tracking under low light, the OS reclaims the camera. Each must resolve to a
clear next action. This is the task that makes the difference between "demo" and
"shippable."

## Current state (real lines)

- Start path catches and shows a designed error with Retry / Use Pin:
  [src/irl.js:1564-1585](../../src/irl.js#L1564-L1585) (`showXrError`),
  [src/irl.js:1598-1626](../../src/irl.js#L1598-L1626) (`enterFloorAnchor` try/catch).
  Good baseline — extend it, don't rewrite.
- Camera contention with the getUserMedia passthrough is half-handled: `disableAR()`
  before entering ([src/irl.js:1591](../../src/irl.js#L1591)); exit restores clear
  color/background ([src/irl.js:1612-1614](../../src/irl.js#L1612-L1614)) but does
  **not** re-enable the passthrough the user had on.
- Anchor-creation rejection already falls back to frozen pose:
  [src/ar/webxr.js:213-219](../../src/ar/webxr.js#L213-L219) — but the user is never
  told the placement is degraded.
- Pre-GPS replay path exists but is untested:
  [src/irl.js:1640-1651](../../src/irl.js#L1640-L1651) (`onFloorAnchored` holds
  `_pendingXrAnchorPose`), dropped on exit ([src/irl.js:1607-1611](../../src/irl.js#L1607-L1611)).
  The actual replay on first fix lives in `onGPSPosition` — find and verify it.
- **No handling at all** for `XRSession.visibilitychange`, `inputsourceschange`,
  tracking loss (a frame with no viewer pose), or `session.end` originating from the
  OS rather than our exit button.

## What to build

1. **Visibility / interruption.** Listen for `session.addEventListener('visibilitychange', …)`
   in `WebXRSession`. On `hidden`/`blurred`, pause non-essential work and show a
   "Paused — bring the app forward" hint via the `onHit(false)`-style host callback;
   on `visible`, resume. Ensure an OS-initiated `end` runs the exact same
   `_handleEnd` restoration as our button (it already binds `end` →
   [src/ar/webxr.js:106](../../src/ar/webxr.js#L106) — verify the host `onEnd`
   cleanup at [src/irl.js:1605-1617](../../src/irl.js#L1605-L1617) is idempotent).

2. **Tracking loss.** In `_tick`, when `frame.getViewerPose(localSpace)` is null for
   N consecutive frames, surface a "Move to a brighter, more textured area" hint
   (new `onTracking(false)` callback) and hide the reticle; clear it when pose
   returns. Don't spam — transition-only, like `_setHit`.

3. **Degraded-anchor honesty.** When `createAnchor` returns/throws null
   ([src/ar/webxr.js:213-219](../../src/ar/webxr.js#L213-L219)), tell the host so the
   hint can say "Placed (this device can't lock it perfectly — it may drift)."
   Still persists the pin; just stops pretending it's rock-solid.

4. **Camera passthrough restore.** In the `onEnd` handler
   ([src/irl.js:1605-1617](../../src/irl.js#L1605-L1617)) re-enable the passthrough
   if `arActive` was on before entering (track the prior state in `enterFloorAnchor`).
   The user who was in camera-AR should return to camera-AR, not a black/gradient view.

5. **Pre-GPS replay correctness.** Confirm the `_pendingXrAnchorPose` set at
   [src/irl.js:1646](../../src/irl.js#L1646) is actually consumed by `onGPSPosition`
   on the first fix and routed through `persistFloorAnchor` (task 01's module). Add
   the missing wiring if it's not. Cover it in tests (07 harness / unit): tap →
   pose held → first fix → pin saved once, not zero or twice.

6. **Console hygiene.** Audit per the console-audit baseline: the only logging on
   failure should be the intentional `log.error('[irl] WebXR start failed', …)`
   ([src/irl.js:1622](../../src/irl.js#L1622)). No uncaught rejections, no warnings
   from feature probes ([src/ar/webxr.js:77-83](../../src/ar/webxr.js#L77-L83) already
   swallows correctly — match that everywhere).

## Acceptance checklist

- [ ] Backgrounding / locking the phone mid-session pauses cleanly and resumes (or
      exits) with full restoration — no frozen overlay.
- [ ] OS-initiated session end restores render loop, background, controls, and
      passthrough identically to the exit button (idempotent `_handleEnd`/`onEnd`).
- [ ] Tracking loss shows a recoverable hint and self-clears; never a dead reticle.
- [ ] Degraded anchor (no `XRAnchor`) is disclosed honestly and still saves a pin.
- [ ] Tap-during-GPS-warmup persists exactly once on the first fix (test-proven).
- [ ] Returning from AR restores prior camera passthrough state.
- [ ] Zero uncaught errors/warnings across the full lifecycle (console audit clean).

## Out of scope

Occlusion (03), cosmetic reticle states (04), iOS (06). This is correctness and
recovery only.

## Verify

WebXR device: enter AR, lock the phone, unlock → clean resume. Enter, get a call /
switch apps → clean exit + full restore. Cover a camera with your hand to force
tracking loss → recoverable hint. Tap immediately on entry before GPS locks, wait
for the fix → exactly one pin saved (check Network + `/api/irl/pins`).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-floor-anchor/05-session-lifecycle-hardening.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
