# 03 · Zero Console Errors & Warnings

## Mission
Open every major page in a real browser and drive it until the console is **silent** — no errors,
no warnings from our code, no failed network requests, no unhandled rejections. A clean console is
table stakes for the quality bar in CLAUDE.md's Definition of Done.

## Context
- Vite dev server: `npm run dev` (port 3000). Pages serve at `http://localhost:3000/<page>.html`.
- Playwright is installed (`node_modules/.bin/playwright`, `playwright-core`, chromium available).
- Note: in Codespaces, Vite's HMR WebSocket fails through the proxy (a 302 on the wss handshake) —
  that specific warning is environment noise, not a page bug. Everything else counts.

## Tasks
1. Build a small Playwright script (keep it in `scripts/`, not repo root) that loads each route from
   `data/pages.json`, waits for network idle, exercises the primary interaction, and collects
   `console` (error/warning) + `pageerror` + failed responses (4xx/5xx).
2. Run it headless at 1440×900 and 390×844 (desktop + mobile). Capture a table of
   `route | errors | warnings | failed requests`.
3. **Fix every real issue at its root**: missing assets, null derefs, race conditions on mount,
   double-initialized listeners, deprecated API calls, CORS/CSP violations, 404'd fetches.
4. Re-run until the table is clean (excluding the documented HMR-proxy noise).
5. Delete the throwaway script when done, or land it under `scripts/` as a reusable
   `npm run`-able check if it adds lasting value (wire it into `package.json` if so).

## Acceptance
- Every route loads with a clean console at both viewports.
- No unhandled promise rejections anywhere.
- No failed same-origin network requests on initial load + primary interaction.
- Report saved to `docs/audit/console-sweep-YYYY-MM-DD.md`; changelog entry for any user-visible fix.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- No mocks / fake data / placeholders / TODOs / stubs. Real APIs and implementations only.
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths (never `git add -A`); re-check `git status`/`git diff --staged` before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`; recover with `git restore -- api/ public/`.
- No throwaway scripts in the repo root — put tooling in `scripts/` or delete it.
- Every user-visible change → `data/changelog.json` entry + `npm run build:pages`.
- Push to BOTH remotes when asked (`git push threeD main && git push threews main`); never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/03-console-errors-warnings-sweep.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
