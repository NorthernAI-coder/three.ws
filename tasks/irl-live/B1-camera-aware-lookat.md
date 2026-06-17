# B1 — Camera-aware look-at (agents notice the viewer)

## Goal

Nearby placed agents become **aware of the viewer**: each loaded agent smoothly
turns its head/torso (or whole body) to face the phone camera as the user walks
around it — the AR analog of the desktop "avatar follows the mouse cursor"
trick, where here the cursor *is* the phone. Add idle micro-behaviours when
nobody is close and a subtle "notice" reaction when the viewer gets near.

## Why it matters

A locked GLB that stares blankly at a fixed heading reads as a prop. An agent
that catches your eye when you walk up to it reads as *present* — this is the
moment IRL stops being a sticker on the world and becomes a being in it. It is
the single cheapest thing that makes someone screenshot the feature.

## Current state (real lines)

`src/irl.js`:
- `loadPinGLB(pin)` ~990 swaps the beacon for `gltf.scene`, re-applies
  `pin.group.rotation.y = -(pin.heading * Math.PI / 180)` ~1002, sets
  `pin.glbLoaded = true`. The whole model is parented under `pin.group`.
- `nearbyPins` entries carry `{ ...pin, group, labelEl, glbLoaded, distance_m }`
  (created in `spawnNearbyPin` ~924).
- `tick()` ~1295 is the single rAF loop. After `animMgr.update(dt)` ~1383 it
  calls `updateLabels()` ~1395 / `updateRadar()` ~1396 then renders. The viewer
  camera world position is `camera.position` (in GPS mode pinned to
  `(0, EYE_HEIGHT, 0)` ~1357).
- `lerpAngle(a, b, t)` ~1289 already exists for shortest-arc yaw easing — reuse it.

There is **no** per-frame orientation logic for nearby agents today; heading is
applied once at load.

## What to build

A `updateAgentAwareness(dt)` step, called from `tick()` right after
`animMgr.update(dt)`, that turns loaded agents toward the camera.

1. **Cache the head/spine bone on load.** In `loadPinGLB`, after the model is
   added, traverse for a head/neck bone and store it on the pin so we don't walk
   the tree every frame:
   ```js
   pin.headBone = null; pin.spineBone = null; pin.baseYaw = pin.group.rotation.y;
   model.traverse(n => {
     if (!n.isBone) return;
     const nm = n.name.toLowerCase();
     if (!pin.headBone && /head|neck/.test(nm))  pin.headBone  = n;
     if (!pin.spineBone && /spine|chest|torso/.test(nm)) pin.spineBone = n;
   });
   pin.restHeadQuat = pin.headBone?.quaternion.clone() || null;
   ```
2. **Per-frame, cheap, gated.** Only process agents that are loaded AND within
   `AWARE_RADIUS_M` (e.g. 12 m via `pin.distance_m`) AND on-screen (reuse the
   `_lblVec.project(camera)` test from `updateLabels`). Cap to the nearest ~5.
   ```js
   const AWARE_RADIUS_M = 12, NOTICE_RADIUS_M = 4;
   const HEAD_CLAMP = 0.7, BODY_SLERP = 0.05, HEAD_SLERP = 0.12; // ~rad, eased
   ```
3. **Aim the body (yaw only) toward the camera ground projection**, eased with
   `lerpAngle` so it never snaps:
   ```js
   const dx = camera.position.x - pin.group.position.x;
   const dz = camera.position.z - pin.group.position.z;
   const wantYaw = Math.atan2(dx, dz);
   pin.group.rotation.y = lerpAngle(pin.group.rotation.y, wantYaw, BODY_SLERP);
   ```
   When the viewer is outside `AWARE_RADIUS_M`, ease `rotation.y` back to
   `pin.baseYaw` instead so it returns to its placed heading.
4. **Layer head tracking on top, clamped to a natural neck cone.** If a head
   bone exists, slerp it toward a target that looks at the camera, but clamp the
   relative yaw/pitch to `±HEAD_CLAMP` so it never does an owl-twist; fall back
   to body-only turn when the bone is missing. Build the target with a temp
   `Quaternion`/`Matrix4.lookAt`, decompose relative to the parent, clamp, slerp
   from `pin.restHeadQuat`.
5. **Idle micro-behaviour (not engaged).** When no viewer is within
   `AWARE_RADIUS_M`, drive a slow sine-based head drift + occasional weight
   shift so the agent looks alive, not frozen:
   ```js
   pin.idleT = (pin.idleT || 0) + dt;
   const driftYaw = Math.sin(pin.idleT * 0.4) * 0.12;
   ```
6. **"Notice" reaction on approach.** The first frame `pin.distance_m` crosses
   below `NOTICE_RADIUS_M` (track `pin.noticed`), trigger a one-shot: snap the
   head-slerp speed up for ~400 ms and, if the AnimationManager exposes a
   greet/wave clip, `animMgr` crossfade to it then back to idle; otherwise a
   small +Y scale pop (1.0→1.04→1.0) on `pin.group`. Reset `pin.noticed=false`
   when they leave so re-approach re-greets.

`tick()` wiring:
```js
animMgr.update(dt);
updateAgentAwareness(dt);   // ← new, before label projection
updateLabels();
```

## Data / API changes

None. Pure client render logic over data already in `nearbyPins`. No new fields,
no endpoint, no DB.

## Acceptance checklist

- [ ] Loaded agents within ~12 m visibly turn to face the phone camera as the
      user circles them; motion is eased (no snapping) via slerp/lerp.
- [ ] Head/neck turn is clamped to a natural cone; no owl-head over-rotation.
- [ ] Agents with no head bone fall back to whole-body yaw cleanly.
- [ ] Outside the aware radius, agents ease back to their placed `heading`.
- [ ] Idle agents show subtle gaze drift, not a frozen stare.
- [ ] Crossing the notice radius fires a one-shot greet/pop exactly once per
      approach; leaving + re-approaching re-fires it.
- [ ] Only loaded, on-screen, nearest-N agents are processed each frame; no
      measurable FPS drop with 5 agents on a mid-tier phone.
- [ ] No console errors; no per-frame allocations (reuse temp vectors/quats).

## Out of scope

- Cross-user broadcast of where an agent is looking (single-viewer only here).
- Gaze toward *other* agents or full IK. Real animation-clip authoring.
- Eye-bone / blendshape tracking (head-bone granularity is enough).

## Verify

`npm run dev`, open `/irl` on a phone (or device-emulated viewport), place/lock
an agent, then move the camera around it. Confirm the agent tracks you, eases
back when you back off, idles when you leave the radius, and greets once on
approach. Profile a frame in DevTools to confirm `updateAgentAwareness` stays
sub-millisecond with 5 loaded agents.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-live/B1-camera-aware-lookat.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
