# Task: Wire the marketplace ↔ agent profiles + add sorting/filtering

CLAUDE.md: "A marketplace that doesn't link to agent profiles is half-built."
Make the marketplace a connected, navigable system.

## Anchor files
- Marketplace: `pages/marketplace.html`, `src/marketplace.js`, `src/marketplace-lobby.js`, `src/marketplace-detail.js`. API: `api/marketplace/`, `api/agents/`, `api/agent-3d/`.
- Agent profiles: `pages/agent-detail.html` / `pages/agent-home.html`, `src/agent-detail.js`, `src/agent-home.js`, `src/agents-directory.js`.

## What to build
1. **Bidirectional links** — every marketplace card links to the real agent profile/detail; every agent profile links back to its marketplace listing and to related agents (same creator / category). No dead cards.
2. **Sorting** — sort by recent, popularity/usage, price, name. Real fields from the API; persist the choice in the URL query so it's shareable and survives reload.
3. **Filtering** — by category/capability/price range, driven by real data. Combine with sort. Reflect active filters in the URL.
4. **Search** — debounced text search over real listings.
5. **Cross-pollination** — on an agent profile, surface "more from this creator" and "similar agents" using real data relationships.
6. **States** — loading skeletons, empty (no results → clear filters / create CTA), error (retry). Reuse design tokens.

## Constraints
- Real API data only — no sample agent arrays. If the marketplace API lacks a sort/filter field, add it to the endpoint rather than faking client-side on fake data.
- URL is the source of truth for sort/filter/search (back button works).

## Definition of done
- `npm run dev` → `/marketplace`: sort + filter + search work on real data, reflected in URL; every card navigates to a real profile; profiles link back + show related agents.
- All states designed; zero console errors; responsive. `npm run build` clean.
- Run the **completionist** subagent. Report the new links, sort/filter fields, and any API changes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/wow-sprint/18-marketplace-crosslinking.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
