# 03 — Dead paths, broken links & empty handlers

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 0 — Foundation & truth
**Owns:** `pages/`, `src/`, `data/pages.json`, nav/footer/CTA components (incl. `src/dashboard-next/components/topbar.js`).
**Depends on:** 01  ·  **Parallel-safe with:** 02, 04

## Why this matters for $1B
Every dead button and every 404 link is a trust leak. A platform that competes
with Vercel and Linear has zero unreachable states and zero broken paths — every
link resolves, every button does something real, every declared state is reachable.

## Mission
Guarantee every link resolves, every button performs a real action, every declared
state is reachable, and every page is reachable from navigation.

## Map
- Gates: `npm run audit:pages` (`scripts/audit-page-index.mjs`),
  `npm run audit:handlers` and `npm run audit:empty-handlers`
  (`scripts/audit-empty-handlers.mjs`).
- Navigation surfaces: topbar `src/dashboard-next/components/topbar.js`, the site
  footer, in-page CTAs, the guided tour, and the "All pages" directory.
- Route registry: `data/pages.json` (e.g. the `/launches` entry); page bodies in
  `pages/`.

## Do this
1. Run `npm run audit:pages`, `npm run audit:handlers`, and
   `npm run audit:empty-handlers`; record every flagged page and handler.
2. Crawl the topbar (`src/dashboard-next/components/topbar.js`), footer, and in-page
   CTAs for `href`s that 404, point to `#`, or go nowhere. Fix the destination or
   remove the link with intent — never leave a dead link in place.
3. Verify every page in `data/pages.json` is linked from navigation and actually
   renders; flag any orphaned route (declared but unreachable) and wire it in.
4. Find buttons with no handler or no-op handlers (cross-reference
   `audit:empty-handlers`); give each a real action or remove the control.
5. Confirm browser back/forward and deep-links land on the correct state; fix any
   route that only works when reached via the in-app click path.
6. Confirm the guided tour and the "All pages" directory reference only real,
   live routes — no stops on missing or renamed pages.

## Must-not
- Do not paper over a broken link by suppressing the click — fix the destination or remove the link.
- Do not add a route to `data/pages.json` that has no rendering page behind it.
- Do not leave a control visible if it cannot perform its action.

## Acceptance
- [ ] `audit:pages`, `audit:handlers`, `audit:empty-handlers` all clean.
- [ ] Manual nav crawl (topbar, footer, CTAs, tour, directory) finds zero dead links or no-op buttons.
- [ ] Every `data/pages.json` route is reachable and renders; `npm test` green; changelog entry if user-visible.
