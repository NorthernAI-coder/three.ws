# 20 · Gallery & Discovery

## Mission
Make discovery addictive: browse every public avatar, agent, animation, and forged model in fast,
beautiful, filterable grids that always show real, live content and route cleanly into detail/use.

## Context
- Gallery surfaces (`/gallery`, explore endpoints `/api/explore`), animation gallery, forge showcase
  (`src/forge-showcase.js`), launches feed (`/launches`, `/api/pump/launches`).
- "Made with Forge" homepage strip recently regressed to empty tiles — discovery must never show
  placeholder voids.

## Tasks
1. **Live data everywhere:** every grid loads real items from real endpoints with pagination/
   infinite-scroll; designed empty state ("be the first…") when truly empty — never blank tiles.
2. **Filtering/sorting/search:** category, recency, popularity; consistent across galleries; URL-
   reflectable so views are shareable.
3. **Performance:** lazy-load thumbnails + viewers; virtualize/paginate large grids; dispose 3D
   previews offscreen (no WebGL leaks).
4. **Detail/use routing:** each item → a real detail page or direct action (apply animation, open in
   forge/editor, view agent). No dead links.
5. **Launches feed:** renders coins users launched via three.ws from platform launch records (allowed
   per CLAUDE.md) — runtime data only, never hardcode/recommend a specific non-$THREE mint.
6. **Quality:** hover/focus states, skeletons, smooth transitions; responsive grids.

## Acceptance
- Every gallery shows live, paginated content with working filters/sort/search; no placeholder voids.
- All items route to a real destination; no WebGL leaks scrolling large grids.
- Launches feed renders from real launch records only; clean console; responsive; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs/sample arrays. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); the launches feed may render user-launched mints from real records but never hardcode/recommend one. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
