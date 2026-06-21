# 20 — Scene Studio

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** `src/scene-studio/` (`→ /scene`), its vendored three.js editor, GLB import/export, materials/lights.
**Depends on:** `10`, `12`. Pairs with `15`, `21`.

## Why this matters for $1B
Scene Studio turns three.ws from "make one avatar" into "compose worlds" — a creation
surface that increases time-in-product, output value, and shareability. A polished
3D editor is a credibility signal for a 3D platform.

## Map
- `src/scene-studio/` — vendored `mrdoob/three.js` r184 editor (MIT, see
  `src/scene-studio/vendor/README.md`). Route `/scene`. Import GLBs, compose scenes,
  edit materials/lights, export.

## Do this
1. **Round-trip integrity:** import a GLB → edit → export → re-import yields the same
   scene. Verify across several real GLBs (forged models, avatars, club props).
   Materials, transforms, lights, and hierarchy survive the round-trip.
2. **Editor UX polish:** the vendored editor is upstream — wrap it in three.ws
   chrome (nav, theme, design tokens per prompt `13`) so it feels native, not a
   bolted-on tool. Consistent controls and shortcuts.
3. **Save/load:** scenes persist to the user's account (real backend), with a gallery
   of saved scenes, autosave/draft recovery, and designed empty/loading/error states
   (prompt `12`). No data loss on refresh/crash.
4. **Performance:** lazy-load the editor bundle (it's heavy — prompt `10`); handle
   large scenes without locking the main thread; cap/compress on export.
5. **Cross-wiring:** import avatars/agents and forged models directly; export to the
   viewer, to an agent profile background, or to a shareable scene page. Add the
   connections (`/CLAUDE.md` cross-pollination).
6. **Share/embed:** a saved scene gets a shareable URL + OG image + embeddable viewer.
7. **Mobile:** at minimum, scenes are *viewable* and shareable on mobile even if full
   editing is desktop-first; communicate that clearly rather than breaking (prompt
   `11`).
8. **Licensing/attribution:** preserve the vendored three.js editor MIT attribution
   (`vendor/LICENSE`, `vendor/README.md`).
9. Tests for import/export round-trip and save/load.

## Must-not
- Do not lose user work on refresh/crash — autosave.
- Do not ship the editor without lazy-loading (it's large).
- Do not strip vendored license/attribution.

## Acceptance
- [ ] GLB import→edit→export→re-import round-trips faithfully on real models.
- [ ] Editor wrapped in native three.ws chrome/theme; consistent controls.
- [ ] Save/load to account with gallery, autosave, and designed states.
- [ ] Editor bundle lazy-loaded; large scenes don't lock the UI.
- [ ] Import from forge/avatars + export to viewer/profile/share wired.
- [ ] Shareable/embeddable scene pages; attribution preserved; round-trip tests green.
