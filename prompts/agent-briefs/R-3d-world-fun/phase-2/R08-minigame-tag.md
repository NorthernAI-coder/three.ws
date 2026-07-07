# R08 — Mini-game: Tag

**Phase 2 (Social playground) · Depends on: nothing · Server-authoritative proximity**

> Read [`../R00-program-overview.md`](../R00-program-overview.md) and [`CLAUDE.md`](../../../../CLAUDE.md)
> first. The server validates every tag — never trust client-claimed proximity.

## Goal

"It"-tag in `/play`. One random player becomes "it" when ≥2 are present. Walking adjacent to
another player transfers "it" (server-validated proximity + tag-back immunity). "It" has an obvious
marker.

## Files

- `multiplayer/src/schemas.js` — add `it` (boolean) and `itSince` (number) to the player schema.
- `multiplayer/src/rooms/WalkRoom.js` — assign "it", validate tag transfers (proximity + 2s
  immunity), track per-session time-as-it.
- `src/game/coincommunities.js` — the "it" marker (red glow ring under the avatar + 🏃 over head).
- `src/game/coincommunities-ui.js` — HUD: who's it, a "you're it!" alert, lightweight leaderboard.

## Spec

1. **Schema** — `it` boolean + `itSince` on the player. One random present player becomes "it" when
   the room reaches ≥2 players; reassign sensibly if "it" disconnects.
2. **Transfer** — when "it" walks adjacent to another player, the **server** validates the proximity
   and transfers "it", applying a **2s tag-back immunity** so it can't bounce instantly. No
   tagging from across the map — proximity is checked server-side against authoritative positions.
3. **Marker** — "it" shows a red glow ring under the avatar and a 🏃 marker over the head, visible
   to everyone.
4. **HUD** — shows who is "it", a "you're it!" alert when you become it, and a lightweight
   leaderboard of per-session time-as-it.
5. **Robustness** — fun with 3+ players; no double-it; no exploit; clean handling of
   join/leave/disconnect.

## Definition of done

- "It" transfers correctly on contact with immunity; marker is obvious to everyone; no
  across-map exploit. Fun with 3+ players.
- No client-trusted proximity. No console errors/warnings, no leaks. Verified with multiple clients.
- Diff self-reviewed per the R00 / CLAUDE.md DoD.
