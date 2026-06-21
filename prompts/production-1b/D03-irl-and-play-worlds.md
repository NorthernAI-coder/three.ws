# D03 — IRL (AR placement) + Play (coin worlds, multiplayer) production pass

> Phase D · Depends on: D01 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
IRL (place 3D agents in your real environment via AR) and Play (a deterministic 3D world
per coin where holders gather, chat, and trade) are the differentiated, shareable
experiences that make three.ws more than a tool. They're also the hardest to make
reliable. Get them to a stable, joinable, no-crash baseline.

## Where this lives (real files)
- `src/irl.js` — AR passthrough, joystick, tap-to-place, location-aware nearby agents; `api/cron/irl-reap.js` (expiry).
- `src/game/boot-avatar.js`, `src/game/coincommunities.js`, `src/game/ambient-crowd.js` — coin worlds.
- `multiplayer/` (`@three-ws/multiplayer`) — position sync, presence; `api/cron/world-health.js`.

## Current state & gaps
- IRL: GPS/compass permission denial handling, placed-agent persistence (local vs server), privacy mode (nearby-only visibility), compass-less device fallback.
- Play: world-generation determinism (seed), multiplayer position-sync reliability, chat delivery under low bandwidth, in-world trade latency, mobile frame rate, exit/save state.

## Build this
1. **IRL permissions + fallback:** graceful handling when GPS/compass denied or absent (heading from GPS, or a manual-orient fallback); placed agents persist with a documented strategy; privacy mode keeps placements nearby-only.
2. **Play determinism:** same seed → same world, verified; reserve a clear loading state while the world boots.
3. **Multiplayer stability:** reliable presence + position sync with interpolation; reconnect on drop; cap concurrent entities for frame rate; `world-health.js` reports degradation.
4. **In-world economy:** chat delivery with a queue indicator on slow links; trades route through the real path with clear pending/success/fail; $THREE-only promotion rules respected (coin worlds render records, not endorsements).
5. **Exit/save:** state persists or is explicitly ephemeral (told to the user); no silent data loss.
6. **Mobile perf:** target ≥30fps on mid-range mobile; reduce draw calls; `prefers-reduced-motion`.

## Out of scope
- The avatar pipeline (**D01**); deep netcode rewrites beyond reliable sync + reconnect.

## Definition of done
- [ ] IRL handles denied/absent sensors with a usable fallback; placements persist per the documented strategy; privacy honored.
- [ ] Play worlds are deterministic; multiplayer syncs reliably with reconnect; degradation reported.
- [ ] In-world chat + trades work with clear states; exit/save behavior is explicit; ≥30fps on mid mobile.
- [ ] `npx vitest run` green; changelog entry; committed + pushed to both remotes.

## Verify
- Enter a coin world twice with the same seed → identical; join from two devices → see each other; deny compass in IRL → fallback; throttle network → chat queue + reconnect.
