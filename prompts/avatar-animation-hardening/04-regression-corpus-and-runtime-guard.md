# Task 4 — Cross-rig regression corpus + runtime "fallen pose" guard

> Read [00-README.md](./00-README.md) first. **Depends on Task 1** (benefits from Task 2). Follow
> [CLAUDE.md](../../CLAUDE.md).

This is the "zero error, stays shipped" guarantee. The lying-down bug shipped because nothing
asserted that an animated avatar stays upright. This task locks that invariant in tests across a
corpus of rig conventions **and** adds a runtime guard that catches any future regression in
production and degrades gracefully instead of showing a body on its back.

## What to build

### 1. A deterministic cross-rig regression corpus
- New test suite (e.g. `tests/animation-upright-invariant.test.js`) that, for a corpus of rig
  conventions × the `FEATURED` clips ([src/animation-presets.js](../../src/animation-presets.js)),
  retargets and asserts the **upright invariant**: the Hips world up-axis stays within a small
  tolerance of vertical at **every keyframe** (not just frame 0). Use the world-matrix
  reconstruction technique from the diagnosis (raw GLB parse → Bone graph → compose) so it runs in
  Node with no browser.
- Corpus must include the two committed real GLBs — **cz.glb** (Avaturn, identity convention) and
  **michelle.glb** (Mixamo, `−90°X` Hips) — plus synthetic rigs covering: a non-`±90` armature
  rotation, `DEF-`/snake_case bone names, and a missing-bones rig (coverage below
  `MIN_COVERAGE`). The michelle + celebrate case is the **named regression lock** for this bug.
- Assert the no-regression invariant too: cz.glb retarget output is byte-for-byte equal to the
  verbatim path.

### 2. Runtime "fallen pose" guard
- In [src/animation-manager.js](../../src/animation-manager.js) (or the viewer), after a clip is
  bound/first played, sample the rig's root/Hips world up-axis. If it tilts beyond a threshold at
  rest (a sign the retarget produced a fallen pose), treat it as a failure: skip/disable that
  action and fall back to the authored bind pose (the viewer already prefers the authored pose
  over a broken retarget — reuse that path), and report once via the existing client-error channel
  (`/api/client-errors`, logged `[client-error]`) with enough context (avatar id/url, clip,
  measured tilt) to diagnose. **No console spam, no per-frame checks** — sample once per
  attach/clip, debounced.
- The guard must never fire for healthy rigs (cz, michelle-post-fix). Make the threshold generous
  (e.g. > 45°) so it only catches genuine catastrophes, and prove it stays silent on the corpus.

### 3. Make it a gate
- Ensure the new suite runs under `npm test` and therefore gates the Vercel build (the only
  automated gate per repo memory). Keep it fast (raw parse, no GLTFLoader).

## Definition of done
- Cross-rig upright-invariant suite covering ≥4 conventions × featured clips, with michelle +
  celebrate as an explicit named regression test; all green.
- cz.glb byte-for-byte no-regression assertion present and green.
- Runtime fallen-pose guard wired: detects, falls back to bind pose, reports once via
  `/api/client-errors`; proven silent on healthy rigs.
- `npm test` + `npm run typecheck` green; suite is part of the gate.
- Changelog entry if user-visible (reliability/self-healing). `completionist` run; findings fixed.
- Handoff note for Task 6 (which surfaces to spot-check live).

Do not push unless the user approves (then both remotes).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

The moment every item above is **built, wired, verified, and committed**, remove it in the same
change:

```bash
git rm "prompts/avatar-animation-hardening/04-regression-corpus-and-runtime-guard.md"
```

Stage the deletion in the completion commit. A file that still exists is unfinished work.
