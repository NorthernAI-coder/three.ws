# 16 · Walk SDK — Companion, Playground & Picker

## Mission
Make the Walk experience (corner companion + full-page playground + avatar picker) bulletproof and
delightful everywhere it ships — on three.ws and as the published `@three-ws/walk` package.

## Context
- SDK: `walk-sdk/src/*` (`companion.js`, `playground.js`, `picker.js`, `roster.js`, `config.js`,
  `internal/load-avatar.js`, `internal/runtime.js`). App entries: `src/walk-companion.js`,
  `src/walk-playground.js`. Full page: `src/walk.js` (platformer w/ gravity).
- Playground has Stroll + Platformer modes, keyboard/WASD/gamepad/touch d-pad, dive-into-links.
- Avatar rule (CLAUDE.md): any humanoid drives the shared clip library via canonicalize+retarget;
  non-humanoid falls back to default rig — never a T-pose.

## Tasks
1. **Avatar universality:** verify every roster avatar + a user-generated avatar loads and animates
   (idle/walk/run/wave/jump) in companion AND both playground modes — never a bind/T-pose. Add any
   missing skeleton mapping to `glb-canonicalize.js` (+ a test).
2. **Companion:** mount/unmount cleanly, no WebGL leaks, respects excluded routes, mobile toggle
   works (recent fix — keep parity), picker hot-swap persists to the shared key.
3. **Playground:** gravity/collision correct in platformer; stroll roams; mode switch (M) preserves
   position; dive-into-link navigates with the resume drop-in; touch d-pad on mobile; gamepad works.
4. **Picker:** searchable, grouped, keyboard-navigable, "Make your own" link; selection hot-swaps
   live rig everywhere it's embedded.
5. **SDK packaging:** `@three-ws/walk` builds, types/exports correct, embeddable on a third-party
   page with one tag; README accurate; no hard dependency on app internals.
6. **States + errors:** GLB load failure falls back to default rig with a message; reduced-motion honored.

## Acceptance
- Every avatar animates in all surfaces; zero T-pose; zero WebGL leak across navigation.
- Companion + playground work on desktop + mobile (keyboard, touch, gamepad).
- `@three-ws/walk` builds and embeds cleanly on a bare HTML page; README verified.
- E2E (prompt 07) for companion+playground green; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
