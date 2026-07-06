# 15 — Pipeline orchestrator: one paid call, full asset pipeline

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

Ship `POST /api/x402/pipeline` — one x402 call that runs a requested chain of pipeline stages
(generate → rig → optimize → …) as a single job with one price, returning a job token the
caller polls free. This is the "asset factory" call: an agent describes what it wants and gets
back a game-ready asset.

## Context

- Job infrastructure exists — reuse it, don't rebuild: `api/_lib/forge-job-token.js` (signed
  job tokens), `api/_lib/forge-store.js` (persistence), the free poll route `GET
  /api/forge?job=<id>` (read `api/forge.js` to see how status/result polling works today), and
  `api/_lib/forge-events.js`.
- Stage implementations: whatever exists at the time you run. Discover them at runtime by
  reading the modules directly — generation (`api/nim-forge.js` / forge lanes), rigging
  (`rig_mesh` MCP tool internals under `api/_mcp3d/`), optimization/remesh/gameready/stylize
  (`api/forge-*.js`). **This prompt must not depend on prompt 14 having run** — call the
  underlying stage modules, not the x402 wrapper routes.
- x402 pattern: `paidEndpoint`/`buildBazaarSchema`/`declareHttpDiscovery`/`priceFor` — read
  `api/x402/forge.js` end to end first; it already does paid-job-submit + free-poll and is
  your closest template.
- Pricing: per-stage price table inside the route (env-overridable via `priceFor` slugs like
  `pipeline-stage-rig`); the quoted job price = sum of requested stages. The 402 challenge
  must quote the exact total for the requested chain.

## Tasks

1. Request contract:
   `{ stages: [...], prompt?, glb_url?, options?: { per-stage } }` where `stages` is an
   ordered subset of `['generate','rig','remesh','gameready','stylize']`. Validate hard:
   `generate` requires `prompt` and must be first; without `generate`, `glb_url` is required;
   reject unknown stages/invalid orders with a 400 explaining the valid grammar. Only offer
   stages whose backing module you verified working (triage like prompt 14; exclude broken
   ones from the grammar and say so in the description).
2. Execution: on settlement, enqueue/run the chain (mirror how `api/x402/forge.js` handles
   async work on Vercel — if it runs work inline/deferred, follow the same mechanism).
   Persist per-stage progress into the job record: `stages: [{ id, status, started_at,
   finished_at, output_url?, error? }]` so polling shows WHERE the job is.
3. Failure semantics: a stage failure marks the job `failed` at that stage with the completed
   stages' outputs still available in the result (partial value delivered, honestly labeled).
   Anything that can be validated pre-settlement (inputs, lane env availability) throws
   BEFORE payment settles.
4. Poll path: reuse the existing free forge poll route — extend its job-shape handling if the
   pipeline record differs (keep backward compatibility for plain forge jobs; existing tests
   must stay green).
5. Bazaar description, uniqueness first: "One call, full 3D asset pipeline — text or GLB in,
   rigged/optimized game-ready GLB out; the only asset pipeline in the x402 ecosystem. Priced
   per stage, quoted exactly in the 402 challenge."
6. **Verify one real end-to-end job**: `stages: ['generate','rig']` (or the cheapest working
   pair), poll to completion, download the final GLB, confirm magic bytes + rig present
   (inspect for skinned mesh / bones — `api/x402/model-check.js` internals report skeleton
   stats). Record evidence in your report.
7. **Tests** in `tests/api/x402-pipeline.test.js`: grammar validation matrix, price quoting
   per chain, per-stage progress shape, partial-failure semantics, poll compatibility.
   Stage-module boundaries fixture-backed. Targeted vitest + `npm run audit:x402-catalog`
   until green.
8. **Docs:** section in `docs/3d-pipeline.md` if it exists, else `docs/api-reference.md` —
   the chain grammar, one runnable example, pricing. Changelog entry (`feature`).
9. Commit (explicit paths) and push per 00-CONTEXT.

## Definition of done

One paid call runs a validated stage chain to a real verified GLB with per-stage progress,
exact price quoting, honest partial-failure semantics, tests + audit green, docs + changelog
shipped, committed, pushed.
