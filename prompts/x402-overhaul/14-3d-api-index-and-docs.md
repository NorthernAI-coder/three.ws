# 14 — Free 3D API: Index + Docs Page

Read `prompts/x402-overhaul/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
Independent work order — completes fully on its own. Globs whatever `api/_lib/3d-catalog/*`
entries exist (works with zero); documents the whole free 3D API + links the paid tiers.

## Build
1. **Assembler** — `api/_lib/3d-catalog/index.js` merging every `api/_lib/3d-catalog/*.js`
   entry (skip malformed, never throw). Use the serverless-safe pattern documented in prompt
   10 (barrel/manifest, not runtime fs-glob if that's unreliable here).
2. **`GET /api/3d`** — `api/3d/index.js`, free handler: `{ name:'three.ws 3D API', free:true,
   keyless:true, endpoints:[...catalog...], paidTiers:[{name:'Forge Pro',...},{name:'Rigged
   Avatar',...}], docs:'/docs/3d-api', ts }`. HTML on `Accept: text/html`, else JSON.
3. **`GET /api/3d/openapi.json`** — real OpenAPI 3.1 from the catalog; validates.
4. **Public docs page** — `three.ws/3d` (or `/docs/3d-api`), following the repo's page system
   + `DESIGN-TOKENS.md`. Hero, endpoint table, runnable quickstart, real request/response
   examples (call live endpoints), an embedded 3D viewer preview of a generated GLB if the
   viewer component is reusable, and a clear free→paid ladder (free draft → Forge Pro tiers →
   Rigged Avatars). Screenshot-worthy, responsive, a11y-clean, zero console errors.

## Register
`data/pages.json` (the docs page), nav link, `STRUCTURE.md` row for `/api/3d/*`.

## Tests / verification
Assembler merge + skip-malformed; OpenAPI validates; index HTML/JSON negotiation; open the
docs page in `npm run dev`, verify live examples + links + no console errors. Capture in PROGRESS.

## Definition of done
Inherit 00-CONTEXT DoD + gates. Plus:
- [ ] `/api/3d`, `/api/3d/openapi.json`, and the docs page all captured/verified in PROGRESS.md.
- [ ] `data/pages.json` + nav + `STRUCTURE.md` done.
- [ ] `data/changelog.json` (tags: `feature`,`docs`; `link` = page path) — "three.ws 3D API:
      free text→3D + inspection for AI agents, with pro tiers".
