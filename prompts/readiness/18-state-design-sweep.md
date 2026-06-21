# 18 — Every state designed (loading / empty / error / overflow)

**Phase 5. [parallel-safe]** with 19–21.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. Read
[CLAUDE.md](../../CLAUDE.md) — "Every state is designed. Loading, empty, error,
populated, overflow — all of them. A page with no data should tell the user what
to do next, not show a blank void. Skeleton screens preferred over spinners." The
only coin is **$THREE**.

## Objective

Every data-driven surface has a designed, helpful state for all five conditions:
loading (skeleton), empty (with a next action), error (with recovery), populated,
and overflow (long names, 1000 items, tiny/huge values). No blank voids, no raw
spinners where a skeleton fits, no dead-end empty screens.

## Why it matters

The states users hit most — first visit (empty), slow network (loading), failure
(error) — are exactly the ones teams skip. Designing them is what makes a product
feel finished and trustworthy. This is where "adequate" becomes "screenshot-
worthy."

## Instructions

1. **Inventory data surfaces.** Every list, grid, feed, detail page, chart, and
   3D viewer that loads async data: home live sections, marketplace, trending,
   launches, agent profile, reputation, collection, search results, chat,
   earnings/analytics, x402 history. Build the checklist.
2. **For each, design all five:**
   - **Loading:** skeleton matching the final layout (not a centered spinner),
     sized to prevent CLS. Reuse a shared skeleton component — build one if none
     exists; don't reinvent per page.
   - **Empty:** explain *why* it's empty and give the next action ("No agents yet
     — Forge your first" with a button). Never just "No data." This is the
     conversion moment for new users.
   - **Error:** what went wrong (plainly) + a recovery action (Retry / Reconnect
     / Refresh). Ties to [03 — error boundaries](03-harden-error-boundaries.md).
   - **Populated:** the normal case — confirm it's polished.
   - **Overflow:** truncate long text with ellipsis + title/tooltip; paginate or
     virtualize long lists; handle huge/zero/negative numbers and very long
     agent names without breaking layout.
3. **Real async indicators only.** No `setTimeout` fake-loading, no fake progress
   bars (CLAUDE.md hard rule). Loading reflects real request state.
4. **Transitions.** States enter/exit with intention — opacity/transform
   transitions, no jarring pops (CLAUDE.md). Skeleton → content should crossfade,
   not snap.
5. **Verify by forcing each state** in `npm run dev`: throttle/offline for
   loading+error, a fresh/empty account for empty, seeded long names + many items
   for overflow. Screenshot each for your report (don't commit screenshots — see
   repo hygiene).

## Definition of done

- [ ] Every async data surface has all five states designed and reachable.
- [ ] Loading uses layout-matched skeletons (shared component), not bare spinners,
      and reserves space (no CLS).
- [ ] Every empty state names the next action with a working CTA.
- [ ] Every error state is plain-language + has a recovery action.
- [ ] Overflow handled: long text truncates, long lists paginate/virtualize,
      extreme numbers don't break layout.
- [ ] No fake loading/progress anywhere; transitions are smooth.
- [ ] Each state verified by forcing the condition in the browser (logged in your
      report).
- [ ] `npm test` passes. Changelog: `improvement` entry ("Polished loading,
      empty, and error states across the app").
