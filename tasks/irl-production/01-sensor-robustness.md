# Task 01 — Sensor robustness: never let a bad reading break the lock

**Phase:** 1 (AR correctness) · **Effort:** M · **Files:** `src/irl.js`

## Why
The world-lock camera is driven by `deviceorientation` (alpha/beta) and, on iOS,
`webkitCompassHeading`. Real devices deliver `null`, `NaN`, uncalibrated, and
discontinuous readings constantly. A single bad value currently propagates into
`cameraYaw`/`cameraPitch`, which can make the avatar snap, spin, freeze, or vanish.
This is the single most important reliability surface for the AR experience.

## Read first (verify each finding against the live code before fixing)
- `onDeviceOrientation()` — `src/irl.js:858-894`
- `readCompassHeading()` — `src/irl.js:843-849`
- `compassToYaw()` — `src/irl.js:851-856`
- `lerpAngle()` (already defined, reuse it) — search `function lerpAngle`
- The lock baseline capture — `src/irl.js:967-991` (setLocked)

## Scope — confirm, then fix

1. **Compass-loss goes undetected (stale heading).** `onDeviceOrientation` only
   updates `lastCompassHeading` when `compass !== null` (≈line 864). If the
   magnetometer becomes uncalibrated mid-session, `lastCompassHeading` keeps a
   stale value and the absolute branch keeps trusting it. Track validity explicitly
   (e.g. timestamp the last good reading) and fall back to the relative gyro path
   when the compass goes stale, rather than steering by a dead bearing.

2. **`NaN`/non-finite alpha & beta.** `const a = e.alpha ?? 0; const b = e.beta ?? 90;`
   (≈line 859-860) only guards `null`/`undefined`, not `NaN`. A `NaN` flows through
   the delta math into an invalid quaternion. Guard with `Number.isFinite()` and,
   on a bad reading, **hold the last valid value** instead of substituting 0/90
   (substituting 90 for beta yanks the pitch).

3. **0° ↔ 360° yaw discontinuity.** The absolute branch assigns
   `cameraYaw = compassToYaw(lastCompassHeading)` directly. Crossing the
   359°→1° boundary is a ~6.2 rad jump that reads as a violent spin. Smooth the
   approach with the existing `lerpAngle()` (shortest-path) rather than a hard
   assignment — fast enough to feel locked, smooth enough to never snap.

4. **Pitch clamp sanity.** Confirm `cameraPitch` stays within `PITCH_MIN/PITCH_MAX`
   on every path (it already clamps in some) and can never become `NaN`.

## Implementation guidance
- Extract the pure decision logic into a small testable helper, e.g.
  `resolveLockYaw({ compassHeading, compassFresh, baseAlpha, alpha, baseYaw })`
  returning the target yaw, and `isFiniteReading(a, b)`. Keep it side-effect free so
  it can be unit-tested without the DOM/sensors.
- Do not change the GPS-vs-local gating already in place
  (`lastCompassHeading !== null && gpsModeActive`); build the robustness *inside*
  each branch.

## Out of scope
Orientation/landscape handling (task 02), GPS lifecycle (task 03).

## Definition of done
- [ ] Every finding above either fixed or documented as already-correct with the line ref.
- [ ] Pure helpers extracted and covered by a new `tests/irl-sensor-robustness.test.js`
      (finite guards, compass-staleness fallback, shortest-path yaw across 0/360).
- [ ] No path can write `NaN` to `cameraYaw`/`cameraPitch` (add a final
      `Number.isFinite` guard before use as a backstop).
- [ ] `npm test` green; `npx esbuild src/irl.js --outfile=/dev/null` clean.
- [ ] Manual: on a real phone, spinning past north and waving the device through a
      magnetic dead-zone never spins/freezes the avatar. Document what you tested.
- [ ] Changelog entry if the user-visible jitter/spin is something holders would notice.
