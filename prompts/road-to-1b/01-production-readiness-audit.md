# 01 — Production-readiness audit & scorecard

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation & truth
**Owns:** read-only across the whole repo; output a report under `tasks/` or `docs/`.
**Depends on:** none. Run this first — it produces the backlog everything else executes.

## Why this matters for $1B
You cannot fix, fund, or scale what you haven't honestly measured. This prompt
produces the single prioritized punch list that prompts 02–34 work down. No hand-waving
— evidence with `file:line`.

## Mission
Produce an honest, reproducible production-readiness scorecard of three.ws with a
prioritized remediation list mapped to the prompts that fix each gap.

## Map
- Existing gates to run and capture: `npm run audit:web`, `npm run audit:pages`,
  `npm run audit:handlers`, `npm run audit:empty-handlers`, `npm run check:images`,
  `npm run lint`, `npm run typecheck`, `npm test`.
- Surface inventory: `STRUCTURE.md`, `data/pages.json` (all ~125 pages), `pages/`,
  `src/`, `api/`, `workers/`, the SDK dirs.

## Do this
1. Run every audit/lint/test script above and capture the raw output (don't fix yet).
2. Grep the tree for hard-rule violations and record `file:line` for each: `TODO`,
   `FIXME`, `HACK`, `throw new Error('not implemented'`, `setTimeout(` used for fake
   loading, `sample`/`mock`/`fake`/`placeholder` arrays, large commented-out blocks.
3. Walk `data/pages.json`: for every page, record whether it has a real backend, real
   data, and designed loading/empty/error states.
4. Score each major surface (Studios, Agents/Agent Studio, Marketplace, Trading suite,
   Launch suite, Worlds/Coin Clash, Wallets/Payments, SDKs, Docs) **Red/Amber/Green**
   on: completeness, designed states, error handling, mobile, a11y, performance.
5. Write a single `tasks/production-readiness-scorecard.md`: an executive summary, the
   surface scorecard table, the violation list with evidence, and an ordered
   remediation list where every Red item names the owning prompt number (02–34).

## Must-not
- Do not fix anything here — audit only. Do not soften or omit findings to look better.

## Acceptance
- [ ] `tasks/production-readiness-scorecard.md` exists with the surface table + evidence.
- [ ] Every Red/Amber item cites `file:line` and an owning prompt number.
- [ ] The audit is reproducible from the listed scripts; `npm test` still green.
