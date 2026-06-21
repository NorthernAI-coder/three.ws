# 15 · Forge (Text/Photo → 3D) — End-to-End Hardening

## Mission
Make Forge a flawless, screenshot-worthy text/photo→3D pipeline across every engine, with perfect
states, robust error recovery, and a result experience (orbit, AR, export, refine) that feels best-in-class.

## Context
- Page: `pages/forge.html`; logic: `src/forge.js` and `src/forge-*.js` (ar, dropzone, enhance,
  export, gameready, optimize, pay, prompt-studio, refine, reveal, showcase, stylize).
- Engines: NVIDIA (free, no key), Hunyuan3D (free), Fast, Meshy, Tripo, Rodin, Stability, Replicate
  (own-key). Free lane = NVIDIA NIM TRELLIS. Layout is the two-column workspace (rail + stage).
- High quality is a $THREE-holder perk (hold-to-unlock or pay-per-generation) — keep gating correct.

## Tasks
1. **Every engine works or is honestly disabled:** verify each engine's availability state (free /
   your-own-key / busy / unavailable) is accurate and reflects reality; selecting an unavailable
   engine never silently fails.
2. **All states designed:** empty (idle viewer/showcase), generating (real progress steps, not fake
   timers), success (viewer + actions), error (actionable, retry, switch-engine). Confirm no
   `setTimeout` fake progress; progress reflects real pipeline stages.
3. **Text + photo modes:** prompt coaching, Surprise/Enhance, aspect ratios; photo mode multi-view
   upload (1–4), drag-reorder, paste, size/type validation, helpful errors.
4. **Result experience:** orbit controls, AR (`forge-ar`), export/download (`forge-export`,
   `forge-gameready`, `forge-optimize`), refine/stylize. Each reachable, each works on a real GLB.
5. **Persistence:** "Your creations" durable list; community showcase loads real data (the showcase
   regressed before — verify it renders live models, not empty tiles).
6. **Gating + pay:** $THREE perk line + connect-wallet path correct; pay-per-generation via x402
   works end-to-end; never reference any non-$THREE token.
7. **Performance:** lazy-load heavy engine/export modules; dispose viewers on teardown.

## Acceptance
- Generate succeeds on the free lane (text + photo) with correct state transitions and a viewable GLB.
- Every result action (orbit/AR/export/refine) works on a real model.
- Showcase + creations render live data; gating + pay-per-gen verified.
- Clean console; responsive at 320/768/1440; E2E (prompt 07) green. Changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles (`__defProp`/`createRequire`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
