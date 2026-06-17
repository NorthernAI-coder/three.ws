# Task 04 — WebXR session lifecycle and camera contention

**Phase:** 1 (AR correctness) · **Effort:** M · **Files:** `src/irl.js`, `src/ar/webxr.js`, `pages/irl.html`

## Why
On WebXR-capable devices (mainly Android Chrome) the "Place on floor" flow starts
an immersive session that owns the camera and a separate animation loop, while the
gyro+GPS path owns `getUserMedia` and the RAF tick. If these two overlap — double
camera acquisition, RAF not paused/resumed, overlay left interactive — the user
hits a black screen, a dangling camera track, or dead taps.

## Read first (verify before fixing)
- `enterFloorAnchor()` / XR start + the `WebXRSession` shim — `src/irl.js:~1475-1610`
- `enableAR()` / `disableAR()` camera ownership — `src/irl.js:279-396`
- The single RAF owner (`xrViewer._rafId`, `startTick`) — `src/irl.js:~1502-1513`, `tick()` end
- XR overlay markup + z-index/pointer-events — `pages/irl.html` `#irl-xr-overlay`, `#irl-xr-error`
- `src/ar/webxr.js` session start/end + clear-color restore

## Scope — confirm, then fix

1. **AR↔XR transition guard.** Entering the floor-anchor flow calls `disableAR()` to
   release `getUserMedia`; a fast tap on Camera AR during the async XR startup can
   re-acquire the camera and collide. Add a single `_arTransitioning` guard that
   blocks both `enableAR()` and the XR entry until the prior op fully settles
   (camera tracks stopped, session started/ended). Make teardown deterministic.

2. **RAF pause/resume correctness.** Confirm the IRL `tick()` RAF is cancelled while
   the XR animation loop runs and is restarted exactly once on session end (no
   double-tick, no frozen scene). Verify `xrViewer._rafId` is the sole handle.

3. **Overlay tap absorption.** Ensure `#irl-xr-overlay` is hidden immediately on
   session end and that its hit areas never sit above the canvas while AR/gyro mode
   is active. Add a guard in the tap handler to early-return when the overlay is
   visible.

4. **Clear color / background restore.** `WebXRSession` restores an opaque clear
   color on exit; IRL must re-assert the transparent AR clear color and `groundShadow`
   visibility so passthrough resumes correctly.

5. **Unsupported path stays clean.** iOS Safari (no `immersive-ar`) must never reveal
   the floor-anchor button or hit any XR code — confirm the support gate and that
   failures route to the designed "use Pin here instead" state, not a toast.

## Out of scope
Pin persistence schema (shipped); gyro/GPS math (tasks 01–03).

## Definition of done
- [ ] Rapidly toggling Camera AR ↔ Place on floor never double-acquires the camera,
      black-screens, or leaves a dangling track (manual, Android Chrome).
- [ ] Scene resumes live (not frozen) after exiting an XR session; single RAF.
- [ ] No dead taps after XR exit; overlay fully dismissed.
- [ ] iOS Safari never sees or touches XR code.
- [ ] esbuild clean; `npm test` green; changelog entry if user-visible.
