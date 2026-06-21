# 02 — No stubs, mocks, TODOs — hard-rule cleanup

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation & truth
**Owns:** `src/`, `api/`, `workers/`, `pages/`, `scripts/`, SDK dirs (`sdk/`, `*-sdk/`, `packages/`).
**Depends on:** 01  ·  **Parallel-safe with:** 04

## Why this matters for $1B
`/CLAUDE.md` forbids mocks, fake data, placeholders, TODOs, and stubs without
exception. A single shipped placeholder reads to users and diligence as an
"unfinished company." This prompt closes that gap by replacing every fake with a
real implementation, never by hiding it.

## Mission
Eliminate every mock, fake-data fallback, placeholder, TODO/FIXME, stub function,
`throw new Error("not implemented")`, fake `setTimeout` loading, and commented-out
code from shippable paths — replacing each with the real thing.

## Map
- Source of violations: the scorecard from prompt 01 (file:line list).
- Empty-handler gate: `npm run audit:empty-handlers` (`scripts/audit-empty-handlers.mjs`).
- Real backends live in `api/` and `workers/`; real data flows through them — wire
  to those, never to a local sample array.

## Do this
1. Take the violation list from prompt 01. For each, implement the real behavior
   per `/CLAUDE.md` "No errors without solutions" — find the root cause and the
   correct fix; do not propagate a lazy error.
2. Replace every sample/fallback array (`sampleAgents`, `const sample…`, demo
   arrays) with a real fetch to the owning `api/` route, plus a designed empty
   state for the zero-result case.
3. Convert fake progress / `setTimeout`-driven loading into real async tied to the
   actual request lifecycle; show a real loading state (skeleton preferred).
4. Replace every `throw new Error('not implemented')` and stub function body with a
   complete implementation; remove `// implement later` / `// TODO` comments only
   after the work behind them is done.
5. Delete commented-out code blocks and dead/unused imports in the files you touch.
6. Run `npm run audit:empty-handlers` and resolve every flagged handler — no no-op
   bodies left behind.
7. Grep the touched paths to confirm the banned patterns are gone before reporting.

## Must-not
- Do not hide a stub behind a feature flag, env guard, or `if (false)`.
- Do not delete a feature to "remove" its stub — finish the feature.
- Do not introduce a new mock/fixture to satisfy a now-real call path.

## Acceptance
- [ ] Grep for the banned patterns returns nothing in shippable code.
- [ ] `npm run audit:empty-handlers` clean; `npm run lint` and `npm run typecheck` clean for touched files.
- [ ] `npm test` green; changelog entry only if user-visible behavior changed.
