# 15 — Every state designed + design-system consistency

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Experience quality
**Owns:** `pages/`, `src/` components, CSS design tokens/variables, shared UI primitives.
**Depends on:** none (run after Phase 0/1).  ·  **Parallel-safe with:** 12, 13, 14, 16, 17.

## Why this matters for $1B
CLAUDE.md: "Every state is designed — loading, empty, error, populated, overflow."
The accumulation of small quality decisions is what separates a $1B product from an
adequate one. Blank voids and raw spinners read as unfinished.

## Mission
Give every surface designed loading/empty/error/populated/overflow states and unify
them under one consistent set of design tokens and primitives.

## Map
- All ~125 `pages/` surfaces and their `src/` controllers.
- Existing design tokens / CSS variables (locate the shared stylesheet); shared
  components in `src/dashboard-next/components/` and equivalents.

## Do this
1. For each major surface (Studios, Agents, Marketplace, Trading, Launch, Worlds,
   Wallets, Docs): verify all five states exist and are intentional.
2. Empty states must tell the user what to do next (a CTA), never just "no data."
3. Error states must say what went wrong and how to recover (retry/contact), never a
   raw stack or silent failure — pair with prompt 06's error boundaries.
4. Loading states use skeletons over spinners where content shape is known.
5. Handle overflow: very long names, 0 / 1 / 1000 items, truncation with tooltips.
6. Consolidate ad-hoc colors/spacing/typography onto the shared design tokens; extract
   repeated card/list/modal markup into shared primitives so quality is uniform.
7. Ensure hover/active/focus microinteractions exist on every interactive element.

## Must-not
- Do not ship a blank empty state or a raw error string.
- Do not fork new one-off color/spacing values — use the tokens.

## Acceptance
- [ ] Every major surface has all five designed states, audited and listed.
- [ ] Shared tokens/primitives used consistently; no orphan one-off styles introduced.
- [ ] `npm test` green; changelog `improvement` entry.
