# 01 · Production-Readiness Master Audit

## Mission
Produce the authoritative, evidence-backed list of everything standing between three.ws and a
flawless production launch. You are not fixing here — you are **mapping reality** so the rest of
the workstreams have a precise target. The bar is a platform that competes with Vercel/Linear/Stripe.

## Context
- Single npm-workspaces monorepo. Read `STRUCTURE.md` for the surface map, then `CLAUDE.md`.
- ~20 product surfaces under `src/` + `pages/`, Vercel functions in `api/`, workers in `workers/`,
  SDKs at top level and in `packages/`, contracts in `contracts/`.
- Existing audit tooling (use it, don't reinvent): `npm run audit:web`, `npm run audit:pages`,
  `npm run audit:handlers`, `npm run check:images`, `npm run lint`, `npm run typecheck`,
  `npm run test:core`, `npm run build`.

## Tasks
1. **Inventory every reachable surface.** Cross-reference `data/pages.json`, `vercel.json` routes,
   and the nav (`src/nav.js` / header) to list every user-reachable route. Flag any route in nav
   with no page, or any page with no nav/link path (orphans).
2. **Run the full audit suite** above and capture results. For each failure, record file:line and
   root cause (not just the symptom).
3. **Scan for CLAUDE.md violations** repo-wide: `TODO`, `FIXME`, `not implemented`,
   `throw new Error('not implemented')`, `setTimeout(`-based fake loading, `const sample`/`mock`/
   `placeholder` arrays shipped to UI, commented-out code blocks. Report counts + locations.
4. **Coin-policy scan:** grep for any token reference that is not `$THREE` / the canonical CA in
   source, copy, fixtures, tests, docs. Any hit is a release blocker — list it.
5. **State-completeness spot check:** for the top 15 surfaces, confirm loading / empty / error
   states exist. List every surface missing one.
6. **Secrets & config:** confirm no secrets are committed; list required env vars per surface and
   whether each has a graceful absence path.

## Deliverable
Write `docs/audit/production-readiness-YYYY-MM-DD.md` containing:
- An executive summary (top 10 blockers, ranked by launch risk).
- A categorized issue table: `Area | Issue | Evidence (file:line) | Severity (P0–P3) | Suggested prompt #`.
- A coverage matrix of surfaces × (reachable, states designed, tests, a11y, mobile, perf, errors).
- A "ready / not ready" verdict per surface.
Do **not** fix issues in this prompt — route each to the relevant numbered prompt (02–50).

## Acceptance
- The report is exhaustive and every claim cites evidence (path + line or command output).
- A reader can hand any single row to a fresh agent and they'd know exactly what to do.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first (they override defaults)
- No mocks / fake data / placeholders / TODOs / stubs. Real APIs and implementations only.
- $THREE is the only coin (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths (never `git add -A`); re-check `git status`/`git diff --staged` before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`; recover with `git restore -- api/ public/`.
- Every user-visible change → `data/changelog.json` entry + `npm run build:pages`.
- Push to BOTH remotes when asked (`git push threeD main && git push threews main`); never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.
