# 04 — Routing, redirects & 404/500 pages

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 1 · Audit & baseline
**Owns:** `vercel.json` routes/redirects, the 404 + 500 error pages, the page-route audit.
**Depends on:** `01`, `02`. **Pairs with:** `51` (SEO).

## Why this matters for $1B
Routing is the platform's plumbing. Broken redirects leak SEO equity, mis-scoped routes
expose internal pages, and an undesigned 404 turns a recoverable wrong-turn into a bounce.
The strict page-route audit (which already gates the Vercel build) is the contract: every
public `.html` route is either documented or deliberately excluded.

## Map — real anchors
- `vercel.json` — all `routes` (src→dest), redirects, cache + frame headers.
- `data/pages.json` — documented public routes (source of truth).
- `scripts/audit-page-index.mjs` — strict audit; every auditable `.html` route must be in `data/pages.json` or its `IGNORE`/`IGNORE_PREFIXES` set. **This gates `npm run build:vercel`.**
- The 404 page (search `public/` / `pages/` for `404.html`) and any 500/offline page (`public/cz/offline/index.html`).

## Do this
1. Run `node scripts/audit-page-index.mjs --strict`. Resolve every undocumented route: add real landing pages to `data/pages.json` (path, title, description, `added: YYYY-MM-DD`), or add genuine in-flow/noindex shells to the audit's IGNORE set **with a one-line justification comment** (match the existing style, e.g. `/avatar-studio`, `/avatar-edit`).
2. Audit `vercel.json` redirects: confirm each points at a live destination, uses the correct status (301 permanent vs 302/307 temporary), and there are no redirect chains/loops.
3. **404 page:** ensure it exists, is branded, explains what happened, and offers real next steps (search, home, popular surfaces) — not a blank "Not Found." Design loading/empty parity with the rest of the platform.
4. **500 / error boundary:** ensure server/edge failures render a branded, actionable page (retry, status link, support), not a raw stack or Vercel default.
5. Check `noindex` correctness: in-flow/editor shells (`robots: noindex`) must **not** be in `data/pages.json` (those feed the public sitemap) — they belong in the audit IGNORE set instead.
6. Verify trailing-slash + case behavior is consistent (no duplicate-content routes).

## Must-not
- Do not add a `noindex` editor shell to `data/pages.json` — it would be sitemapped against its own directive. Use the audit IGNORE set.
- Do not paper over an undocumented route by deleting it from `vercel.json` if the page is real and reachable — document it instead.

## Definition of done
- [ ] `node scripts/audit-page-index.mjs --strict` exits 0; `npm run build:vercel` passes the page-index step.
- [ ] Every redirect resolves, with correct status codes, no chains/loops.
- [ ] Branded, actionable 404 **and** 500/error pages exist and are reachable.
- [ ] `noindex` shells are excluded from the sitemap (in IGNORE, not in `pages.json`).
- [ ] `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
