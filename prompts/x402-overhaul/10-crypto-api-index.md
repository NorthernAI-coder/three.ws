# 10 — Free Crypto Data API: Bundle Index + OpenAPI + Discovery

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own. **Does NOT require prompts 01–09 to have
run** — it globs whatever catalog entries exist and reflects them; with zero entries it still
returns a valid (empty) catalog. As sibling endpoints land, it lists them automatically.

## Agent use-case (name it in the docs)
An agent (or a human wiring one up) hits ONE URL to discover the entire free Crypto Data API:
every endpoint, its inputs/outputs, and a live example. This is the front door that makes the
bundle feel like one product, not nine loose routes.

## Build
1. **The catalog assembler** — `api/_lib/crypto-catalog/index.js` that imports/globs every
   `api/_lib/crypto-catalog/*.js` entry file (excluding itself) and returns the merged array.
   Use a static import map or a build-safe directory read (Vercel functions can't always
   fs-glob at runtime — prefer an explicit `export` barrel that each entry is added to, OR a
   generated manifest; pick the pattern that works in this repo's serverless runtime and
   document it). If an entry is malformed, skip it and log — never throw.
2. **`GET /api/crypto`** — `api/crypto/index.js`, free handler. Returns
   `{ name:'three.ws Crypto Data API', free:true, keyless:true, version, endpoints:[...from
   catalog...], docs:'/docs/crypto-api', ts }`. Human-friendly HTML when `Accept: text/html`,
   JSON otherwise.
3. **`GET /api/crypto/openapi.json`** — a real OpenAPI 3.1 doc generated FROM the catalog
   entries (paths, params, response schemas). Must validate. Wire a rewrite in `vercel.json`
   if needed (stage only your hunk).

## States
Zero catalog entries → valid empty catalog + a "coming soon" note, never an error. Malformed
entry → skipped, rest served.

## Tests
Assembler merges N entries; skips malformed; OpenAPI validates (use a schema validator already
in devDeps if present, else assert required OpenAPI fields); index HTML vs JSON negotiation.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] `curl /api/crypto` and `/api/crypto/openapi.json` outputs captured in PROGRESS.md.
- [ ] `docs/crypto-api.md`: ensure it has an intro + a generated/maintained endpoint table
      (this prompt owns the intro + table; sibling prompts add their own sections).
- [ ] `data/pages.json`: register `/docs/crypto-api` if it's a public page (coordinate: prompt
      11 builds the page — if it doesn't exist yet, still register the intended path).
- [ ] `STRUCTURE.md`: row for the Crypto Data API surface (`/api/crypto/*`).
- [ ] `data/changelog.json` (tags: `feature`,`sdk`) — "three.ws Crypto Data API: one free,
      keyless crypto data bundle for AI agents".
