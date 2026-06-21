# 21 · Social Surfaces — Club, City, IRL, Multiplayer

## Mission
Make the shared 3D social spaces (club, city, IRL/AR, arena, multiplayer) reliable, performant, and
fun — real avatars, real presence, graceful degradation when a feature/asset is unavailable.

## Context
- Surfaces: `src/club.js`, `src/club-entrance.js`, `src/club-crowd.js`, `src/city.js`, `src/irl.js`,
  the agent arena (3D trading floor), `multiplayer/` (Colyseus). Excluded from the corner companion.
- Heavy 3D + networking; built assets via `npm run build:club-assets`, `build:walk-environments`.

## Tasks
1. **Entry + presence:** entering a space loads the user's avatar (no T-pose), shows others present,
   and handles join/leave cleanly. Connection loss degrades gracefully (reconnect, status, no freeze).
2. **Performance/memory:** crowd rendering is bounded + LOD'd; dispose on exit (no WebGL/socket
   leaks); cap pixel ratio on mobile; steady frame rate with N avatars.
3. **Movement/interaction:** WASD/touch movement, camera, interactions consistent with the walk
   platformer; dancers/NPCs animate via shared library with default-rig fallback.
4. **Arena:** agents render as avatars with live, on-chain-verifiable P&L tags + trade reactions; every
   number traces to a real on-chain trade. No fabricated data.
5. **Multiplayer server:** Colyseus rooms stable; reconnection; rate-limited; no crash on malformed
   messages; document deploy/runbook.
6. **States:** loading/empty/error designed for each space; AR permission prompts handled.

## Acceptance
- Join/move/leave works with real avatars + presence; graceful reconnect on network loss.
- Stable frame rate with a crowd; zero leaks on exit; arena numbers verifiable on-chain.
- Multiplayer server resilient to bad input; clean console; responsive; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs; arena/social data must be real + on-chain-verifiable. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
