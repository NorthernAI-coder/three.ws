# P48 · Interactive OpenAPI explorer

> **Workstream:** SEO, content & developer experience · **Priority:** P2 · **Effort:** M · **Depends on:** P47 (nice-to-have)

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map). The changelog system is described in CLAUDE.md.
2. three.ws monorepo: vanilla JS + Vite. Docs in `docs/`, blog in `blog/`, SEO via `scripts/inject-seo-meta.mjs` + `api/sitemap.js` + `api/page-og`. Page catalog in `data/pages.json`. Dev: `npm run dev`. Tests: `npm test`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.

## Context
There is a real, hand-built OpenAPI document but no interactive UI for it.
- `api/openapi-json.js` (`982` lines) serves a full OpenAPI **3.1.0** doc at `/openapi.json` (rewrite in `vercel.json`: `/openapi\.json` → `/api/openapi-json`). It documents `POST /api/mcp` (JSON-RPC MCP tool calls), the paid `/api/x402/*` and `/api/insights/*` routes (HTTP 402, USDC over x402, no API key), `securitySchemes` `bearerAuth` + `apiKeyAuth`, and carries `x-payment-info`/`x-guidance` extensions for agent discovery (AgentCash, x402scan).
- A static mirror exists at `public/.well-known/openapi.yaml` (~72 KB). The JSON endpoint is the live source of truth.
- `docs/api-reference.md` (~24 KB) is the prose REST reference, surfaced in the docs portal NAV as "REST API". `docs/api.html` also exists.

## Problem / opportunity
The OpenAPI doc is rich enough for a fully interactive explorer, but a developer today can only read static prose (`docs/api-reference.md`) or curl the raw JSON. There's no "try it" surface, no schema browser, no copyable request examples, and nothing that visually communicates the paid (x402) vs free vs bearer-auth split that makes this API distinctive. A self-serve, browsable API console is table stakes for developer adoption and gets the API indexed by tooling that scrapes rendered reference pages.

## Mission
Ship a public, interactive API explorer page wired to the **live** `/openapi.json`, served at a real route (e.g. `/docs/api` or `/api-explorer`), kept automatically in sync with the endpoint (no second copy of the spec), and styled to fit the docs/site dark theme. Make the x402-paid vs bearer-auth distinction legible.

## Scope
**In scope:** A vendored, self-hosted explorer UI (Scalar API Reference or Swagger UI) pointed at `/openapi.json`; a real route + `data/pages.json` entry + nav links; sync verification; SEO meta; all states (loading/error if the spec fails to fetch).
**Out of scope:** Changing the API itself; auth/credential injection for live authenticated calls (read-only/try-public only — never embed real keys); rewriting `api-reference.md` (link to it, keep both).

## Implementation guide
1. **Pick the lightest fit.** Prefer **Scalar API Reference** (modern, dark-themeable, single script/standalone bundle, renders 3.1 well) or **Swagger UI** if you want the most familiar console. Whichever you choose: **vendor it self-hosted** — download the standalone bundle into `public/vendor/<tool>/` (do not load a third-party CDN at runtime; CLAUDE.md + the site's CSP posture favor self-hosted assets). Note the version and license in a short header/README beside the vendored files.
2. **Create the page.** Add `public/api-explorer.html` (or `docs/api.html` if you prefer the docs namespace — but don't clobber the existing file; pick a clean route). It should:
   - Configure the explorer to load the spec from `/openapi.json` at runtime (so it's always live — never paste the spec inline).
   - Apply a dark theme matching `public/style.css` / the docs tokens (`docs/index.html` `--docs-accent: #8b5cf6`).
   - Show a clear loading state and a designed error state if `/openapi.json` 404s or fails to parse (don't leave a blank frame).
   - Include a short header banner explaining the auth model (free MCP `getting_started`, OAuth/API-key bearer, and x402-paid `/api/x402/*` settling in USDC) — text only, no secrets.
3. **Route + catalog.** Add a route to `vite.config.js` (dev) and `vercel.json` (prod) for `/api-explorer` (or `/docs/api`) → the html file. Add a `data/pages.json` entry (title/description/section) so it joins the sitemap, `llms.txt`, and gets SEO meta. Link to it from `docs/index.html` NAV ("REST API" group, add "API explorer (interactive)") and from `docs/api-reference.md` (a banner link at the top: "Prefer to click around? Open the interactive explorer →").
4. **Keep it in sync — prove it.** Because the page fetches `/openapi.json` live, sync is automatic at runtime. Add a guard so it stays valid: extend or add a verifier (reuse the pattern in `scripts/verify-x402-discovery.mjs`) — e.g. `scripts/verify-openapi.mjs` that fetches `/openapi.json` (default `https://three.ws`, `--base` override), validates it parses as OpenAPI 3.1, asserts the documented `paths` are non-empty and that the x402 paths carry `x-payment-info` with both `price` and `protocols` (the AgentCash requirement noted in `api/openapi-json.js`), and that the static `public/.well-known/openapi.yaml` mirror hasn't gone stale relative to the live doc (warn, don't fail the build, if it drifts). Wire an npm script `verify:openapi`.
5. **SEO.** Run `npm run seo:meta` so canonical/OG/JSON-LD land on the new page from its `data/pages.json` copy.

## Definition of done
- [ ] Public explorer page renders all operations from the **live** `/openapi.json` (not an inlined copy), themed to the site, reachable from docs nav + `api-reference.md`.
- [ ] Explorer UI is self-hosted under `public/vendor/` (no runtime third-party CDN); version + license recorded.
- [ ] Loading + error states designed; spec fetch failure degrades gracefully.
- [ ] `verify:openapi` script added and passing; x402 ops show `price` + `protocols`.
- [ ] `npm test` passes; build (`npm run build:pages` and/or `npm run build`) succeeds.
- [ ] User-visible → `data/changelog.json` entry + `npm run build:pages`.
- [ ] `git diff` self-reviewed.

## Verification
- `npm run dev` → open the new route; every endpoint group from `/openapi.json` renders; expanding an operation shows params, schemas, and example request. Toggle a paid `/api/x402/*` op → its 402/x402 payment info is visible.
- Kill the spec route mentally: load with `/openapi.json` returning an error (e.g. point at a bad base) → designed error state, not a blank screen.
- `view-source:` the page → no inlined spec JSON, no third-party CDN `<script src>` for the explorer, no secrets.
- `node scripts/verify-openapi.mjs --base=http://localhost:3000` exits 0.
- `curl -s http://localhost:3000/sitemap.xml | grep -i explorer` (or your route) shows it indexed; `view-source` shows canonical + JSON-LD.
- DevTools console: no errors/warnings.

## Guardrails
- No mocks/fake data. Real content, real links (CLAUDE.md: changelog `link` must be a live page path).
- $THREE only. Stage explicit paths; re-check `git status`. Push only when asked, to BOTH remotes.
- Watch the `npx vercel build` trap: never commit bundled `api/*.js`. Never edit `api/openapi-json.js` into a bundle.
- Never embed a real API key, OAuth token, or wallet secret into the explorer config.
