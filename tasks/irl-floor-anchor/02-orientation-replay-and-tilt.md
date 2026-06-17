# 02 — Orientation replay: make `anchor_quat` real (or retire it)

> Epic IRL/floor-anchor · Size **M** · Depends on 01.
> Closes the "stored but never used" gap on the render-back path.

## Goal

Decide and implement what the viewer does with the orientation captured at
placement. Right now the full tap-moment quaternion is written to the database and
returned to every client, then **silently ignored** when the agent is rendered.
Either use it (precise facing + optional surface tilt) or stop persisting it.
Shipping a dead column that looks like a feature is exactly the "half-wired" the
operating rules forbid.

## Why it matters

A pin you place facing a specific way should reload facing that way for everyone.
Today render-back only applies a rounded integer `anchor_yaw_deg`; the richer
`anchor_quat` — which also carries any surface tilt — is dropped. The result: a
flat-floor placement is *mostly* fine, but the data we collect promises fidelity
we never deliver, and a sloped or non-axis placement reloads subtly wrong.

## Current state (real lines)

- Write path stores it: [src/irl.js:1669-1673](../../src/irl.js#L1669-L1673)
  forwards `quat: [x,y,z,w]`; `savePin` carries it through
  [src/irl.js:1385-1387](../../src/irl.js#L1385-L1387).
- Server persists + returns it: [api/irl/pins.js:211](../../api/irl/pins.js#L211)
  (`anchor_quat JSONB`), returned at [api/irl/pins.js:540](../../api/irl/pins.js#L540).
- Render-back only uses height + yaw:
  [src/irl.js:1146-1156](../../src/irl.js#L1146-L1156) `pinHeightM` /
  `anchor_yaw_deg`, applied at [src/irl.js:1273-1330](../../src/irl.js#L1273-L1330)
  (`avatarRig.position` from `wp`, `avatarRig.quaternion.setFromAxisAngle(upY, …)`).
  **`anchor_quat` is never read in `src/irl.js`.**
- The agent content also never picks up surface tilt at placement time:
  [src/ar/webxr.js:176-178](../../src/ar/webxr.js#L176-L178) and
  [195-196](../../src/ar/webxr.js#L195-L196) set `content.position` only; the
  reticle gets the hit quaternion but the avatar does not.

## Decision (bake this in — do not block)

**Recommended:** keep humanoid avatars **upright** (yaw-only) for placement, but
make yaw *exact* by deriving it from `anchor_quat` when present (full float),
falling back to the rounded `anchor_yaw_deg` for legacy/gyro pins. Do **not** tilt
a standing humanoid to match a 30° ramp — it looks broken, not realistic. Reserve
true surface-tilt for a future non-humanoid prop mode and gate it behind an
explicit `anchor_tilt` flag, off by default.

This means: `anchor_quat` becomes the high-precision source for yaw, justifying its
existence, while we consciously ignore pitch/roll for humanoids and document why.

If after reading the code you conclude the rounded yaw is indistinguishable in
practice, the alternative is to **retire** the column: stop writing `quat`
(src/irl.js), drop it from the select/return (api/irl/pins.js), and migrate it out.
Pick one path; no dead field survives this task.

## What to build (recommended path)

1. Add `yawDegFromQuat` (from task 01's `floor-anchor.js`) as the render-back yaw
   source: in the pin pose resolver around [src/irl.js:1146-1156](../../src/irl.js#L1146-L1156),
   prefer `Array.isArray(pin.anchor_quat)` → `yawDegFromQuat(...pin.anchor_quat)`
   over the integer `anchor_yaw_deg`; keep `anchor_yaw_deg` as the fallback so gyro
   pins (no quat) and legacy rows are unaffected.
2. Keep `setFromAxisAngle(upY, yaw)` upright application
   ([src/irl.js:1330](../../src/irl.js#L1330)) — exact yaw, no tilt.
3. Document the deliberate pitch/roll drop with a one-line comment next to the
   resolver, referencing this task.
4. Round-trip test in `tests/irl-floor-anchor.test.js` (extend 01): a quat encoding
   yaw=137° survives `anchorPoseToPin` → `yawDegFromQuat` to within <0.5°, proving
   precision is actually retained end-to-end.

## Data / API changes

None if taking the recommended path (columns already exist). If retiring instead:
a guarded `ALTER TABLE irl_pins DROP COLUMN IF EXISTS anchor_quat` migration plus
removal from the select/return lists, and a changelog note.

## Acceptance checklist

- [ ] `anchor_quat` is either **consumed** on render-back (exact yaw, documented
      upright policy) or **fully retired** (write, select, return, column) — not dead.
- [ ] Gyro/legacy pins (no quat) render exactly as before — fallback intact.
- [ ] A WebXR pin placed facing a non-axis direction reloads within <1° of the tap
      facing on a second client (or the 07 harness asserts the float survives).
- [ ] No console errors; `npm test` + `npm run typecheck` green.

## Out of scope

Surface tilt for humanoids (intentionally rejected here) and the prop-mode tilt
flag (future). Occlusion is task 03.

## Verify

Place a floor anchor facing ~45° off a cardinal direction, reload `/irl` on a
second device near the spot, confirm the agent faces the same way — visibly tighter
than the old integer-rounded yaw.
