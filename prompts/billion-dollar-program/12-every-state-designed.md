# 12 — Every state designed (loading / empty / error / overflow)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

The difference between a toy and a product is what happens when there's no data, the
network fails, or a name is 80 characters long. A blank void on first load reads as
broken; an unstyled error reads as abandoned; an empty marketplace with no call to
action loses the user who would have created the first listing. A $1B platform designs
every state so the user is never confused, stuck, or staring at nothing.

## Mission

Audit every list, grid, feed, and detail view and ensure all four states are
deliberately designed: **loading** (skeletons over spinners), **empty** (actionable —
tells the user what to do next), **error** (recoverable with retry), and **overflow**
(0 / 1 / 1000 items, very long names, missing thumbnails).

## Map (trust but verify — files move)

- **Data-driven surfaces** — `src/` modules that fetch then render lists/grids/feeds.
  Grep for `fetch(`, `innerHTML =`, `.map(`, `appendChild` in `src/` to find render
  paths. High-value targets: marketplace, agent profiles/feed, forge gallery/results,
  wallet/transactions, launches feed, changelog, notifications.
- **Forge result states (gold standard reference)** — see
  [prompts/production-1b/15-forge-text-to-3d-pipeline.md](./15-forge-text-to-3d-pipeline.md):
  every phase labeled, real elapsed time, no fake `setTimeout` bars. Match that bar.
- **Shared styles for states** — [public/tokens.css](../../public/tokens.css) (spacing,
  surfaces, motion for skeleton shimmer). Reuse existing skeleton/empty-state CSS where
  present (grep `skeleton` / `empty-state` across `public/*.css`); establish a shared
  pattern where missing.
- **Pages hosting these views** — [pages/](../../pages) (marketplace, agent-detail,
  forge, wallet, launches, etc.).
- **APIs feeding them** — [api/](../../api) handlers (to reproduce error/empty responses
  for testing). Tests live in [tests/](../../tests).

## Do this

1. **Inventory.** Build a checklist of every list/grid/feed/detail view across `src/`.
   For each, record where its data comes from and which of the four states currently
   exist vs. are missing.
2. **Loading = skeletons.** Replace bare spinners and blank gaps with skeleton screens
   that match the final layout (so there's no shift when data arrives). No fake progress
   bars — drive UI off real request lifecycle.
3. **Empty = actionable.** Each empty state explains why it's empty and gives the next
   action with a working CTA (e.g. "No agents yet — create your first" → links to the
   create flow). Never a bare "No data." Design a reusable empty-state component if one
   doesn't exist.
4. **Error = recoverable.** On fetch failure, show a designed error with a plain-language
   message and a **Retry** that re-runs the request. Never leak raw stack traces, vendor
   billing/quota text, or provider URLs — keep raw detail in logs, show neutral copy.
5. **Overflow & edge counts.** Verify each view at **0**, **1**, and **~1000** items:
   pagination/virtualization or "load more" for large lists; sensible single-item layout;
   no jank. Truncate long names with ellipsis + full value on hover/`title`; wrap long
   descriptions; provide a fallback for missing/broken thumbnails.
6. **Reproduce each state in the browser.** `npm run dev` and force every state: throttle
   to Offline for error, point at an empty account for empty, paste a long name, and load
   a large feed. Confirm each is designed and reachable — no dead states.
7. **Wire the failsafes.** Per `/CLAUDE.md`, errors are handled at boundaries (network /
   user input) with working fallbacks; internal code trusts itself. Make sure a failed
   sub-request degrades that section gracefully instead of blanking the whole page.
8. **Test & ship.** Add/extend tests asserting empty and error rendering for at least the
   marketplace and one feed (component or Playwright). `npm test`. Add a changelog entry
   for the user-visible polish; `npm run build:pages`.

## Must-not

- Do not ship a bare spinner where a skeleton matching the layout belongs.
- Do not leave a "No data" / blank empty state with no next action.
- Do not surface raw errors, stack traces, or vendor billing/quota text to users.
- Do not let one failed sub-request blank the entire page — degrade the section only.
- Do not use fake `setTimeout` loading; drive states off the real request lifecycle.
- Do not reference any coin other than `$THREE` in any state copy.

## Acceptance (all true before claiming done)

- [ ] Every list/grid/feed/detail view has designed loading, empty, error, and overflow states.
- [ ] Loading uses skeletons matching final layout; no layout shift on data arrival; no fake bars.
- [ ] Empty states are actionable with a working CTA; error states have a working Retry.
- [ ] 0 / 1 / 1000 items, long names, and missing thumbnails all render cleanly.
- [ ] No raw errors or vendor internals reach users; failures degrade per-section.
- [ ] Each state reproduced in a real browser; tests cover empty + error for key views.
- [ ] `npm test` passes; changelog updated and `npm run build:pages` is clean.
