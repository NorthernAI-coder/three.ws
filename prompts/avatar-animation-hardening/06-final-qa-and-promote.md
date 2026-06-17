# Task 6 — Final QA across every avatar surface

> Read [00-README.md](./00-README.md) first. **Depends on Tasks 1–5** — read their handoff notes.
> Follow [CLAUDE.md](../../CLAUDE.md). This is the "shipped complete" gate.

Tasks 1–5 fix the math, the ingest path, the regression guard, and the embed UX. This task proves
the whole thing is production-ready end to end: every surface that renders an animated avatar is
correct, polished, and free of console errors, on a representative matrix of avatars and clips.

## Handoff from Task 4 (regression corpus + runtime fallen-pose guard)

Shipped and committed; build on it, don't redo it:

- **Regression corpus** — [tests/animation-upright-invariant.test.js](../../tests/animation-upright-invariant.test.js)
  asserts the Hips world up-axis stays within **40°** of vertical at *every* keyframe across 4
  rig conventions (cz Avaturn, michelle Mixamo `−90°X`, a synthetic `+90°Z`/`−90°Z`,
  DEF-/snake_case names) × the `FEATURED` clips, plus a below-`MIN_COVERAGE` missing-bones rig.
  **michelle + celebrate is the named regression lock** for the lying-down bug, with explicit
  "has teeth" cases proving the verbatim (no-correction) path still falls flat (>80°). cz.glb is
  asserted **byte-for-byte equal** to the verbatim path (the `1.7°→1.7°` no-regression invariant).
  Runs in plain Node via a raw GLB JSON-chunk → Bone-graph reconstruction
  ([tests/_helpers/glb-bone-graph.js](../../tests/_helpers/glb-bone-graph.js)) — no GLTFLoader,
  no network — so it gates the Vercel build. 49 cases, all green.
- **Runtime guard** — [src/animation-manager.js](../../src/animation-manager.js): `measureHipsTiltDeg`
  + `_guardAgainstFallenPose` sample the at-rest Hips tilt **once per (avatar, clip)** before an
  action plays (never per frame). Past `CATASTROPHE_TILT_DEG` (**45°**) it disables the action,
  falls back to the authored bind pose, and reports **once** (Set-debounced) via
  `window.reportClientError` → `/api/client-errors` with `{avatarId, avatarUrl, clip, tiltDeg}`.
  The viewer wires avatar context at [src/viewer.js:1008](../../src/viewer.js#L1008)
  (`attach(content, { avatarUrl })`).
- **For your QA:** the guard must stay **silent** on every healthy avatar/clip you exercise — a
  `[client-error] fallen-pose retarget` log line during the matrix run is a real regression, not
  noise. To confirm the guard *fires* correctly, you don't need a broken avatar in the browser;
  the corpus already proves the fire path (`michelle + celebrate` without the fix measures >45°).
- **Note on the full suite:** Task 4's animation suites are green (106/106) and `typecheck` is
  0 errors. If you see failures in `tests/api/marketplace-platform-fee.test.js` (vitest can't
  resolve a `?cb=` dynamic import), `tests/branding.test.js` (Avaturn/Character Studio strings in
  docs), `tests/src/usdz-pipeline.test.js` (meshopt decoder absent in Node), or `all-modules-load`
  (unbuilt local workspace SDKs), those are **environment/build artifacts** — run the postinstall
  ESM fixups and build the `agent-payments-sdk`/`solana-agent-sdk` workspaces, they are unrelated
  to animation.

## What to do

### 1. Build the verification matrix
- **Avatars:** at minimum `cz.glb` (Avaturn), `michelle.glb` (Mixamo), one Ready Player Me /
  Avaturn user avatar, and one platform-generated avatar. Cover the conventions Tasks 1–4 handle.
- **Clips:** the `FEATURED` set (idle, walk, jump, wave, dance, celebrate) plus a couple of
  longer/library clips.
- **Surfaces:** the home page door/bento/hero embeds ([pages/home.html](../../pages/home.html)),
  an avatar profile page, the `/pose` studio, `/walk`, `/irl`, and a bare third-party-style
  `<agent-3d>` embed. (Confirm the surface list against Task 5's handoff.)

### 2. Exercise it for real
- `npm run dev` (port 3000). For each (avatar × surface) cell: load it, play the clip set, and
  confirm: upright, natural limb poses (Task 1), correct travel for locomotion (Task 2), seamless
  looping + designed loading/error/reduced-motion states + correct framing (Task 5), and **zero
  console errors/warnings**. Capture before/after screenshots into `reports/` or the page-audit
  tooling (`scripts/page-audit.mjs`) — do not commit scratch screenshots to the repo.
- Confirm the runtime fallen-pose guard (Task 4) stays silent on all healthy cells.
- Re-ingest one Mixamo avatar through the Task 3 path and confirm it animates with the runtime
  correction reduced to a no-op.

### 3. Close the loop
- Fix any residual jank, mis-framing, or warning you find — no "good enough."
- Verify the public changelog reads coherently for the whole initiative (the entries from Tasks
  1–5 plus the original lying-down fix). Consolidate/clarify wording if needed; run
  `npm run build:pages` to revalidate.
- Run the full `npm test` suite and `npm run typecheck`. Run the `completionist` subagent over the
  cumulative diff of the initiative; fix everything it flags.

## Definition of done
- The full avatar × clip × surface matrix verified in a real browser with zero console
  errors/warnings; before/after evidence captured (not committed as scratch).
- Locomotion, limb fidelity, framing, state design, reduced-motion, and offscreen-pause all
  confirmed on every surface. Fallen-pose guard silent on healthy rigs.
- A re-ingested Mixamo avatar confirmed needing no runtime correction.
- `npm test` + `npm run typecheck` green; changelog coherent and validated.
- `completionist` clean. Final summary written: what's covered, any known limitations, and the
  recommended catalog-backfill follow-up (from Task 3) if applicable.

When the user approves the push, push to **both** remotes (`git push threeD main` &&
`git push threews main`). Never pull/fetch from `threeD`.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

When the whole initiative is verified, committed, and (if approved) pushed, remove this file and
the now-empty backlog:

```bash
git rm "prompts/avatar-animation-hardening/06-final-qa-and-promote.md"
# If 00-README.md and all NN-*.md tasks are gone, remove the README + dir too:
git rm "prompts/avatar-animation-hardening/00-README.md"
```

A backlog file that still exists is unfinished work; a directory that is gone has shipped.
