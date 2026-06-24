# 05 · Routing & 404 Audit (vercel.json)

## Mission
Make routing bulletproof: every page reachable by its canonical pretty URL, every legacy/aliased
path redirected, a real designed 404, and no path that silently dead-ends.

## Context
- `vercel.json` uses the legacy `routes` array; order matters (first match wins) and the final
  `/(.*)` → `/$1` is the catch-all. Query strings pass through automatically.
- Every page generally needs BOTH `/<name>` and `/<name>/` → `/<name>.html` (see how
  `/avatar-studio` is wired). Pretty resource routes use captures, e.g.
  `/avatars/([^/]+)/edit` → `/avatar-edit.html?id=$1`.
- `data/pages.json` is the source of truth for the page catalog; `npm run audit:pages`.

## Tasks
1. **Coverage:** for every page in `data/pages.json` and every `pages/*.html`, confirm an
   extensionless route exists (both with and without trailing slash). Add the missing ones,
   mirroring the established pattern. List pages that intentionally have no pretty route.
2. **Order/conflict check:** detect shadowed routes (an earlier broad pattern swallowing a later
   specific one) and fix ordering.
3. **404 page:** confirm there is a real, on-brand 404 with navigation back into the product (not a
   blank/borrowed page). If routing can't produce a true 404 status for unknown paths, wire a
   catch-all to a `404.html` with correct status. Design loading/empty/error per CLAUDE.md.
4. **Redirects:** add 308 redirects for any legacy URLs that exist in the wild (old slugs, `?id=`
   forms that now have pretty equivalents) so links/bookmarks never break.
5. **Trailing-slash + case consistency:** pick one canonical form and redirect the other.
6. **Verify** with a script that requests every route (and a few known-bad paths) against a local
   `npm run build` preview or the dev server and asserts status + final destination.

## Acceptance
- `npm run audit:pages` clean; every catalog page reachable by pretty URL.
- Unknown paths return a designed 404 (correct status).
- No shadowed routes; legacy paths 308-redirect to canonical.
- `vercel.json` valid JSON; changes flagged as deploy-time-effective.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- No mocks / fake data / placeholders / TODOs / stubs. Real APIs and implementations only.
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths (never `git add -A`); re-check `git status`/`git diff --staged` before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`; recover with `git restore -- api/ public/`.
- Every user-visible change → `data/changelog.json` entry + `npm run build:pages`.
- Push to BOTH remotes when asked (`git push threeD main && git push threews main`); never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/05-routing-and-404-audit.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
