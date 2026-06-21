# 12 — Every state designed (loading / empty / error)

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 1 — Cross-cutting hardening
**Owns:** every data-driven view across `pages/`, `src/`, `public/`.
**Depends on:** `04` (no fake fallbacks), `06` (error handling).

## Why this matters for $1B
`/CLAUDE.md`: "Every state is designed. A page with no data should tell the user what
to do, not show a blank void." The gap between an adequate product and a $1B one is
the accumulation of these moments — the empty state that converts, the error that
recovers, the skeleton that reassures.

## Mission
Every async, list, and detail view has intentional loading, empty, error, and
overflow states. No blank voids, no raw spinners where a skeleton belongs, no dead
ends on failure.

## Map
- Data-driven surfaces: marketplace, launches feed, agent profiles, wallet/activity,
  bounties, communities, collections, gallery, forge results, search results.
- Reuse/establish shared components for skeletons, empty states, and error states so
  every surface is consistent (coordinate with prompt `13`).

## Do this
1. Inventory every view that fetches or renders variable data. For each, define all
   four states: **loading**, **empty**, **error**, **populated** (+ overflow:
   pagination/virtualization for large lists).
2. **Loading:** skeleton screens that match the populated layout (preferred over
   spinners), tied to real request lifecycle (no fake `setTimeout`).
3. **Empty:** explain what this is, why it's empty, and the one clear next action
   (CTA) — e.g. "No agents yet — forge your first" with a button. Add a tasteful
   illustration/icon. Empty ≠ blank.
4. **Error:** say what went wrong in human terms and offer recovery (Retry, go back,
   contact). Wire Retry to actually re-run the fetch. Never show raw error objects.
5. **Overflow:** lists handle 0 / 1 / many / very-many (paginate or virtualize at
   scale per prompt `10`); long strings truncate with full value on hover/title;
   layouts survive extreme content.
6. Build shared `<Skeleton>`, `<EmptyState>`, `<ErrorState>` primitives (or the
   vanilla-JS equivalent helpers) and adopt them everywhere for consistency.
7. Verify each state in a real browser by forcing it (throttle, offline, empty
   account, error injection).

## Must-not
- Do not ship a bare spinner where a skeleton fits, or a blank area for empty.
- Do not display raw stack traces / JSON errors to users.
- Do not leave a Retry button that doesn't retry.

## Acceptance
- [ ] Every data view has designed loading, empty, error, and overflow states.
- [ ] Loading uses layout-matched skeletons tied to real async.
- [ ] Empty states have copy + a working CTA, not a void.
- [ ] Error states are human and have working recovery actions.
- [ ] Shared state primitives exist and are reused across surfaces.
- [ ] States verified in-browser by forcing each one.
