# 25 — Worlds & Coin Clash (token-gated 3D)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

"Every coin is a 3D world you can drop into" and "hold a coin, enlist, and fight
live armies" is the social loop that makes a token sticky beyond price — it turns
holders into citizens and a chart into a place. If a world dead-ends on a void, a
presence sync drops players, or the enlist gate lets a non-holder in (or locks a
real holder out), the network effect collapses. Reliable, every-state, token-gated
multiplayer is what makes three.ws a destination instead of a tool.

## Mission

Make every coin enterable as a live 3D world and make Coin Clash — token-gated
community warfare (hold the coin → enlist → rally battle power live) — correct,
multiplayer-reliable, beautifully stated in every phase, and $THREE-compliant for
anything the platform itself promotes.

## Map (trust but verify — files move)

- **Worlds lobby (front door)** — [pages/worlds.html](../../pages/worlds.html),
  [src/worlds-lobby.js](../../src/worlds-lobby.js) (pick/drop-in an avatar, list live
  coin-worlds, enter at `/walk?coin=<mint>`).
- **Worlds data + gating** — [api/community/worlds.js](../../api/community/worlds.js)
  (`GET /api/community/worlds`), [api/community/world-gate.js](../../api/community/world-gate.js)
  (per-coin holder threshold; creator-only POST), [api/community/ws-ticket.js](../../api/community/ws-ticket.js)
  (short-lived realtime ticket), [api/world/[action].js](../../api/world/[action].js)
  (per-world persistence: `load`/`save`).
- **Coin Clash UI** — [pages/clash.html](../../pages/clash.html), [src/clash.js](../../src/clash.js)
  (bracket → battle cards → enlist challenge → rally dock).
- **Coin Clash API + store** — [api/clash/[action].js](../../api/clash/[action].js)
  (`state`, `enlist`, `enlist-verify`, `rally`, `leaderboard`), backed by
  [api/_lib/clash.js](../../api/_lib/clash.js), [api/_lib/clash-store.js](../../api/_lib/clash-store.js),
  [api/_lib/crews-store.js](../../api/_lib/crews-store.js).
- **Realtime multiplayer** — [multiplayer/](../../multiplayer) (authoritative Colyseus server):
  [multiplayer/src/rooms/WalkRoom.js](../../multiplayer/src/rooms/WalkRoom.js),
  [multiplayer/src/rooms/ClashRoom.js](../../multiplayer/src/rooms/ClashRoom.js),
  presence in [multiplayer/src/presence-token.js](../../multiplayer/src/presence-token.js).
- **Hyperfy world host** — [deploy/world/](../../deploy/world) + [scripts/world-health.mjs](../../scripts/world-health.mjs).
- **Verify/smoke** — [scripts/verify-worlds-lobby.mjs](../../scripts/verify-worlds-lobby.mjs)
  (offline/unconfigured state), [scripts/verify-worlds-live.mjs](../../scripts/verify-worlds-live.mjs)
  (configured live worlds), [scripts/world-health.mjs](../../scripts/world-health.mjs)
  (asset-integrity check). Tests: [tests/clash-match.test.js](../../tests/clash-match.test.js),
  [tests/world-store.test.js](../../tests/world-store.test.js).

## Do this

1. **Exercise the worlds lobby** (`npm run dev`, `/worlds`): pick/drop-in an avatar with no
   sign-in, browse live coin-worlds, and enter one. Confirm both states work — configured
   (real grid via `GET /api/community/worlds`) and unconfigured (graceful "offline" layer
   where worlds are still enterable, the documented 503 degradation). Run
   `node scripts/verify-worlds-lobby.mjs` (and `verify-worlds-live.mjs` against a configured
   dev server): zero console errors beyond the one tolerated 503.
2. **Drop into a world end-to-end:** enter `/walk?coin=<mint>`, confirm the world loads (no
   void), the avatar spawns, persistence round-trips via `api/world/[action]` (`save`→`load`),
   and `scripts/world-health.mjs` reports every blueprint asset present (the 2026-06-12 void
   regression must not recur).
3. **Token-gate correctly:** verify `api/community/world-gate.js` — a coin creator can set a
   holder threshold, GET states the requirement publicly, and entry re-verifies the on-chain
   holding server-side. A real holder gets in; a non-holder hits a designed, actionable gate
   screen (tells them what to hold and how). Fail closed when creator/holding is unknown.
4. **Coin Clash full loop** (`/clash`): poll `state` → render the bracket → enlist (wallet
   challenge → `enlist-verify` confirms a live on-chain holding of the faction coin) → rally
   dock opens, taps batch and flush to `rally` as battle power. Confirm holdings are gated
   on-chain (no client trust) and the leaderboard reflects real effort.
5. **Design every state** across both surfaces: loading (skeleton, not a fake bar), empty
   (no live worlds / no active battles → what to do next), error (network/upstream failure →
   actionable recovery), and overflow (many worlds, long coin names, big armies). No blank
   voids, no dead buttons.
6. **Multiplayer reliability:** in the Colyseus rooms (`WalkRoom`, `ClashRoom`), verify
   presence join/leave, reconnect after a dropped socket, and ticket auth via
   `api/community/ws-ticket.js` + `presence-token.js`. A player who disconnects must not
   linger as a ghost; a reconnect must restore identity. Boot the server with
   `npm run dev:multi` (or `dev:walk-all`) and test two browser tabs.
7. **Run the suites:** `npx vitest run tests/clash-match.test.js tests/world-store.test.js`
   and the multiplayer package's own tests. Add coverage for any uncovered failure mode
   (gate-denied, upstream 503, presence drop/reconnect, matchmaking bye).
8. **$THREE compliance + changelog:** any coin the platform *promotes* must be `$THREE`
   (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); the worlds grid and faction roster are
   runtime launch-record feeds (allowed) — never hardcode/market a non-$THREE mint. Add a
   `data/changelog.json` entry for any user-visible change, then `npm run build:pages`.

## Must-not

- Do not let a non-holder past a token gate, or lock out a verified holder — gate on-chain, fail closed.
- Do not ship a world that can drop players into a void; assets must be verified present.
- Do not hardcode, market, or recommend any mint other than `$THREE` (runtime launch feeds are fine).
- Do not fake presence/multiplayer with timers or client-trusted state — use the authoritative rooms.
- Do not leave any state undesigned (no blank voids, no dead buttons, no never-resolving spinners).
- Do not weaken a verify/smoke/health check to make a run pass.

## Acceptance (all true before claiming done)

- [ ] `/worlds` works in both configured and unconfigured states; `verify-worlds-lobby.mjs`
      (and `verify-worlds-live.mjs` configured) pass with no unexpected console errors.
- [ ] Dropping into `/walk?coin=<mint>` loads a real world (no void), spawns the avatar, and
      persists via `api/world/[action]`; `scripts/world-health.mjs` reports all assets present.
- [ ] Token gating verified on-chain: holders enter, non-holders see a designed actionable gate.
- [ ] Coin Clash loop works end-to-end (state → enlist → enlist-verify → rally), holdings gated on-chain.
- [ ] Loading/empty/error/overflow states designed across both surfaces; presence join/leave/reconnect reliable.
- [ ] `tests/clash-match.test.js`, `tests/world-store.test.js`, and multiplayer tests pass; new failure modes covered.
- [ ] No promoted coin other than `$THREE`; changelog updated and `npm run build:pages` is clean.
