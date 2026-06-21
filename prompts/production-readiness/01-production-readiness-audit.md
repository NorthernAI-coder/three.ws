# 01 — Production-readiness audit (baseline)

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 1 · Audit & baseline
**Owns:** read-only audit — produces `docs/internal/audit/` reports, edits nothing in `src/`/`api/`.
**Pairs with:** every later prompt consumes this output.

## Why this matters for $1B
You cannot harden what you cannot see. A fundable platform starts with an honest,
written inventory of every gap. This audit is the map the entire Road-to-$1B effort
navigates by — it converts "the app feels rough" into a prioritized, assignable list.

## Mission
Produce a complete, severity-ranked inventory of production gaps across the codebase
and write it to `docs/internal/audit/`. **Find and document — do not fix here.** Each
finding must name the exact file/route and map to the prompt that will fix it.

## Map — real anchors
- `STRUCTURE.md` — surface→directory map. Start here.
- `data/pages.json` — every public route (source of truth for what ships).
- `vercel.json` — routes, headers, crons. `api/` (961 functions), `src/` (810 modules), `pages/` (168 HTML).
- `scripts/audit-pages.mjs`, `scripts/audit-handlers.mjs`, `scripts/page-audit.mjs`, `scripts/check-images.mjs` — existing audits to run.

## Do this
1. Run every existing audit and capture output: `npm run audit:pages`, `npm run audit:handlers`, `npm run check:images`, `npm run audit:web`, `npm run audit:deploy`. Record failures.
2. **Stub/mock/TODO sweep:** grep the codebase for `TODO`, `FIXME`, `not implemented`, `throw new Error('not`, `setTimeout(` fake-loading, `const sample`, `mockData`, `placeholder`, commented-out code blocks. List every hit with file:line. (CLAUDE.md forbids all of these.)
3. **Empty-handler sweep:** find `api/` functions that return nothing, 501, or a hardcoded shape instead of real data.
4. **Surface completeness:** walk `STRUCTURE.md`'s surface list; for each, confirm the page loads, has real data, and every CTA/link resolves. Note half-wired surfaces.
5. **Designed-states gap:** for the top 20 routes by importance, note which lack a designed loading / empty / error state.
6. **Coin compliance:** grep for any token reference that is not `$THREE` / CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` (exclude runtime-supplied mints + platform launch directories). Flag each as a hard blocker.
7. Write `docs/internal/audit/README.md` (exec summary + counts) and one file per category (`stubs.md`, `dead-paths.md`, `designed-states.md`, `coin-compliance.md`, `handlers.md`). Each finding: `file:line` · severity (blocker/high/med/low) · which prompt (`NN`) fixes it.

## Must-not
- Do not fix anything here except trivially-safe deletions of dead code you are 100% sure about — this prompt's value is the written inventory.
- Do not under-report. A short audit of a 60-surface platform is a failed audit.

## Definition of done
- [ ] `docs/internal/audit/` exists with an exec summary + per-category reports, every finding tagged with file:line, severity, and owning prompt number.
- [ ] All existing `npm run audit:*` results captured (pass/fail + output).
- [ ] Coin-compliance section is exhaustive (every non-`$THREE` reference, or "none found").
- [ ] Counts roll up in the README (e.g. "47 stubs, 12 dead paths, 9 undesigned error states").

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
