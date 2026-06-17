# Task 05 — Tap / raycast accuracy

**Phase:** 1 (AR correctness) · **Effort:** S · **Files:** `src/irl.js`

## Why
Inspecting an agent is the primary interaction. If taps miss — because the agent is
near the camera near-plane, off-center while gyro-locked, or behind a label hit-box
— the product feels broken. Tapping must reliably select the agent the user is
pointing at.

## Read first (verify before fixing)
- Tap handler + raycaster setup — `src/irl.js:573-588` and the pointerup tap logic
- Camera near plane (`0.05`) — `src/irl.js:249`
- Tap-to-place raycast vs the y=0 `rayPlane` — `src/irl.js:240-246`, place handler
- Floating label hit areas — `pages/irl.html` `.irl-agent-label` + `updateLabels()` in `src/irl.js`
- Nearest-agent proximity focus (if present) — search `AWARE_RADIUS` / awareness code

## Scope — confirm, then fix

1. **Near-plane clipping on close agents.** With `near = 0.05`, an agent held very
   close (common one-handed AR) can fall inside the clip cone and miss the ray.
   Verify behavior; if real, lower `near` to ~0.01 (check for depth-fighting) or
   clamp placement/selection so agents never sit inside the near cone.

2. **Raycast frame correctness while gyro-locked.** The raycaster must use the live
   camera position/orientation. In the local gyro-lock regime the camera sits at the
   captured pivot (not origin) — confirm NDC→ray uses `camera` directly (it should,
   via `setFromCamera`) and that edge-of-screen taps resolve to the correct world ray.

3. **Label vs mesh tap priority.** A tap on a floating name label and a tap on the
   mesh should both select the same agent, with the label taking priority where they
   overlap. Ensure label hit-boxes don't swallow taps meant for a different nearer
   agent.

4. **Nearest-agent tolerance.** Add a small angular/Screen-space tolerance so a tap
   *near* an agent selects it (fat-finger friendly), picking the nearest candidate
   when several are close. Avoid selecting agents the user can't see (behind camera).

## Out of scope
The inspect card content/API (shipped); placement of objects (shipped).

## Definition of done
- [ ] Tapping an agent — centered, edge-of-screen, close, or far — reliably opens its
      card (manual, real device; document a quick hit-rate check).
- [ ] No accidental selection of off-screen/behind-camera agents.
- [ ] Any pure picking helper (screen-space distance, candidate ranking) unit-tested.
- [ ] esbuild clean; `npm test` green; changelog entry if the win is user-visible.
