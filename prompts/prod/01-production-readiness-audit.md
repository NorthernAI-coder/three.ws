# 01 — Production-readiness audit & scorecard

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation & truth
**Owns:** read-only across the whole repo; output is a single committed scorecard doc (e.g. `docs/road-to-1b/production-readiness-scorecard.md`).
**Depends on:** none  ·  **Parallel-safe with:** —

## Why this matters for $1B
You cannot fix what you have not measured. This prompt produces the prioritized,
evidence-backed backlog that the rest of this track (02–34) executes against. A
diligence team and a million users both meet the same surfaces; this audit tells
the truth about which ones are finished and which only look finished.

## Mission
Produce an honest, prioritized production-readiness scorecard of three.ws with
file:line evidence and an ordered remediation list mapped to prompts 02–34.

## Map
- Existing gates (cite by name): `npm run audit:web`, `npm run audit:pages`,
  `npm run audit:handlers`, `npm run audit:empty-handlers`, `npm run check:images`,
  `npm run lint`, `npm run typecheck`, `npm test`.
- Surfaces (from `STRUCTURE.md`): Studios (`character-studio/`, `src/scene-studio/`,
  Forge/Avatar/Animation), Agents (`api/`, agent profiles), Marketplace/skills,
  Trading/intel (`workers/oracle/`, radars, leaderboards), Launch
  (`pages/launches.html`, `api/pump/`), Worlds (`multiplayer/`), Wallets/x402
  (`api/x402-*`, `api/_lib/agent-wallet.js`), SDKs (`sdk/`, `*-sdk/`, `packages/`),
  Docs. Page inventory: `data/pages.json`.

## Do this
1. Run every gate and capture raw output verbatim into the scorecard:
   `npm run audit:web`, `audit:pages`, `audit:handlers`, `audit:empty-handlers`,
   `check:images`, `lint`, `typecheck`, `test`. Note pass/fail and counts.
2. Grep the tree for hard-rule violations and record each as `path:line`:
   `TODO`/`FIXME`/`HACK`, `throw new Error('not implemented'`, `setTimeout` fake
   loading/progress, `sampleAgents`/`const sample`/fallback arrays,
   `mock`/`fake`/`placeholder`, and commented-out code blocks. Scope to shippable
   paths (`src/`, `api/`, `workers/`, `pages/`, SDK dirs); exclude `node_modules`,
   `dist`, vendored trees.
3. Inventory all pages in `data/pages.json`: for each, mark whether it has a real
   backend, real data, and designed loading/empty/error/populated states.
4. Score each surface above **Red / Amber / Green** on six axes: completeness,
   states, error handling, mobile, accessibility, performance. One row per surface.
5. Emit one prioritized scorecard: severity-ordered, every **Red** item carries an
   owner-prompt number (02–34) and file:line evidence. End with an ordered
   remediation list that reads as the execution plan for this track.

## Must-not
- Do not fix, edit, or refactor anything — this is audit-only.
- Do not soften, round up, or omit findings to make a surface look greener.
- Do not invent paths; cite only what you verified exists.

## Acceptance
- [ ] Scorecard committed under `docs/`; every Red item has an owner-prompt number and file:line evidence.
- [ ] Output reproducible via the listed scripts; raw gate output captured.
- [ ] No code changed (`git diff` shows only the new doc); `npm test` still green.
