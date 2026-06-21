# 03 — Dead paths, broken links & empty handlers

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation & truth
**Owns:** `pages/`, `src/` UI + components, nav/footer, `data/pages.json`.
**Depends on:** 01.  ·  **Parallel-safe with:** 02, 04.

## Why this matters for $1B
Every dead button, no-op link, or 404 is a trust leak and a conversion killer.
CLAUDE.md is explicit: if a button exists it must work; if a link exists it must go
somewhere; if a state exists there must be a way to reach it.

## Mission
Guarantee every link resolves, every button does something real, every declared state
is reachable, and every page is reachable from navigation.

## Map
- `npm run audit:pages`, `npm run audit:handlers`, `npm run audit:empty-handlers`.
- Primary nav: `src/dashboard-next/components/topbar.js`; footer + in-page CTAs across
  `pages/`. Route registry: `data/pages.json`. The "All pages" directory + guided tour
  should cover real routes only.

## Do this
1. Run `audit:pages`, `audit:handlers`, `audit:empty-handlers`; fix every flagged item.
2. Crawl the topbar, footer, and in-page CTAs for `href`s that 404 or point nowhere;
   fix the destination or remove the link with intent (no orphan links).
3. Verify every page in `data/pages.json` is linked from somewhere and renders.
4. Find buttons/handlers that are missing or no-ops; wire them to real behavior or
   remove the control if the action genuinely doesn't exist yet (then note the gap).
5. Verify deep-links, back/forward, and the guided tour land on real, working routes.
6. Confirm the "All pages" directory reflects the live route set.

## Must-not
- Do not mask a broken link by suppressing the click — fix the destination or remove it.
- Do not leave a control that looks interactive but does nothing.

## Acceptance
- [ ] `audit:pages`, `audit:handlers`, `audit:empty-handlers` all clean.
- [ ] Manual crawl of nav/footer/CTAs finds zero dead links or no-op buttons.
- [ ] Every `data/pages.json` route is reachable and renders; `npm test` green.
