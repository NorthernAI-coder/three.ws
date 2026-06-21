# 21 — Avatar creator / Character Studio

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** `character-studio/`, `avatar-sdk/` (viewer + React creator), `pages/avatar-*.html`, `pages/create*.html`, animation pipeline (`public/animations/`, `src/glb-canonicalize.js`, `src/animation-retarget.js`).
**Depends on:** `10`, `12`, `13`. Pairs with `15`, `17`, `19`.

## Why this matters for $1B
The avatar is the atomic unit of the platform — every agent, every wallet, every
launch starts with one. Creating an avatar must be fast, joyful, and produce a rigged,
animated, usable model that flows into the rest of the product.

## Map
- Full creator app: `character-studio/` (fork of M3-org/CharacterStudio, MIT — keep
  attribution in `character-studio/LICENSE`). Viewer + React creator: `avatar-sdk/`
  (`@three-ws/avatar`, `<agent-3d>` web component, `/react` `/creator` subpaths).
- Pages: `avatar-edit/page/embed/studio`, `create*`, `create-selfie`, `creating`.
- Animation universality: `/CLAUDE.md` "Avatar animation is universal — no rig
  allowlist"; mappings in `src/glb-canonicalize.js` (cover new skeletons in
  `tests/glb-canonicalize.test.js`), retarget in `src/animation-retarget.js`.

## Do this
1. **Creation paths:** every entry (build from parts, from a selfie, from forge,
   upload your own GLB) works end-to-end and yields a rigged, animated avatar.
   Reconcile the many `create*` pages — remove dead/duplicate flows, keep the canonical
   ones reachable (prompt `02`).
2. **Rig universality:** any humanoid upload drives the canonical clip library (idle/
   walk, legs included) via bone-name canonicalization; new skeleton conventions get a
   mapping + test case — never a curated allowlist, never a bind-pose T-pose. Verify
   with avatars from several sources (Mixamo, Avaturn, VRM, Ready-Player-like).
3. **Editor UX:** native three.ws chrome/theme (prompt `13`); real-time preview;
   accessible controls; mobile-aware (prompt `11`). Character-studio fork wrapped so
   it feels first-party.
4. **Save & ownership:** saving creates an owned agent + custodial wallet (per the
   ownership model); editing someone else's forks correctly (fresh wallet, lineage).
   Designed empty/loading/error states (prompt `12`).
5. **Output & cross-wiring:** finished avatar flows to: agent profile, walk/tour guide,
   marketplace listing, embed (`<agent-3d>`), and launch. Wire each connection.
6. **Performance:** lazy-load the heavy creator; compress exported GLBs; smooth on
   mid-tier devices (prompt `10`).
7. **SDK quality:** `avatar-sdk` builds, documented, with working web-component +
   React examples (`examples/`); publish-ready (prompt `24`).
8. Tests: extend `tests/glb-canonicalize.test.js` for any new rig; save→own→fork
   invariants; viewer render.

## Must-not
- Do not hardcode a rig allowlist — extend `glb-canonicalize.js` + add a test case.
- Do not let any humanoid fall back to a T-pose.
- Do not copy wallet secrets on fork; do not strip the CharacterStudio MIT attribution.

## Acceptance
- [ ] Every creation path produces a rigged, animated, owned avatar; dead create-flows removed.
- [ ] Humanoids from multiple rig sources animate (legs included); new skeletons covered by tests.
- [ ] Creator feels first-party (theme/chrome), accessible, mobile-aware.
- [ ] Save creates owned agent + wallet; fork mints fresh wallet + lineage.
- [ ] Avatar flows into profile/tour/marketplace/embed/launch.
- [ ] avatar-sdk builds + documented + examples; canonicalize/ownership tests green.
