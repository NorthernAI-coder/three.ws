# 12 — Image generation package (`/api/v1/ai/image`)

Read `prompts/x402-catalog/00-CONTEXT.md` first and obey every rule in it. Work alone, finish
100%, never ask questions.

## Mission

Productize the platform's text→image lanes as `POST /api/v1/ai/image`: free daily quota, x402
above it, bazaar-listed. The lanes exist (`api/_mcp3d/text-to-image.js` routes across NIM and
the GCP Vertex/Gemini image lane in `api/_mcp3d/vertex-imagen.js`) but are buried inside MCP
tool plumbing.

## Context

- **The working tree may contain uncommitted, in-flight changes to
  `api/_mcp3d/text-to-image.js` and the Vertex lane** (a GCP-credits campaign runs in
  parallel; recent commits added explicit lane control + provider logging). `git status` and
  `git log --oneline -5 -- api/_mcp3d/` first, read the CURRENT state, and build on top of it.
  Do not revert or fight anything you find; do not commit files you didn't change.
- Read `api/_mcp3d/text-to-image.js` fully: which providers it routes (NIM model(s),
  `vertex-imagen.js` — note Vertex `:predict` for Imagen was retired; the image lane targets
  `gemini-2.5-flash-image`), which env vars select the lane, what it returns (bytes? URL? R2
  upload?).
- **Env reality:** the GCP lane env vars (`GCP_SERVICE_ACCOUNT_JSON`, `GOOGLE_CLOUD_PROJECT`,
  `GOOGLE_CLOUD_LOCATION`) are NOT yet set in Vercel. Your endpoint must work the moment they
  land and degrade honestly until then: if no image lane is configured at all → 503
  `not_configured` naming the env vars; if one lane works → use it.
- Versioned native route → `api/v1/ai/image.js`, registered in `api/v1/_catalog.js`. Paid lane
  via `paidEndpoint` + `declareHttpDiscovery` + `priceFor` (slug `ai-image`) — read
  `api/x402/tutor.js` for the compact paid-POST pattern.
- Pricing suggestion: free 5 images/day per IP; x402 `'20000'` ($0.02) per image above quota.

## Tasks

1. `POST /api/v1/ai/image` `{ prompt, aspect_ratio?, seed? }` → `{ url, provider, width,
   height }` (persist output wherever the existing lane persists — R2/CDN; read how
   `text-to-image.js` callers store results and reuse that path; if the lane returns raw
   bytes, upload via the platform's existing object-storage helper — find it, e.g.
   `api/cdn-object.js` or what forge uses in `api/_lib/forge-store.js`).
2. Free quota → x402 fall-through as specified; bazaar description with uniqueness first:
   "Text-to-image for agents over x402 — pay $0.02 USDC per image, no API key, no account;
   runs on NVIDIA NIM / Google Vertex lanes."
3. Lane health: add an `/api/v1/ai/image?health=1` (or match the platform's existing lane
   health pattern — see `api/_lib/forge-lane-health.js` and `api/granite-health.js`) that
   reports per-lane configured/reachable without burning quota.
4. Content boundaries: reject empty/oversized prompts (400) and pass provider safety refusals
   through as 422 with the provider's reason — never retry-loop a refusal.
5. **Tests** in `tests/api/v1-ai-image.test.js`: validation, quota fall-through to 402,
   no-lane 503 naming env vars, provider-refusal 422, catalog entry present — provider
   boundary fixture-backed with real captured shapes. Targeted vitest until green. Run
   `npm run audit:x402-catalog`.
6. **Docs:** `docs/api-reference.md` section (runnable curl). Changelog entry (`feature`).
7. Commit ONLY your files (explicit paths — the in-flight `_mcp3d` files belong to another
   agent unless you had to modify them; if you did modify shared files, say so in your report)
   and push per 00-CONTEXT.

## Definition of done

Image endpoint live end-to-end on whichever lane is configured, honest 503 until env lands,
health probe real, bazaar-discoverable, tests + audit green, docs + changelog updated,
committed, pushed.
