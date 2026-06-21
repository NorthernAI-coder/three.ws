# C2 — Discover / browse surfaces to the bar

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none.

## Why this matters for $1B

Discovery is how a visitor finds the thing worth coming back for — the trending model, the
agent to hire, the world to explore. These are the most-linked, most-screenshotted surfaces
on the platform; a half-empty grid, an "undefined" card, or a list with no sort/filter reads
as a dead marketplace, and a dead marketplace has its **liquidation value**, not a $1B one.
Discovery surfaces are also where network effects live: every card must link to the profile,
the launch, the studio it represents. A grid that doesn't go anywhere is decoration.

## Surfaces in scope (the real pages)

- **Trending:** `pages/trending.html` → `src/trending*` → `api/explore.js`,
  `api/discover-detail.js`
- **Marketplace:** `pages/marketplace.html` → `src/marketplace.js`, `marketplace-lobby.js`,
  `marketplace-detail.js`; analytics: `pages/marketplace-analytics.html` →
  `src/marketplace-analytics.js`
- **Avatar / animation galleries:** `pages/animations.html` → `src/animations-gallery.js`,
  `src/animation-library.js`; avatar browsing lives in the marketplace/collection grids
- **Agents index:** `/agents` → `public/agents/index.html` (and `agents/index.html`)
- **Worlds:** `pages/worlds.html` → `src/worlds*`
- **All-pages directory:** `/directory` (`/all-pages` → 308) — the page that enumerates every
  surface; confirm the live route in `vercel.json` and the file it serves
- **Collection:** `pages/collection.html` → `src/collection.js`
- **Constellation:** `pages/constellation.html` → `src/constellation/*`
- **Communities (browse):** `pages/communities.html` → `src/community/*`
- **Galaxy (3D discovery):** `pages/galaxy.html`
- Data sources: `api/explore.js`, `api/discover-detail.js`, the marketplace/collection feeds.

## Current state (read before you write)

These pages fetch real feeds. The gaps to find: **empty states** that show a blank grid or
"No results" instead of a designed empty state with a next action (a CTA to create, a sample,
a cleared-filter button); **loading** that pops in instead of skeleton cards matching the
grid; **error** that fails silently when `api/explore.js` / `api/discover-detail.js` errors;
**overflow** — pagination/infinite-scroll for 1000+ items, truncation for 200-char names,
graceful handling of missing thumbnails. Also audit: do all cards link somewhere real
(profile / launch / studio)? Is there sort/filter, and does it persist in the URL?

## Your mission

### 1. Audit every surface for the five states
**Loading** = skeleton cards in the real grid shape (not a centered spinner). **Empty** =
explains the surface and gives the next action (create one, see an example, clear the filter).
**Error** = names the failure (feed down) and offers retry. **Populated** = token-consistent
cards with hover/focus. **Overflow** = pagination or virtualized infinite scroll for large
sets; name/number truncation; missing-image fallback. Verify against real `api/explore.js`
and `api/discover-detail.js` responses, including the empty and error responses.

### 2. Eliminate dead cards and add sort/filter where missing
Every card links to its real detail/profile/launch destination — no card that goes nowhere.
Where a discovery grid lacks sorting or filtering (per the "if your list lacks sorting, add
it" rule in `CLAUDE.md`), add it and reflect it in the URL so it's shareable and back-button
safe. Cross-wire: trending cards → agent profile / launch detail; marketplace → studio remix.

### 3. Mobile, a11y, microinteractions
Grids reflow cleanly at **320 / 768 / 1440px** (no horizontal scroll, no clipped cards).
Cards are keyboard-focusable with visible focus rings and screen-reader labels; filter
controls are labelled. Honor `prefers-reduced-motion` on card enter/hover transitions. Every
interactive element gets hover, active, and focus states.

### 4. Design tokens + performance
Replace hardcoded colors/spacing/fonts with `public/tokens.css` tokens. Lazy-load images
(and the 3D galaxy/constellation Three.js modules), debounce the filter/search input,
paginate or virtualize long lists. No layout shift as cards load.

## Definition of done

Clears `00b-the-bar.md` §3 (five states, responsive, a11y) and §2 (no layout shift, lazy 3D).
Inherits the **global definition of done** in `00-README-orchestration.md`: real feeds only,
`$THREE` the only coin, tokens only, verified in a browser at `npm run dev` with zero console
errors from your code and real network calls, existing tests pass. State which bars you
cleared and how you verified each (the empty response, the 1000-item scroll, the screenshot).

## Operating rules (override defaults)

No mocks / fake data / placeholders / TODOs / stubs / sample arrays. `$THREE`
(`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the only coin — runtime user-launch feeds
(the launch directory, agent launch history) render user-launched mints and are the sole
mechanical exception per `CLAUDE.md`; never hardcode or recommend a non-`$THREE` mint. Design
tokens only (`public/tokens.css`). Stage explicit paths only (never `git add -A`); check
`head -1` of any `api/*.js` you touch for the `__defProp` bundle trap. Own **only the pages
listed here**; extend, don't rewrite, the shared nav/tokens.

## When finished

Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. URL-persisted filters,
a "trending this week" facet, or an empty-state that seeds a starter search). Append a
holder-readable `data/changelog.json` entry if user-visible (`npm run build:pages` to
validate). Then delete this prompt file
(`prompts/production-campaign/C-surfaces/C2-discover-surfaces.md`) and report what you
shipped, which bars you cleared and how you verified them, and any seam for the next agent.
