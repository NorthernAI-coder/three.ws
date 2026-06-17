# Task 1 — Full per-bone bind correction (limb fidelity across rig conventions)

> Read [00-README.md](./00-README.md) first (the retarget pipeline, the `Ta = Tr · Sr⁻¹ · Sa`
> invariant, the reference rig `cz.glb`, the already-shipped Hips-only baseline).
> Follow [CLAUDE.md](../../CLAUDE.md). The no-regression bar is absolute: `cz.glb` must stay
> byte-for-byte unchanged.

The shipped fix corrects only the **Hips** bone, so every rig now stands upright. But the clip
library is authored against the Avaturn reference rest pose (`cz.glb`), and a Mixamo rig is in a
**T-pose** while Avaturn is an **A-pose** — so on `michelle.glb` the arms, shoulders, and legs
still play in the wrong local frame (shoulders too high/spread, elbows rolled). The motion is
upright but anatomically off. This task extends the bind correction from Hips-only to **every
bone**, using the real authoring rest pose, so any humanoid rig performs clips faithfully.

## What to build

### 1. Capture the canonical authoring rest pose (as committed data)
- Write a reproducible generator under `scripts/` (e.g. `scripts/build-canonical-rest.mjs`) that
  reads the reference rig **[public/avatars/cz.glb](../../public/avatars/cz.glb)**, walks its
  skeleton, and emits each canonical bone's **local rest (bind-pose) quaternion**. cz.glb is the
  authoring convention (clips play on it with zero correction), so its rest pose *is* `Sr` for
  every bone. Key each entry by `canonicalizeBoneName(boneName)`.
- Emit the result as a small committed module/data file the pure retarget module can import
  without a build step (e.g. `src/animation-canonical-rest.js` exporting a frozen
  `{ [canonicalBone]: [x,y,z,w] }`). Round to a stable precision so the file is diff-friendly and
  deterministic. Document in a header comment that it is generated from `cz.glb` and how to
  regenerate it.
- The generator must run in Node without a browser (parse the GLB JSON chunk directly, as the
  diagnosis script did — `GLTFLoader` needs `self`/DOM). Make it idempotent and add an
  `npm run` script alias if that matches repo convention.

### 2. Wire the full rest pose into the retargeter
- In [src/animation-retarget.js](../../src/animation-retarget.js), replace the Hips-only
  `SOURCE_REST` with the full canonical rest map imported from Task 1.1 (keep `Hips` = identity
  if and only if that is what cz.glb actually has — verify, don't assume).
- `bindCorrections` already computes `C = Tr · Sr⁻¹` per canonical bone and skips identities, so
  the math generalizes for free. Confirm it now produces corrections for limb bones on a Mixamo
  rig and **still skips every bone on cz.glb** (all corrections identity → empty map → verbatim).
- Quaternion tracks get `premultiplyQuaternionTrack`. Position tracks: only Hips carries root
  motion, but if any other bone has a position track, decide and document whether it needs
  rotating (Task 2 owns root-motion correctness — coordinate, don't double-handle).

### 3. Correctness & no-regression proof
- **cz.glb invariant:** retargeting any clip onto cz.glb yields tracks identical to the verbatim
  path (deep-equal the values arrays). Add this as a locked test.
- **Mixamo fidelity:** on `michelle.glb`, after retarget, the *world-space direction* of each
  major limb segment (upper arm, forearm, thigh, shin) at representative keyframes should match
  cz.glb playing the same clip within a tolerance (e.g. ≤ a few degrees). Assert this numerically
  — reconstruct the bone graph from the GLB and compose world transforms (the diagnosis script in
  the conversation shows the technique). No eyeballing as the *only* check.
- Coverage gating (`MIN_COVERAGE`) and hip scaling must still behave as before.

### 4. Verify in a real browser
- `npm run dev`; load `michelle.glb` somewhere it animates (the `/pose` studio with
  `?avatar=`, or a scratch page under `scripts/`). Play idle, wave, dance, celebrate, walk.
  Confirm upright AND natural limb poses, zero console errors. Compare side-by-side with cz.glb.
  State the avatars and clips you exercised.

## Definition of done
- A generated, committed canonical-rest data file derived from `cz.glb`, plus the generator
  script (reproducible, documented, Node-only).
- `SOURCE_REST` (or its replacement) covers the full canonical skeleton; `bindCorrections`
  produces per-limb corrections for Mixamo rigs and an empty map for cz.glb.
- Locked tests: cz.glb verbatim-equality invariant + numeric limb-direction parity for a Mixamo
  rig. `npm test` green, `npm run typecheck` green.
- Browser-verified on ≥2 rig conventions; measured numbers reported.
- Changelog entry (improvement: avatars from any tool now animate with correct limb poses, not
  just upright).
- `completionist` run; all findings fixed. Handoff note for Task 2 (root motion) and Task 4
  (regression corpus).

Do not change root-motion/position semantics beyond what's needed here — that is Task 2. Do not
push unless the user approves (then both remotes).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired,
verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in
the same change:

```bash
git rm "prompts/avatar-animation-hardening/01-full-bind-correction.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. A file
that still exists is unfinished work; a file that is gone has shipped.
