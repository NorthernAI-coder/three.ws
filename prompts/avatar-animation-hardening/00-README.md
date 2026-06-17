# Avatar Animation Hardening — build plan

This directory contains **sequenced task prompts** that take avatar animation on three.ws
from "the catastrophic case is fixed" to **100% production-ready: zero broken poses, correct
across every rig convention, and a polished embed/home-page experience.** Each `NN-*.md` file
is a self-contained unit of work meant to be pasted into a **fresh agent chat** in this repo.
Run them **in order** where the dependency column says so. Every task assumes the agent has
loaded the repo's `CLAUDE.md` operating rules (no mocks, no stubs, wire 100%, real APIs, design
every state, verify in a real browser).

## Why this initiative exists

The platform animates an avatar by retargeting one shared clip library
([public/animations/clips/*.json](../../public/animations/clips)) onto whatever rig a user
loads. A bug surfaced on the home page: the "Create" door-card avatar (`michelle.glb`, a Mixamo
export) **rendered lying on its back** the moment it played `celebrate`, while the neighboring
Avaturn-rigged avatar animated fine.

Root cause: Mixamo/FBX rigs bake the Y-up correction as `+90°X` on the armature root and a
compensating `−90°X` on `Hips`. The retargeter copied each clip bone's local rotation
**verbatim**, overwriting that `−90°X` and tipping the body flat.

### What already shipped (baseline — do NOT redo)

Commit `a1cdc528` added a **bind-rotation-aware correction** to
[src/animation-retarget.js](../../src/animation-retarget.js): for each bone the retargeter now
replays the clip's *deviation from rest* in the **target rig's own rest frame**
(`Ta = Tr · Sr⁻¹ · Sa`), instead of copying verbatim. The primitives are in place:

- `SOURCE_REST` — a map of `canonical bone → authoring-rig rest quaternion`. **Currently lists
  only `Hips`** (rest = identity), because Hips is the bone carrying the up-axis convention.
- `bindCorrections(targetRest)` — builds the per-bone correction `C = Tr · Sr⁻¹`, skipping bones
  where it is identity (so a matching rig round-trips bit-for-bit — verified on `cz.glb`).
- `canonicalRestMapFromObject` / `canonicalRestMapFromRig` — capture the target rig's rest pose.
- `premultiplyQuaternionTrack` / `rotateVectorTrack` — apply the correction to clip tracks.
- `AnimationManager.attach` captures `_canonicalRest` while the model is in bind pose and passes
  it through `_retarget`.
- Unit coverage in [tests/animation-retarget.test.js](../../tests/animation-retarget.test.js)
  (the `bind-rotation correction` describe block).

Verified result: michelle's Hips up-axis went from **90.4° off vertical → 1.7°**; cz unchanged
(**1.7° → 1.7°**).

**The fix is intentionally scoped to Hips only.** That stands every rig upright but leaves limb
fidelity, locomotion root-motion, ingest-time normalization, a permanent regression guard, and
the embed/home UX as the remaining work. That is what these tasks deliver.

## Task sequence

| # | File | Depends on | What it delivers |
|---|------|-----------|------------------|
| 1 | `01-full-bind-correction.md` | — | Extend `SOURCE_REST` from Hips-only to the **full** canonical authoring rest pose (captured from the reference rig) so limbs retarget correctly onto T-pose/A-pose mismatched rigs |
| 2 | `02-root-motion-cross-rig.md` | 1 | Make hip **position** (root motion) correct for any parent-axis convention — walk/run travels the right world direction & distance on Mixamo/RPM/Avaturn rigs |
| 3 | `03-ingest-rig-normalization.md` | — (parallel) | Canonicalize rig orientation + bone names at **avatar ingest** so all stored avatars share one convention — defense-in-depth + zero runtime cost for future avatars |
| 4 | `04-regression-corpus-and-runtime-guard.md` | 1 | Locked cross-rig regression corpus (upright-invariant assertions) + a runtime "fallen pose" guard wired to the observability pipeline — the "zero error, stays shipped" guarantee |
| 5 | `05-embed-and-home-avatar-ux.md` | — (parallel) | The surface the bug appeared on: `<agent-3d>` loading/error/reduced-motion states, seamless looping, per-clip framing, offscreen pause — the "best UX" mandate |
| 6 | `06-final-qa-and-promote.md` | 1–5 | End-to-end QA across every avatar surface (/pose, avatar pages, embeds, /irl, /walk), changelog, completionist — "shipped complete" |

Tasks 1, 3, and 5 are independent and can run in parallel. 2 and 4 follow 1; 6 is last.

---

## Shared architecture & conventions (READ THIS — every task relies on it)

These are verified facts about the codebase. Cite file paths in your work and **read the
referenced files before editing.**

### The retargeting pipeline (the heart of this initiative)
- [src/animation-retarget.js](../../src/animation-retarget.js) — pure module (three + the
  canonicalizer only; runs in browser AND Node). Key exports: `retargetClip`,
  `retargetClipToObject`, `retargetClipToRig`, `canonicalNodeMapFromObject`,
  `canonicalRestMapFromObject`, `MIN_COVERAGE`. The bind-correction internals
  (`SOURCE_REST`, `bindCorrections`, `BIND_EPSILON`) are documented inline — read those comments
  before changing the math.
- [src/animation-manager.js](../../src/animation-manager.js) — runtime playback engine wrapping
  `THREE.AnimationMixer`. `attach(model)` builds `_canonicalToNode` + `_canonicalRest` and
  retargets every registered clip. `_retarget` is the single chokepoint.
- The math invariant: `Ta = Tr · Sr⁻¹ · Sa` where `Sr` = authoring-rig rest, `Tr` = target-rig
  rest, `Sa` = clip keyframe. When the clip is at the authoring rest, the target sits at the
  target rest. A correction that is identity (rig already matches authoring convention) must be
  skipped so output is byte-for-byte unchanged.

### The reference rig & canonical bone naming (critical)
- **Reference rig used by the build pipeline: [public/avatars/cz.glb](../../public/avatars/cz.glb).**
  It is an Avaturn rig whose `Armature` has no rotation and whose `Hips` rest is identity — i.e.
  it **is** the authoring convention the clips were baked against. Clips play on it verbatim with
  zero correction. This makes cz.glb the source of truth for the authoring rest pose (Task 1).
- Mixamo test rig: [public/avatars/michelle.glb](../../public/avatars/michelle.glb) — bones are
  `mixamorig:`-prefixed; `Character` armature = `+90°X`, `mixamorig:Hips` rest = `−90°X`. This is
  the canonical "broken before the fix" avatar; use it as the cross-convention test subject.
- Canonical bone set: `CANONICAL_BONES` in
  [src/glb-canonicalize.js](../../src/glb-canonicalize.js). `canonicalizeBoneName(name)` maps any
  vendor name (`mixamorig:Hips`, `DEF-spine`, `left_arm`, `CH_Hips`, …) → canonical. A second
  normalizer, `normalizeBoneName()`, lives in
  [src/avatar-export.js](../../src/avatar-export.js) (used by export/ingest). **Reuse these —
  never hand-roll bone-name parsing.**

### Clip format & built-ins
- Stored clips are `THREE.AnimationClip.toJSON()`; track name = `BoneName.property`
  (`Hips.position` vector, `Hips.quaternion` quaternion). Parse with `AnimationClip.parse(json)`.
- Manifest: [public/animations/manifest.json](../../public/animations/manifest.json) —
  `{ name, url, label, icon, loop }`. **Note the `loop` field** (e.g. `celebrate` is
  `loop:false`, a one-shot) — Task 5 must honor it.
- Featured clips (what users hit first): `FEATURED` in
  [src/animation-presets.js](../../src/animation-presets.js) — idle, walk, jump, wave, dance,
  celebrate.

### Where avatars are rendered (the surfaces that must all stay correct)
- The `<agent-3d>` web component: [src/element.js](../../src/element.js) → wraps
  [src/viewer.js](../../src/viewer.js) (`Viewer` class, GLTFLoader with Draco/KTX2/Meshopt,
  ~lines 841–887) → `AnimationManager`.
- Home page door cards / bento / hero: `initLiveFeatures()` in
  [pages/home.html](../../pages/home.html) (`LIVE_SPOTS`, `spawnMini`, the `IntersectionObserver`
  ~line 6004+). This is where the bug was visible.
- Also: `/pose` studio, avatar profile pages, `/irl`, `/walk` — all drive the same
  `AnimationManager`, so a retarget fix is global.

### Avatar ingest / canonicalization (Task 3)
- [src/glb-canonicalize.js](../../src/glb-canonicalize.js) — `canonicalizeGlbBoneNames(buffer)`
  rewrites bone names in a GLB to canonical. Task 3 extends this concept to **orientation**.
- Ingest path: search for where uploaded/generated avatars are processed before R2 storage
  (avatar create/upload endpoints under `api/`; the avatar decoration shape is in
  [api/_lib/avatars.js](../../api/_lib/avatars.js)). Read before editing.

### Observability (Task 4)
- Client error reporter posts to `/api/client-errors` (logged as `[client-error]`). A runtime
  "fallen pose" guard should report through this existing channel — do not invent a new one.

---

## Rules for every task (do not skip)

- **Follow [CLAUDE.md](../../CLAUDE.md).** No mocks, no fake data, no stubs, no TODOs, no
  commented-out code, no `setTimeout` fake loading. Real wiring, every state designed
  (loading/empty/error/populated), accessibility, hover/active/focus states.
- **The no-regression bar is absolute.** Any change to the retarget math must remain a
  byte-for-byte no-op for rigs that already animate correctly (prove it on `cz.glb`). The shipped
  `cz: 1.7° → 1.7°` invariant must hold.
- **Read before you write.** Open the referenced files; match existing patterns, naming, tokens.
- **Verify with real assets.** Use `cz.glb` (reference) and `michelle.glb` (Mixamo) plus at least
  one more convention. For UI, `npm run dev` (port 3000), exercise in a browser, confirm zero
  console errors. State exactly what you verified and the measured numbers.
- **Tests:** keep `npm test` green; extend
  [tests/animation-retarget.test.js](../../tests/animation-retarget.test.js) and add new suites
  where a matching pattern exists. Respect the typecheck ratchet (`npm run typecheck`).
- **Changelog:** every user-visible change gets an entry in
  [data/changelog.json](../../data/changelog.json); run `npm run build:pages` to validate.
- **Concurrent fleet:** other agents share this worktree on `main`. Stage **explicit paths**
  (never `git add -A`), and re-check `git status` / `git diff --staged` right before committing.
- **Do not push** unless the user explicitly approves. When they do, push to **both** remotes
  (`git push threeD main` && `git push threews main`). Never pull/fetch from `threeD`.
- **Run the `completionist` subagent** over your changed files before declaring done; fix
  everything it flags.
- At the end of your task, write a short handoff note: what changed and what the next task should
  build on.
