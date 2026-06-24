# 02 · Dead Paths & Broken Links Sweep

## Mission
Every link must go somewhere live; every button must do something; every state must be
reachable. Eliminate all dead paths across the platform. (Precedent: the account menu's
"Edit Avatar" linked to an unrouted `/avatar-edit` and 404'd — find and kill every case like it.)

## Context
- Routes live in `vercel.json` (legacy `routes` array, `src`→`dest`). The catch-all
  `/(.*)` → `/$1` means an unrouted extensionless path 404s instead of falling back to `.html`.
- Pages: `pages/*.html`; entry modules: `src/*.js`. Nav: `src/nav.js` and per-page headers.
- Helper scripts: `npm run audit:pages`, `npm run audit:handlers` (empty click handlers),
  `npm run check:images`.

## Tasks
1. **Internal link extraction.** Grep all `href="/..."`, `location.href = '/...'`,
   `router/navigate('/...')`, and `data-*` nav attributes across `src/`, `pages/`, `public/`.
   Normalize to paths.
2. **Route resolution.** For each internal path, confirm a matching `vercel.json` route OR a real
   static file. Flag every path that resolves to the catch-all with no backing file (a latent 404).
   Pay special attention to extensionless pretty paths (`/avatar-edit`, `/create`, `/agent/:id/edit`).
3. **Empty/again handlers.** Run `npm run audit:handlers`; fix every button/link whose handler is a
   no-op, `#`, `javascript:void(0)`, or missing.
4. **Cross-surface wiring.** Verify the "second-order" links CLAUDE.md cares about exist: marketplace
   → agent profile, gallery → forge, dashboard → edit, agent profile → launch history, etc.
5. **External links.** Verify external/CDN links are https, not dead, and `rel="noopener"` where
   `target="_blank"`.
6. **Fix** each finding with the correct destination (prefer the canonical pretty route; add the
   missing `vercel.json` route when a page has no extensionless entry, mirroring sibling pages).

## Acceptance
- `npm run audit:pages` and `npm run audit:handlers` pass clean.
- Zero internal links resolve to a non-existent file.
- A repo-wide grep for the fixed bad paths returns nothing.
- Changelog entry for any user-visible fix; `vercel.json` changes noted as deploy-time.

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
git rm "prompts/02-dead-paths-and-broken-links.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
