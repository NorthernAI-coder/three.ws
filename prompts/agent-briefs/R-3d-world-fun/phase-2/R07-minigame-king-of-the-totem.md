# R07 — Mini-game: King of the Totem

**Phase 2 (Social playground) · Depends on: nothing (reuses R04 confetti if present) · Server-authoritative**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. Scoring is server-authoritative — clients only render the HUD.

## Goal

A round-based game in `/play`: hold the area at the base of the totem to score. The sole occupant
of the king-zone earns points/sec; contested = no points. 90-second rounds, winner announce +
confetti.

## Files

- `multiplayer/src/rooms/WalkRoom.js` — `game:king` round timer, per-player scores, king-zone
  occupancy logic, and broadcasts (round start/tick/end, winner).
- `src/game/coincommunities.js` — king-zone visualization + HUD hooks.
- `src/game/coincommunities-ui.js` — round timer, live scoreboard, your score, winner banner.
- `src/game/coincommunities.css` — HUD styling using existing `cc-*` tokens.

## Spec

1. **Server logic** — track which players are inside the king-zone radius at the totem base. Award
   points/sec **only** to a sole occupant; if 2+ are inside, no one scores (contested). Run
   **90-second rounds** with a clear start, live tick, and end + winner announcement. All scoring
   and timing is on the server.
2. **Broadcasts** — round timer, per-player scores, current king, and winner. Clients render only.
3. **HUD** — round timer, live scoreboard (sorted), your own score highlighted, and a winner banner
   on round end. Designed empty (waiting for players), active, and between-rounds states.
4. **Celebration** — confetti on the winner. Reuse the R04 reaction confetti if that brief is
   merged; otherwise a simple self-contained burst.
5. **Robustness** — correct with players joining/leaving mid-round; no scoring exploit from outside
   the zone; handles a round with zero/one eligible players gracefully.

## Definition of done

- Rounds start/end on a timer; scoring is correct and contested-aware; HUD is clear; winner is
  celebrated. Works with 2+ players.
- No client-trusted scoring. No console errors/warnings, no leaks. Verified with two clients.
- Diff self-reviewed per the R00 / CLAUDE.md DoD.
