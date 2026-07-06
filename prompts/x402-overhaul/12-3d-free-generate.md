# 12 — Free 3D API: Text→3D Generate

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own.

## Agent use-case (name it in the docs)
Any agent building a game, a scene, an NFT, or a visual wants a 3D model from a text prompt —
free, no key, no account. No other agent platform gives away 3D generation. This is a magnet
that funnels to paid Forge Pro (quality tiers) and Rigged Avatars.

## Note on existing code
The free NVIDIA NIM / TRELLIS lane already exists: `api/forge-nim.js`, `api/nim-forge.js`,
`api/forge.js`, `_lib/forge-job-token.js`. Do NOT rebuild generation — wrap the existing free
lane behind a clean, agent-first, keyless endpoint. The current `/api/x402/forge` charges;
this one is the FREE draft lane, clearly separated.

## Build — `POST /api/3d/generate` + `GET /api/3d/generate?job=<id>`
- New file `api/3d/generate.js`, free plain-handler pattern (00-CONTEXT) + the job-token poll
  pattern the existing forge routes use (`_lib/forge-job-token.js`).
- Input (POST): `{ prompt: string, format?: 'glb' }`. Returns `{ job, status, poll }` (or the
  GLB inline when the draft finishes fast, matching existing forge behavior).
- Poll (GET `?job=`): `{ status:'pending'|'done'|'error', glbUrl?, viewerUrl?, error? }`.
- Rate-limit generously but protect the GPU lane (per-IP + a global concurrency guard —
  reuse whatever the existing forge routes use; don't invent a new limiter).
- Free = the draft/NIM tier only. Higher quality + rigging = paid Forge (link it in the
  response + docs). Be explicit about the free tier's limits so it's honest.

## Catalog registration
Drop `api/_lib/3d-catalog/generate.js` (same entry shape as the crypto catalog; the `/api/3d`
index in prompt 14 globs this dir).

## States
Empty/oversized prompt → 400. Job pending → 200 pending + poll URL. Generation failed
upstream → 200 `status:error` + actionable message + no charge (it's free). GPU lane
saturated → 429 with retry-after. Never 500 on a well-formed prompt.

## Tests
Job lifecycle (create → pending → done); prompt validation; rate-limit path; that the
returned GLB URL resolves to a real GLB (fetch it, assert it parses / non-zero bytes) for at
least one real generation.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] One real generation run end-to-end; GLB verified real; capture job + glbUrl in PROGRESS.md.
- [ ] `docs/3d-api.md` section (free-tier limits stated) + curl + use-case + link to paid Forge.
- [ ] `data/changelog.json` (tags: `feature`,`sdk`) — "Free text→3D generation API for agents".
