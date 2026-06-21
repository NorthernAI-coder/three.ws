# P47 · Developer portal / docs homepage

> **Workstream:** SEO, content & developer experience · **Priority:** P1 · **Effort:** M · **Depends on:** none

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map). The changelog system is described in CLAUDE.md.
2. three.ws monorepo: vanilla JS + Vite. Docs in `docs/`, blog in `blog/`, SEO via `scripts/inject-seo-meta.mjs` + `api/sitemap.js` + `api/page-og`. Page catalog in `data/pages.json`. Dev: `npm run dev`. Tests: `npm test`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.

## Context
The docs surface is real and large. `docs/` holds ~111k lines of markdown across 80+ files (`start-here.md`, `quick-start.md`, `introduction.md`, `api-reference.md`, `js-api.md`, `web-component.md`, `mcp.md`, `sdk.md`, `embedding.md`, `erc8004.md`, a `tutorials/` set, an `internal/` ops set, etc.). They are served as raw `.md` and rendered client-side by `docs/index.html` — a single-page docs app that:
- ships a hardcoded `NAV` array (sections: SDK/API reference, Integrations, Tutorials, Reference, Operations…) at ~line 790,
- hash-routes (`#start-here`), `fetch`es `/docs/<path>.md`, and renders with `marked@9.1.6` + `highlight.js` from CDN,
- defaults to `start-here` when no path is given, and has a sidebar filter input + "Copy page / Open in Claude" page tools.

Routing: `vite.config.js` maps `/docs` and `/docs/` → `docs/index.html`; `copy-static-docs` copies `docs/` → `dist/docs`. `data/pages.json` lists `/docs` and ~16 individual doc routes (`/docs/start-here`, `/docs/quick-start`, `/docs/api-reference`, …) that feed the sitemap, `llms.txt`, and `scripts/inject-seo-meta.mjs`.

## Problem / opportunity
`/docs` opens straight into the `start-here` article body. There is **no portal landing**: no role-based "I'm a no-code creator" vs "I'm a developer" split, no surfaced "popular paths," no top-level search across all pages (the sidebar input only filters nav *labels*, not page content), and the NAV array drifts from `data/pages.json` (links are maintained in two places). A first-time developer lands on prose with no map of where to go. The pieces exist (renderer, nav, ~80 pages) — they need a real front door at the bar of Stripe/Vercel docs homes.

## Mission
Ship a real docs portal home at `/docs`: a role-based "start here" landing, a curated set of paths/cards into the existing markdown, and client-side full-text search across all doc pages — reusing the existing `docs/index.html` renderer and the vanilla/Vite stack (no framework, no build step beyond what exists).

## Scope
**In scope:** A landing view in `docs/index.html` shown for the bare `/docs` route; role/task cards linking to existing `.md` pages; a search box that queries page *content* (built index); reconciling the NAV with `data/pages.json`; all states (loading/empty/error) for search; a changelog entry.
**Out of scope:** Rewriting article content; a server-side renderer; moving off `marked`; touching `blog/` (that's P49); the OpenAPI explorer (P48).

## Implementation guide
1. **Landing view, not an article.** In `docs/index.html`, when `currentPath()` resolves to the bare docs root (no hash, path === `/docs`), render a **portal home** instead of fetching `start-here.md`. Build it from real content:
   - A hero with the product one-liner (reuse copy from `docs/start-here.md`).
   - **Two role lanes** mirroring `start-here.md`'s "Two kinds of people": *Creators (no code)* → `make-your-agent`, `share-and-embed`, `do-i-need-crypto`; *Developers* → `quick-start`, `introduction`, `api-reference`, `web-component`, `mcp`, `sdk`. Each card: title, one-line description, arrow, hover/focus states.
   - A "popular" / "by task" grid (Embed an agent → `embedding`; Generate 3D from a prompt → `tutorials/text-to-3d`; Register on-chain → `erc8004`; Pay-per-call → `x402`). Use only paths that exist in `docs/`.
2. **Single source for the path list.** Pull the canonical doc routes from `data/pages.json` (the `/docs/*` section) so the portal cards and the sidebar can't drift from the catalog. Keep the human-friendly grouping in `NAV`, but assert at runtime (dev only) that every `NAV` `path` exists in `data/pages.json` and warn on a mismatch — eliminate the dual-maintenance trap.
3. **Real content search.** Add a build step `scripts/build-docs-search-index.mjs` that reads every `docs/**/*.md` (skip `internal/` if it shouldn't be public-indexed — match what `data/pages.json` exposes), strips markdown, and writes `public/docs/search-index.json` (`[{path, title, headings[], excerpt, body}]`, body truncated to keep it lean). Wire it into the build (add an npm script, e.g. `build:docs-search`, and call it from `build:pages` or the existing docs copy step). In `docs/index.html`, lazy-`fetch` that index on first keystroke, score by title/heading/body match, and render a results dropdown (keyboard navigable, `Esc` to close, designed empty + error states). Add a `/` keyboard shortcut to focus search.
4. **Wire it into nav.** Confirm `/docs` is reachable from the home doors (`pages/home.html` already links `/docs`) and the global nav (`public/nav.js`). The portal must link back out to `/blog`, `/` and the live API explorer once P48 lands (leave a clearly-labeled link only if the route exists).
5. **SEO.** `/docs` already has a `data/pages.json` entry; ensure its `title`/`description` describe a portal, run `npm run seo:meta` so `inject-seo-meta.mjs` backfills canonical + JSON-LD, and confirm the new search-index file is excluded from the sitemap.

## Definition of done
- [ ] `/docs` renders a role-based portal landing (not an article); every card links to a doc page that exists.
- [ ] Content search returns ranked results across all public docs, with loading/empty/error states and keyboard nav.
- [ ] NAV and `data/pages.json` reconciled; dev-time mismatch warning in place; no dual-maintained link list ships broken.
- [ ] `npm test` passes; build (`npm run build:pages` and/or `npm run build`) succeeds.
- [ ] User-visible → `data/changelog.json` entry + `npm run build:pages`.
- [ ] `git diff` self-reviewed.

## Verification
- `npm run dev`, open `http://localhost:3000/docs` → portal home, not an article. Tab through cards: hover/focus rings present.
- Type a query (e.g. "embed", "web component", "x402") → ranked results; clicking one hash-routes to the article. Empty query state and a no-results state both look intentional.
- Existing deep links still work: `http://localhost:3000/docs/quick-start`, `#api-reference`.
- `npm run build` then check `dist/docs/search-index.json` exists and parses; `curl -s http://localhost:3000/sitemap.xml` does **not** list the search index.
- `node -e "JSON.parse(require('fs').readFileSync('public/docs/search-index.json'))"` exits 0.
- DevTools console: no errors/warnings from the portal code.

## Guardrails
- No mocks/fake data. Real content, real links (CLAUDE.md: changelog `link` must be a live page path).
- $THREE only. Stage explicit paths; re-check `git status`. Push only when asked, to BOTH remotes.
- Watch the `npx vercel build` trap: never commit bundled `api/*.js`.
