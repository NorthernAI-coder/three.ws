# Task 3 — Canonicalize rig orientation at avatar ingest

> Read [00-README.md](./00-README.md) first. Can run in **parallel** with Tasks 1/5. Follow
> [CLAUDE.md](../../CLAUDE.md).

Runtime bind correction (Tasks 1–2) makes any rig animate correctly *when played*. This task adds
**defense-in-depth at the source**: when an avatar is created/uploaded, normalize its rig to the
canonical convention so the stored GLB needs **zero** runtime correction — cheaper, simpler, and a
guarantee that every avatar in the catalog is already "good." Runtime correction stays as the
safety net for anything not re-ingested.

## What to build

### 1. Extend the canonicalizer to orientation
- [src/glb-canonicalize.js](../../src/glb-canonicalize.js) already rewrites **bone names** to
  canonical (`canonicalizeGlbBoneNames`). Add an orientation pass that bakes the up-axis
  convention into the canonical form: flatten the `armature(+R) / Hips(−R)` split so the stored
  rig matches the reference (`cz.glb`: armature rest ≈ identity, `Hips` rest ≈ identity), with the
  geometry and skin weights preserved so the avatar looks identical at bind.
- The transform must be **mathematically lossless for appearance**: bind-pose vertices in world
  space are unchanged; only the bone/local-frame bookkeeping moves. Verify by comparing world
  positions of skinned vertices (or bone world transforms) before/after.
- Reuse `canonicalizeBoneName` / `normalizeBoneName`
  ([src/avatar-export.js](../../src/avatar-export.js)) — do not add a third bone-name parser.

### 2. Wire it into the ingest path
- Find where avatars are processed before R2 storage (avatar create/upload/generate endpoints
  under `api/`; the decoration shape is in [api/_lib/avatars.js](../../api/_lib/avatars.js)). Run
  the normalization there so new avatars are stored canonical. Read the path end-to-end before
  editing; match existing patterns (storage keys, presigning, error handling at the boundary).
- Make normalization **idempotent**: re-running on an already-canonical GLB (e.g. `cz.glb`) is a
  no-op (no bone renames, no orientation change). Log a concise summary (bones renamed,
  orientation corrected y/n) — no noisy per-bone logging.
- Do **not** bulk-rewrite the existing catalog in this task; that is an ops migration. Ensure
  existing avatars keep working via the runtime correction (they do). Note the catalog-backfill as
  a follow-up if warranted.

### 3. Correctness
- An ingested Mixamo rig (`michelle.glb` fixture) comes out with canonical bone names and a Hips
  rest ≈ identity, plays every featured clip upright with the runtime correction reduced to a
  no-op, and is visually identical at bind pose to the input.
- Non-humanoid / unrecognized rigs pass through untouched (don't corrupt props or rigs the
  canonicalizer can't map).

## Definition of done
- `glb-canonicalize.js` normalizes orientation losslessly + idempotently; unit-tested (appearance
  invariance, idempotency on cz.glb, Mixamo → canonical Hips-identity).
- Ingest path runs normalization on new avatars; errors handled at the boundary; concise logging.
- A re-ingested Mixamo avatar needs no runtime correction and is visually identical — verified
  (numeric vertex/bone-world comparison + a browser spot-check).
- `npm test` + `npm run typecheck` green. Changelog entry if user-visible (new uploads animate
  perfectly regardless of source tool).
- `completionist` run; findings fixed. Handoff note: whether a catalog backfill is recommended and
  how it would run.

Do not push unless the user approves (then both remotes).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

The moment every item above is **built, wired, verified, and committed**, remove it in the same
change:

```bash
git rm "prompts/avatar-animation-hardening/03-ingest-rig-normalization.md"
```

Stage the deletion in the completion commit. A file that still exists is unfinished work.
