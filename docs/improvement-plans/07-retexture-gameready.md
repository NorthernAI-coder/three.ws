# Task: AI retexture + a polished game-ready export path

You are a senior 3D pipeline engineer on three.ws. Follow `CLAUDE.md` (auto-loaded).
Non-negotiables: $THREE is the only coin; no mocks/placeholders; real APIs/workers;
every state designed; add tests; changelog for user-visible changes; don't break
the architecture.

## Why this matters

A raw generated mesh is the start, not the end. Two high-value post-generation
moves: **retexture** (restyle a model with a prompt — "make it chrome", "low-poly
toon", "weathered bronze") and **game-ready export** (clean quad retopology + PBR
re-bake to GLB/FBX for Unity/Unreal). These turn a one-off into an asset someone can
actually use in a project, which is what makes the platform sticky for creators.

## What exists today — read these first

- Game-ready export is already modeled: [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js)
  `OUTPUTS.gameready` (quad/tri, GLB+FBX, poly presets, texture sizes,
  `GCP_REMESH_URL`), and the remesh worker in [workers/](../../workers) (`workers/remesh`).
  UI: [src/forge-studio/forge-gameready.js](../../src/forge-studio/forge-gameready.js),
  `forge-optimize.js`, `forge-export.js`.
- Texturing in the providers (image-to-3d PBR/HD flags) in
  [api/_providers/](../../api/_providers).

## Goal

Make game-ready export a first-class, fully-stated experience, and add a real
prompt-driven retexture/restyle step that runs on a real engine and returns a new
textured GLB.

## Scope

1. **Game-ready polish.** Finish/verify the `gameready` flow end-to-end: poly-budget
   slider (from `OUTPUTS.gameready.polyPresets`), quad vs tri, texture size, GLB+FBX
   delivery, optional source-rig retention. All numbers from `OUTPUTS`, none hardcoded.
   Real worker calls, real downloadable files, real progress.
2. **Retexture.** Add "Restyle this model" — a prompt that re-textures an existing GLB
   on a real engine (reuse the providers' texturing capability or the remesh worker's
   re-bake; inspect what's available before adding anything). Returns a new GLB the
   user can preview against the original (before/after).
3. **Before/after + history.** Show original vs restyled side by side; keep the
   original retrievable. Don't destructively overwrite the source asset.
4. **States.** Gating (if an export/restyle is $THREE hold-or-pay, explain + offer the
   real unlock), progress (real worker poll), error+retry, empty (no model selected →
   guide to forge one first).

## Guardrails

- Read prices/poly presets/texture sizes from `OUTPUTS`/tier config — never hardcode.
- Reuse the remesh worker + provider texturing; do not stand up a parallel service.
- Env-gate the worker (`GCP_REMESH_URL`): missing config degrades cleanly with a clear
  message, never a broken button.
- Real files only — the FBX/GLB the user downloads must open in a DCC tool/engine.

## Definition of done

- [ ] Game-ready export produces real GLB+FBX at the chosen budget/topology/texture size.
- [ ] Prompt-driven retexture returns a real new textured GLB; before/after preview.
- [ ] Original asset preserved (non-destructive).
- [ ] Gating/progress/error/empty states designed; numbers read from config.
- [ ] `npm run dev` exercised; downloaded files verified to open; no console errors.
- [ ] `npm test` green; tests cover the export option + retexture request building.
- [ ] Changelog entry; `npm run build:pages` passes.
