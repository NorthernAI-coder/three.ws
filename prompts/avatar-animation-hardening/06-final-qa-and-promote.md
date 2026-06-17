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

## Handoff from Task 2 (root-motion correctness across rig conventions)

Shipped and committed; build on it, don't redo it:

- **The fix is the parent-frame hip-position correction**, already in
  [src/animation-retarget.js](../../src/animation-retarget.js): `hipPositionCorrection` rotates the
  `Hips.position` (root-motion) track by the **inverse of the target Hips-parent rest world
  rotation** (`hipsParentWorldQuat`), not by the Hips *bone* correction. This makes per-frame
  world-space root displacement equal the authoring displacement (scaled for height) on **any**
  parent-axis convention — the old bone-correction approach was exact only on the standard Mixamo
  `+90°X/−90°X` split. Rotation and uniform `hipScale` compose (rotate first, then scale). The
  runtime wires it through `AnimationManager.attach` → `_hipsParentWorldQuat` →
  [src/animation-manager.js:182](../../src/animation-manager.js#L182)`._retarget`.
- **Locomotion cross-rig coverage** lives in the new `cross-rig locomotion invariants (real GLB)`
  block in [tests/animation-retarget.test.js](../../tests/animation-retarget.test.js). It runs the
  production retargeter against the real `cz.glb` + `michelle.glb` (via the shared
  [tests/_helpers/glb-bone-graph.js](../../tests/_helpers/glb-bone-graph.js)) plus two synthetic
  conventions — a compound **non-±90° armature** (`tilted`) and a 30° **yaw** (`yawed`) — and
  asserts, for a travelling walk (`av-walk-crouching`) and jump (`jumpdown2`): net world travel
  **direction** matches the authored direction on every rig (no sideways drift), the **vertical
  fraction** of travel is preserved (no sinking/floating), and the in-place clips
  (`idle`/`celebrate`/the in-place featured `walk`/`jump`) acquire **~zero** net XZ travel. The
  `tilted` rig is the discriminator: its Hips bone-correction is identity, so only the parent-frame
  correction can recover the right motion — reverting the fix fails 7 cases there (proven). cz.glb
  is locked **byte-for-byte** to the verbatim path.
- **The featured `walk`/`jump` clips are authored in-place** (≈0 net XZ) — they walk/jump on the
  spot; that is correct, not a drift bug. To *see* root-motion travel in a browser, pick a library
  clip that actually translates (e.g. `av-walk-crouching`, `jumpdown2`, `farm-holding-walk`,
  `goalkeeper`). On `/walk` the **game** drives locomotion, so the clip's own root motion is
  in-place there by design; `/pose` plays the clip's authored root motion directly.
- **For your QA:** load a *travelling* clip on `michelle.glb` and `cz.glb` in `/pose` side by side
  and confirm both bodies advance in the **same** world direction and stay planted on the ground
  (no sinking/moonwalk). `scripts/verify-walk-rigs.mjs` is a headless cross-rig smoke check: it
  mounts the real `<agent-3d>` element (Viewer → AnimationManager → retargeter) on `michelle.glb`
  and `cz.glb`, plays a clip, and asserts each loads, renders the Hips **upright** (< 30° off
  vertical — the lying-down regression), and logs zero console errors. Needs the DEV server
  (`node scripts/verify-walk-rigs.mjs http://localhost:3000 walk`). Verified: michelle 6.2° / cz
  2.4° on walk, michelle 6.1° / cz 2.4° on jump, 0 console errors.

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
