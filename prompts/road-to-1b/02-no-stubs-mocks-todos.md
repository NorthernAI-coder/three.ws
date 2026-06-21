# 02 — No stubs, mocks, TODOs — hard-rule cleanup

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation & truth
**Owns:** `src/`, `api/`, `workers/`, `pages/`, `scripts/`, SDK dirs (shippable code).
**Depends on:** 01.  ·  **Parallel-safe with:** 04.

## Why this matters for $1B
CLAUDE.md forbids mocks, fake data, TODOs, stubs, and `throw "not implemented"`. A
single shipped placeholder tells a user — and a diligence team — "this company doesn't
finish things." Every one is a credibility leak.

## Mission
Eliminate every mock, fake-data fallback, placeholder, TODO/FIXME, stub function, fake
`setTimeout` loading, and commented-out code from shippable paths — by implementing the
real thing, never by hiding it.

## Map
- Violation inventory from prompt 01.
- `npm run audit:empty-handlers` catches no-op/empty handlers.
- Real integrations already in the repo (Pump.fun feed, Solana RPC, OpenAI/Anthropic
  worker proxies) — use them; never re-mock them.

## Do this
1. For each violation from 01, implement the real behavior: real API/endpoint/data per
   CLAUDE.md "No errors without solutions — there is always a correct answer."
2. Replace every `sample*`/fallback array shipped to production with a real fetch plus a
   designed empty state (a hollow list is not acceptable; tell the user what to do).
3. Convert fake progress bars / `setTimeout` loaders to real async indicators tied to
   actual work (skeletons preferred).
4. Delete commented-out code and dead imports; resolve every `// implement later`.
5. Replace any `throw new Error('not implemented')` with the implementation.
6. Re-run `npm run audit:empty-handlers` and the violation greps from 01 until clean.

## Must-not
- Do not hide a stub behind a feature flag or env check to "pass."
- Do not delete a feature to remove its stub — finish the feature.

## Acceptance
- [ ] Greps for the banned patterns return nothing in shippable code.
- [ ] `npm run audit:empty-handlers` clean; no fake loaders remain.
- [ ] `npm test` green; changelog entry only where user-visible behavior changed.
