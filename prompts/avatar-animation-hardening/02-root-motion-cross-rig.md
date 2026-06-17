# Task 2 — Root-motion correctness across rig conventions

> Read [00-README.md](./00-README.md) first. **Depends on Task 1** (full bind correction) — read
> its handoff note. Follow [CLAUDE.md](../../CLAUDE.md); the `cz.glb` no-regression bar is absolute.

The shipped fix rotates the Hips **position** track by the same correction `C` used on the Hips
**quaternion**. That is exact only when the Hips' parent armature rotation equals `C⁻¹` — true for
the standard Mixamo `+90°X armature / −90°X Hips` split, but **not general**. For locomotion
clips (walk, run, jump with travel), root motion must move the body in the correct world direction
and distance on *any* rig, or a walking avatar drifts sideways, sinks, or moonwalks.

## What to build

### 1. Correct hip position by the true parent-frame difference
- Root motion lives in the Hips' **parent** local frame. The clip authors it in the authoring
  rig's Hips-parent frame (cz.glb: armature with no rotation → world-aligned Y-up). On the target
  rig, the Hips' parent may carry an arbitrary rest rotation (Mixamo armature `+90°X`, others
  differ).
- In [src/animation-retarget.js](../../src/animation-retarget.js), compute the position
  correction from the **parent's** rest-frame difference rather than reusing the Hips' own bone
  correction. You will need the target Hips' parent rest world-rotation; capture it alongside
  `_canonicalRest` (extend `canonicalRestMapFromObject` / the attach-time capture, or add a small
  dedicated capture for the Hips parent). Keep the module pure.
- Preserve hip **scaling** (`hipScale`) — rotation and uniform scale compose; document the order.
- Result: world-space root displacement per frame on the target equals the authoring world-space
  displacement (scaled for height), regardless of the rig's axis convention.

### 2. Validate locomotion on multiple conventions
- Reconstruct each rig's bone graph (cz.glb, michelle.glb, and at least one more convention —
  e.g. a Ready Player Me or synthetic rig with a non-`±90` armature rotation) and, for a walk and
  a jump clip, assert:
  - **Direction:** net world XZ travel points the same way on all rigs (no sideways drift).
  - **Verticality:** the body does not sink into or float above the ground plane beyond tolerance.
  - **In-place clips stay in place:** idle/wave/celebrate produce ~zero net XZ travel on every rig.
- Add these as deterministic unit tests (no browser, no GLTFLoader — raw GLB parse + world-matrix
  composition).

### 3. Browser verification
- `npm run dev`; play walk/run on michelle.glb and cz.glb in `/pose` or `/walk`. Confirm the
  avatar travels forward correctly, feet plant (no gross sliding), no console errors. Compare the
  two rigs moving in the same direction. Report what you saw.

## Definition of done
- Hip position is corrected by the parent-frame difference; `cz.glb` output is unchanged
  (identity parent correction → byte-for-byte equal — locked test).
- Locomotion direction/verticality/in-place invariants hold across ≥3 rig conventions
  (unit-tested) and are confirmed in a browser on Mixamo + Avaturn rigs.
- `npm test` + `npm run typecheck` green.
- Changelog entry if user-visible (e.g. walking avatars travel correctly on every rig).
- `completionist` run; findings fixed. Handoff note for Task 4 (add locomotion cases to the
  regression corpus).

Do not push unless the user approves (then both remotes).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

The moment every item above is **built, wired, verified, and committed**, remove it in the same
change:

```bash
git rm "prompts/avatar-animation-hardening/02-root-motion-cross-rig.md"
```

Stage the deletion in the completion commit. A file that still exists is unfinished work.
