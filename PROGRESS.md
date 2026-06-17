# Progress

Running log of notable product work. Newest first.

## 2026-06-17 — Game-Ready export tier in Forge

Surfaced the topology pipeline that already shipped in `workers/remesh/`
(QuadriFlow quad retopology + silhouette-preserving smart low-poly with UV
re-unwrap and texture re-bake) as a one-click **Game-Ready** output in Forge.

- `api/forge-gameready.js` — follow-up endpoint that drives the remesh worker:
  quad → QuadriFlow, tri → smart low-poly, poly budget → `target_faces`, PBR
  re-bake at the chosen texture size. Fans out one worker task per requested
  format so GLB and FBX are produced together, mirrors the results into R2 under
  the model's namespace, and exposes a single aggregated poll. A rigged FBX is
  available via the worker's geometry-preserving `convert` path (retopology
  rebuilds geometry, so a retopologized FBX is a clean re-riggable mesh).
- `api/_lib/forge-tiers.js` — Game-Ready registered as a catalog-visible export
  option (`OUTPUTS`), advertised in `GET /api/forge?catalog` with honest ETA +
  price and a `configured` flag tied to the remesh worker env.
- `src/forge-gameready.js` + `pages/forge.html` — Game-Ready action in the result
  view: topology toggle, poly-budget slider with 5k/15k/50k presets defaulted to
  the model's current size, texture-size + format pickers, real job polling, the
  before→after poly delta game devs screenshot, per-format downloads, and a live
  Three.js wireframe toggle to inspect the new topology in the viewer.
- Tests: `tests/api/forge-gameready.test.js` (multi-format fan-out, poll
  aggregation, R2 mirror, rig-preserving FBX path) and Game-Ready catalog cases
  in `tests/api/forge-tiers.test.js`.
