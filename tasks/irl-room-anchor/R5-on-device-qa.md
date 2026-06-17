# R5 — On-device QA + verification protocol (the proof of "done")

> Epic R · Size **S–M** · No product code by default — this task **verifies** the
> running app on real hardware and files precise defects back to R1–R4. See README.

## Goal

Prove the feature works the way the user described — on real phones, not in a
headless harness — and capture the evidence. This codebase verifies all AR/`/irl`
work post-deploy (the sandbox has no camera/compass/GPS); this task is that step,
made rigorous and repeatable. The feature is **not "done" until this passes**.

## Why it matters

Everything upstream can be green in CI and still feel wrong on a phone: a reticle
that fights the thumb, a ghost that lags the heading, agents that drift as you
walk, an iOS device that shows a dead WebXR button, a room that renders rotated
on a second phone. Only on-device QA catches these — and the user asked for
"best-possible UX," which is a felt property, not a unit test.

## Pre-conditions

- R1–R4 merged and **deployed** (R4 §6 confirms the room columns + projection are
  live in prod). QA runs against the deployed URL, not localhost.
- Two test devices minimum: one **iOS Safari** (no WebXR — fallback path) and one
  **Android Chrome** (WebXR — precision path). A second phone (or a colleague's)
  for the cross-user check.

## The canonical scenario (run it verbatim)

Stand in a room. Facing one wall ("the cup is dead ahead"):

1. Open `/irl`, grant camera/motion/location, enter **Place agents** mode.
2. Turn ~90° right (toward "the couch"), set ~3 m, **Place** an agent. Confirm it
   appears sitting there, facing you.
3. Turn to face behind you (~180°); place **three** agents at ~2–4 m, slightly
   spread. Confirm three distinct agents, none stacked.
4. Turn to the left wall (~270°): confirm **nothing** is there.
5. Slowly rotate a full 360°. Acceptance: each agent **enters and leaves frame at
   its real bearing**, stays locked to its spot (does not ride the screen), and
   the left wall + the cup direction stay empty. This is the user's exact ask —
   it must feel like real people are in those spots.
6. Walk forward 2–3 m and back: agents hold their world positions (parallax is
   correct; they don't swim beyond the honest GPS-confidence amount).
7. Tap an agent → edit caption/avatar, remove. Re-place. All correct.

## Cross-user check

- On a second device at the same spot, open `/irl`. Acceptance: the **same layout
  appears on the same bearings** (within the room-confidence radius). If it's
  shifted/rotated, use **Align this room** (R2) once and confirm the whole cluster
  snaps onto reality and persists for both devices.

## Device matrix

| Path | iOS Safari | Android Chrome |
|---|---|---|
| Permissions (camera/motion/location) gates + recovery | ✓ | ✓ |
| Aim HUD + ghost preview tracks heading smoothly | ✓ | ✓ |
| Place / multi-place / edit / remove | ✓ | ✓ |
| Turn-to-see world lock (the 360° test) | ✓ | ✓ |
| WebXR floor reticle + drop | n/a (must be **absent**, no console noise) | ✓ |
| Room renders cross-device | ✓ | ✓ |
| One-gesture room calibrate (owner) | ✓ | ✓ |
| Loose-lock / denied-permission / POST-error states | ✓ | ✓ |

## What to capture

- A short screen capture of the 360° turn-to-see test on each OS (the
  share-composite path in `src/irl/share-frame.js` can grab frames).
- The browser console from each device (must be free of our errors/warnings).
- Network tab: `GET /api/irl/pins` returns room fields; `POST` sends a valid
  `room` block; no failed requests.
- Any defect filed as a precise, reproducible note against the owning task
  (R1–R4) with device, OS version, steps, and expected vs actual.

## Definition of done

- The canonical scenario passes on both iOS Safari and Android Chrome.
- The cross-user check passes (same layout on two devices; calibrate aligns it).
- The device matrix is fully ✓ (WebXR present only where supported; clean
  fallback elsewhere).
- Evidence captured; zero console errors/warnings from our code; no failed
  network calls. Any defects fixed in the owning task and re-verified.
- Only then is Epic R shipped — delete `tasks/irl-room-anchor/*` per
  `tasks/CLEANUP-PLAN.md`.
