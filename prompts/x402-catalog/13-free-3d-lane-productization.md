# 13 — Productize the free text→3D lane (`/api/v1/ai/text-to-3d`)

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

three.ws runs the ONLY text→3D lane in the x402/MCP ecosystem, and its draft tier is free
(NVIDIA NIM TRELLIS — the `forge_free` MCP tool and `api/nim-forge.js` / `api/forge-nim.js`).
But as an HTTP product it's invisible: buried under forge job plumbing with no clean versioned
route. Ship `POST /api/v1/ai/text-to-3d` — the flagship free endpoint of the AI package.

## Context

- Read first: `api/nim-forge.js`, `api/forge-nim.js`, the `forge_free` MCP tool implementation
  (grep `forge_free` under `api/_mcp3d/`), `api/_lib/forge-tiers.js` (NOTE: has uncommitted
  in-flight changes from a parallel campaign — read current state, build on it, don't fight
  it), `api/_lib/forge-job-token.js`, `api/_lib/forge-store.js`. Understand: how a draft job
  is submitted, whether drafts finish inline or need polling, where the GLB lands (URL), and
  the viewer link format.
- Versioned native route → `api/v1/ai/text-to-3d.js`, registered in `api/v1/_catalog.js`.
  Reuse the existing lane modules — zero duplicated generation logic.
- This endpoint is FREE with a per-IP quota (suggested 10/day — GPU quota is real). Above
  quota, do NOT paywall it silently: return 429 with reset time AND a pointer to the paid
  `/api/x402/forge` tiers for higher quality/volume. (The paid forge remains the upsell; this
  free lane is the funnel.)

## Tasks

1. `POST /api/v1/ai/text-to-3d` `{ prompt }` →
   `{ status: 'done'|'pending', glb_url?, viewer_url?, job? }` mirroring the existing draft
   lane semantics (inline finish when fast; otherwise return the job token + the existing free
   poll URL `GET /api/forge?job=<id>` — reuse, don't rebuild polling).
2. Per-IP daily quota (10/day) via the platform's quota mechanism; 429 with
   `X-RateLimit-Reset` + upsell pointer as above. Missing NVIDIA env → 503 `not_configured`
   naming the var.
3. Register in `api/v1/_catalog.js` with a summary whose first sentence answers uniqueness:
   "Free text→3D — the only text-to-mesh lane in the agent-payments ecosystem; textured GLB
   from a prompt, no key, no wallet."
4. **Generate one real model end-to-end** as verification (prompt: "a small ceramic robot
   figurine"), confirm the GLB URL serves binary glTF (check magic bytes `glTF`) and the
   viewer link renders. Record the URLs in your report.
5. **Tests** in `tests/api/v1-text-to-3d.test.js`: validation (empty prompt 400), quota 429
   shape, missing-env 503, response contract for inline-done and pending paths (lane boundary
   fixture-backed with real captured shapes). Targeted vitest until green.
6. **Docs:** `docs/api-reference.md` entry (runnable curl). Changelog entry (`feature`),
   holder-readable: free text→3D now has a first-class API endpoint.
7. Commit (explicit paths; don't commit the in-flight `forge-tiers.js` changes unless you
   authored changes in it — report if you did) and push per 00-CONTEXT.

## Definition of done

Endpoint live, one real GLB generated and verified end-to-end, quota honest with paid upsell,
tests green, catalog + docs + changelog updated, committed, pushed.
