# 23 — Worlds, Coin Clash & multiplayer

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Surface completeness
**Owns:** Worlds (every coin a 3D world), Coin Clash (token-gated warfare), `multiplayer/`, presence/realtime layers.
**Depends on:** Phase 0–1, 14 (mobile), 24 (token gating).  ·  **Parallel-safe with:** 18–22.

## Why this matters for $1B
Worlds and Coin Clash are the retention and virality engines — social, live, "drop in
and hang out." Multiplayer that desyncs, lags, or gates incorrectly kills the magic.
Done right, these are the daily-return habit a $1B platform needs.

## Mission
Make the realtime social surfaces stable, synchronized, correctly token-gated, and
performant on mobile.

## Do this
1. **Worlds:** each coin renders as a real, navigable 3D world; entering/leaving is
   smooth; presence (who's here) is accurate. Verify the `multiplayer/` server
   (Colyseus) handles join/leave, reconnect, and state sync without drift.
2. **Coin Clash:** token-gated enlistment is enforced server-side (hold a coin → enlist
   → battle); the live battle state is synchronized across clients with no desync.
3. **Realtime resilience:** reconnect with backoff on disconnect; handle 0 players, many
   players, and a player dropping mid-action; cap room sizes.
4. **Performance:** 3D worlds run acceptably on mid-tier mobile (ties prompt 12/14);
   degrade gracefully on weak hardware.
5. Designed states for empty worlds, loading, connection-lost, and full rooms.
6. Anti-abuse on realtime endpoints (ties prompt 08): no message floods, no spoofed
   gating.

## Must-not
- No client-trusted token gating; no unbounded rooms; no silent desync.

## Acceptance
- [ ] Join/battle/leave synchronized across clients; reconnect verified; gating server-enforced.
- [ ] Mobile performance acceptable; all realtime states designed.
- [ ] `npm test` green; changelog `feature`/`improvement` entry.
