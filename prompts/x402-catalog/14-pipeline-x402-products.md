# 14 — 3D pipeline stages as individually-priced x402 products

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

The repo holds a full 3D asset pipeline nobody else in the x402 ecosystem has — rigging,
animation retargeting, remeshing, game-ready conversion, stylization, background removal —
but only generation (forge) is sold. Wrap each working stage as its own x402 resource with an
honest description, so the catalog reads as a coherent "3D Asset Pipeline API".

## Context

- Candidate stage routes — READ EACH ONE FIRST and triage (works end-to-end? env-gated?
  half-built?): `api/forge-remesh.js`, `api/forge-gameready.js`, `api/forge-stylize.js`,
  `api/forge-rembg.js`, `api/forge-segment.js`, `api/forge-motion.js`, plus rigging — find the
  `rig_mesh` MCP tool implementation (grep under `api/_mcp3d/`) and the retarget machinery
  (`src/animation-retarget.js` is client-side; check for a server-side rig/animate lane).
  **Only productize stages that actually work.** A stage that is broken or env-dead gets fixed
  if the fix is contained, or excluded with a written reason in your report — never listed
  broken.
- x402 pattern: read `api/x402/model-check.js` (a working GET stage on a model URL) as the
  template — `paidEndpoint`, `buildBazaarSchema`, `declareHttpDiscovery` + `THREEWS_SERVICE`,
  `priceFor`, `installAccessControl` (all under `api/_lib/`).
- New paid routes live under `api/x402/` with kebab-case slugs: `pipeline-rig`,
  `pipeline-remesh`, `pipeline-gameready`, `pipeline-stylize`, `pipeline-rembg` (skip
  `segment`/`motion` unless triage shows them solid). Input contract: a `glb_url` (or
  image URL for rembg) + stage-specific options; output: the processed asset persisted the
  same way forge persists (see `api/_lib/forge-store.js`) and returned as a URL. Never inline
  multi-MB binaries in JSON.
- Suggested prices (env-overridable): rig `'50000'` ($0.05), remesh/gameready/stylize
  `'30000'` ($0.03), rembg `'10000'` ($0.01).
- Descriptions: first sentence answers "what can I only get here", states input → output +
  price plainly. No "bullish signal" decoration, no fluff.

## Tasks

1. Triage every candidate stage (read + one real local invocation each where feasible). Write
   the works/fixed/excluded table for your report.
2. Implement the x402 wrapper route for each surviving stage, reusing the stage's existing
   module (extract shared logic into `api/_lib/` if it's currently inline in a handler — both
   routes keep working).
3. Verify one REAL end-to-end call per shipped stage: take a real GLB (generate one via the
   free NIM lane or use a small committed test asset if `tests/` has one), run the stage, open
   the output URL, confirm it's a valid GLB (magic bytes) and the transformation actually
   happened (e.g. triangle count dropped for remesh — `api/x402/model-check.js` internals can
   verify). Record evidence in your report.
4. Handler-throws-before-settlement rule: any upstream/env failure must throw BEFORE
   settlement so buyers are never charged for a failed stage (the `paidEndpoint` rail handles
   this if you don't catch-and-continue — don't).
5. **Tests** in `tests/api/x402-pipeline-stages.test.js`: per stage — input validation (bad
   URL 400, non-GLB 415/400), discovery schema present, price resolution via `priceFor`.
   Stage-lane boundaries fixture-backed with real captured shapes. Targeted vitest until
   green. Run `npm run audit:x402-catalog`.
6. **Docs:** new `docs/3d-pipeline.md` (linked from `docs/start-here.md`): the pipeline story
   (generate → rig → animate → optimize → deliver), each stage with a runnable curl + price.
   Changelog entry (`feature`): the 3D pipeline is now purchasable stage-by-stage.
7. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

Every working stage is a priced, discoverable x402 resource verified with a real end-to-end
call; broken stages fixed or excluded with reasons; tests + audit green; pipeline doc +
changelog shipped; committed, pushed.
