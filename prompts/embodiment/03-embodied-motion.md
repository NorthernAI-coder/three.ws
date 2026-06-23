# Task 03 — Embodied Motion (the avatar's body, retargeted to real joints)

> Read `prompts/embodiment/00-README.md` and `CLAUDE.md` first. Depends on Task 01.
> Builds on the real canonicalize/retarget pipeline — reuse it, do not fork it.

## Mission

Make the physical robot **move as the same body** as the on-screen avatar: the agent's
canonical animation library (idle, walk, gestures) and its live pose drive the robot's real
joints, retargeted through the existing pipeline, inside a safety motion envelope. When the
avatar waves, the robot in the room waves.

## The innovation bar

Robots usually play a fixed, vendor-canned motion set. The game-changer: the **same
universal rig pipeline** that already lets any humanoid avatar play the clip library
(`src/glb-canonicalize.js` → `src/animation-retarget.js`) now retargets that *same* clip onto
the physical robot's joint space — so the agent's gestures are personal and consistent across
its avatar and its body, not a generic robot wiggle. One animation source, two bodies.

## What to build

1. **Robot rig mapping.** Treat the robot like any other skeleton: map its joint/URDF names to
   the canonical bone set the way `glb-canonicalize.js` maps avatar rigs. Add a robot joint-map
   module under `src/embodiment/` (and, mirroring the CLAUDE.md rule for new skeletons, cover
   it with a test like `tests/glb-canonicalize.test.js` does for avatar rigs). No curated
   allowlist — map by convention.
2. **Clip retarget → joints.** Reuse `src/animation-retarget.js` to retarget the canonical
   clips (`public/animations/`) onto the robot's joint space, producing time-sampled joint
   targets sent via `RobotLink.setJoints()` / `RobotLink.playClip()`. Idle + at least the core
   gesture set. Respect the robot's DOF — degrade gracefully when the robot has fewer joints
   than the avatar (collapse to nearest valid expression, never command a missing joint).
3. **Live pose path.** Wire `src/pose-rig.js` / `src/avatar-pose.js` / `src/body-mocap.js` so a
   live pose (e.g. teleop or mocap) streams to the robot through the same interface, at a real
   control rate with smoothing — no snapping.
4. **Safety motion envelope.** Every joint command is clamped to validated per-joint limits,
   velocity/accel limits, and a self-collision/balance guard before it reaches a motor. Reject
   (don't clip-and-pray) commands that can't be made safe; emit `robot:fault`. This envelope is
   mandatory and is the same gate Task 07 hardens — coordinate, don't duplicate.
5. **Twin parity.** The on-screen `<agent-3d>` avatar plays the identical clip in lockstep so
   the user sees the digital twin mirror the physical motion (and, in sim mode, the avatar *is*
   the body). Emit `motion:played` on the bus.

## Wiring & real-API mandate

- Reuse the real retarget/canonicalize pipeline; do not write a parallel animation system.
- Joint targets come from real retargeting of real clips — no hand-typed fake angle arrays.
- No motion command bypasses the safety envelope.

## Definition of done

- [ ] Robot joint-map maps its rig to the canonical skeleton, test-covered; no curated allowlist.
- [ ] Canonical clips retarget onto the robot's joints via the existing pipeline; idle + core
      gestures play; fewer-DOF robots degrade gracefully.
- [ ] Live pose/mocap streams to the robot smoothly at a real control rate.
- [ ] Safety envelope clamps/rejects unsafe joint commands and emits `robot:fault`.
- [ ] Avatar twin mirrors motion in lockstep; `motion:played` emitted.
- [ ] No console errors/warnings; WebGL budget respected; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Make gestures *mean* something: tie gesture selection to the agent's mood (Living Agents mood
model / Task 04 face) so the body's posture matches its state, and add a "mirror me" mode that
maps the user's webcam pose to the robot via `body-mocap`. Smooth, intentional, never janky.

## When done

Delete this file. Report the joint-map approach, which clips retarget, the safety envelope
limits, and how the twin stays in lockstep.
