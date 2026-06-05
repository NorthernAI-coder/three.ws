# R00 — 3D World "Make It Fun" — program overview & shared architecture (READ FIRST)

> Every agent picking up an `Rxx` brief in this folder MUST read this file first. It is the
> shared context the individual briefs assume. Do not re-decide the stack, the coin rules, or
> the networking pattern — they are settled here. Each `Rxx` brief is a **self-contained agent
> prompt**: paste it into a fresh agent chat and it will have everything it needs alongside
> this overview.

---

## North Star

Turn the existing `/play` 3D worlds from a pretty hangout into a place with things to **do**
together — Roblox-style social play + mini-games + avatar economy, plus a Minecraft-style
shared sandbox. Source roadmap: [`docs/roadmap/3d-world-fun.md`](../../roadmap/3d-world-fun.md).
These briefs are that roadmap, expanded into individual, ready-to-dispatch prompts.

The quality bar from [`CLAUDE.md`](../../../CLAUDE.md) is the law here. Every brief inherits it:

- **No mocks. No fake data. No placeholders.** Real APIs, real endpoints, real on-chain calls.
- **No TODOs, no stubs, no `throw new Error("not implemented")`, no `setTimeout` fake-loading.**
- **Every state is designed** — loading (skeletons over spinners), empty (tells the user what to
  do), error (actionable), populated, overflow.
- **Every interactive element** has hover, active, and focus states; keyboard + touch reachable.
- **The only coin is `$THREE`** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name,
  hardcode, or surface any other token in code, tests, fixtures, copy, or commits. Generic
  coin-agnostic plumbing that takes a runtime mint is the only exception, and even there nothing
  is hardcoded.
- **Done means done.** Walk the Definition of Done in `CLAUDE.md` for every brief before claiming
  completion. If you cannot verify a step, say so explicitly — do not claim done.

A task is **100% complete** only when it is written, wired into the UI, reachable by the user via
navigation, exercised in a real browser with no console errors/warnings, real network calls
succeeding, all states designed, existing tests still passing, and the diff self-reviewed.

---

## Existing assets you MUST mine before writing anything

Do not make agents re-discover these. Read them, match their patterns, extend them.

| System | Files |
|--------|-------|
| `/play` scene | `src/game/coincommunities.js`, `src/game/coincommunities-ui.js`, `src/game/coincommunities.css` |
| `/play` net client | `src/game/community-net.js` |
| Authoritative server | `multiplayer/src/rooms/WalkRoom.js`, `multiplayer/src/schemas.js` |
| Avatars / animation | `src/animation-manager.js`, `public/animations/manifest.json` (70 clips) |
| Accessory GLBs (unwired) | `public/accessories/` (`hat-*`, `glasses-*`, `earrings-*`, `presets.json`) |
| Payments | `api/x402/`, `agent-payments-sdk/`, `solana-agent-sdk/` |

**Reuse-first is a hard rule.** We extend three.js + Colyseus + the WalkRoom and the existing
`/play` client. We do not switch engines and we do not build a second world client. Several
sibling programs share this foundation — see memories `play-game-features-port`,
`w08-world-life-npcs`, and the [`W-world-online`](../W-world-online/) briefs. If a system in
`world.three.ws` (our already-built world framework) does it better, port from there.

---

## The networking pattern every gameplay feature follows (off-schema economy)

This is how `/play` already does fishing/inventory/XP, and how EVERY new server-authoritative
mechanic in this program must be built. Do not invent a second pattern.

- **Synced world state** (player positions, shared objects, who's present) lives in the Colyseus
  `WalkState` schema (`multiplayer/src/schemas.js`) and auto-replicates to all clients.
- **Private/per-player state** (inventory, owned cosmetics, scores, game round data) lives in
  per-client server memory and is pushed to the owning client via targeted messages — not the
  replicated schema — unless all clients genuinely need to see it.
- **Intents flow client→server as messages** (`sendChat`/`sendEmote` style on `community-net.js`).
  The **server is authoritative**: it validates, rate-limits, clamps to world bounds, applies the
  effect, and broadcasts the result. Clients never trust each other.
- **Every new message handler** mirrors the existing chat/emote limiter: per-client rate limit,
  payload validation, world-radius clamps, sane caps. Anti-cheat is not optional.

---

## Phase map & dependency graph

The roadmap's "waves" are these four phases. Within a phase, only parallelize briefs that do not
edit the same file — several touch `WalkRoom.js` / `coincommunities-ui.js`, so stagger those or
have one agent own the shared file for the phase.

| Phase | Theme | Briefs | Run style |
|-------|-------|--------|-----------|
| **1 — Foundation** | Generic shared-object sync + cosmetics rig | R01 → R02 → R03 | Sequential. Unblocks everything. |
| **2 — Social playground** | Reactions, ball, dance floor, mini-games, emote wheel | R04–R09 | Parallel after Phase 1. |
| **3 — Sandbox building** | Persistent Minecraft-style building | R17 → R18 → R19 → R20 | Mostly sequential. |
| **4 — Avatar economy** | Cosmetics shop, x402 purchases, inventory, gating, splits | R21 → R22 → {R23, R24, R25} | R21→R22 sequential, then fan out. |

Brief numbers match the roadmap task numbers exactly (the gaps — no R10–R16 — mirror the
roadmap's own numbering) so anything here traces straight back to `docs/roadmap/3d-world-fun.md`.

```
Phase 1:  R01 ──► R02 ──► R03
            │       │        │
Phase 2:    └──┬────┴─► R05 (ball)        R04 R06 R07 R08 R09  (R04/06/07/08/09 need only R01/R02)
               │
Phase 3:    R01 ──► R17 ──► R18 ──► R19 ──► R20   (R18 also needs R02)
Phase 4:    R03 ──► R21 ──► R22 ──► R23
                              │
                              ├──► R25
            (Solana rails) ──► R24
```

## Suggested dispatch order

1. **Phase 1** (R01→R02→R03) — sequential, ~3 chats.
2. **Phase 2** (R04–R09) — parallel, 6 chats. Fastest visible fun.
3. **Phase 3** (R17→R18→R19→R20) — building, 4 chats.
4. **Phase 4** (R21→R22→{R23,R24,R25}) — economy, 5 chats.

Total: 18 briefs. Read this file, then your brief, then the files your brief names — in that order.
