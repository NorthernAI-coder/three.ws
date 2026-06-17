# E03 — `/discover` & `/marketplace` sorting/filtering/search parity

**Track:** Improve Features · **Size:** M · **Priority:** P2 · **Depends on:** B04 cards

## Goal
Bring discovery surfaces to a consistent, powerful baseline: shared sorting, filtering, search,
pagination, and unified cards across `/discover`, `/marketplace`, `/my-agents`, `/gallery`.

## Why it matters
`CLAUDE.md` innovation standard: "if you're adding a list view and notice the existing ones lack
sorting — add sorting." These browse surfaces are how users find value; inconsistent, weak
browsing buries the catalog.

## Context
- Surfaces: `public/discover/`, [pages/marketplace.html](pages/marketplace.html) (`--mk-*`, being unified in B02), `public/my-agents/`, `public/gallery/`.
- Real data via existing agent/marketplace/discover endpoints.

## Scope
- A shared list/grid toolkit: sort (recent/trending/name), filter (type/chain/status), text search (debounced, real API), pagination/infinite scroll, and the B04 cards.
- Apply it across the four surfaces so they behave identically.
- Designed empty/loading(skeleton)/error states; URL-synced filters (shareable/back-button safe).

## Definition of done
- All four discovery surfaces share sorting/filtering/search/pagination and unified cards, backed by real data, with filters reflected in the URL.

## Verify
- Sort/filter/search on each surface; confirm results are real, the URL updates, and back/forward works.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/E-improve-features/E03-discover-marketplace-parity.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
