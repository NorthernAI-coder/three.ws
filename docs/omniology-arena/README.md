# Omniology Arena — Build Plan

A dedicated, premium 3D multiplayer venue inside three.ws for **Omniology**
(omniology.ai) — an external collaborator running AI-agent contests every ~88 seconds
with USDC-on-Solana prizes. Players and agents walk into the Arena, watch live
contests on in-world screens, and submit entries from inside the 3D world.

This venue is the **best-of** `/play` (open-world multiplayer) and `/club`
(authored named-venue) — rebuilt clean as its own surface, not bolted onto either.

---

## How to use this folder

Each `NN-*.md` file is a **self-contained build prompt** meant to be run in its
own fresh chat, in order. Every prompt:

- names the exact repo files to read first,
- states what it produces and what it consumes from earlier prompts,
- ends with hard acceptance criteria.

Run them in sequence: **01 → 02 → 03 → 04 → 05 → 06**. Prompt 05 (the Omniology
MCP server) and the Omniology-side API can proceed in parallel once the contract
in `CONTRACTS.md` is agreed.

Before running any prompt, the agent in that chat must read:
- `docs/omniology-arena/README.md` (this file)
- `docs/omniology-arena/CONTRACTS.md` (shared interfaces)
- the repo root `CLAUDE.md` (operating rules — non-negotiable)

---

## Architecture decisions (already made — do not relitigate)

1. **Dedicated route, isolated surface.** The Arena is its own page + bootstrap
   module at route `/arena/omniology` (confirm no collision with any existing
   `pages/arena.html` / `pages/play/arena.html` first; namespace under
   `/arena/omniology` so a third party's space never entangles the core worlds).

2. **Reuse the `walk_world` Colyseus room via a namespaced token — NO server
   changes.** The multiplayer server (`multiplayer/src/index.js`) defines
   `walk_world` with `filterBy(['coin','tier'])`. The client joins with a stable
   synthetic token (e.g. `coin.mint = 'arena:omniology'`, `tier: ''`). Colyseus
   isolates that into its own room instances automatically. Presence, movement,
   remote avatars, name labels, voice, and cosmetics all come for free. **We do
   not define a new room or redeploy the multiplayer server.** Rationale: lowest
   operational risk, nothing new to maintain server-side.

3. **Contest state never touches our game server.** The live contest feed and
   entry submission live entirely in Omniology's service. Screens *poll*
   Omniology's feed; the entry desk *submits* via our existing universal x402
   payer (`/api/x402-pay` → external flow). The Colyseus room only carries player
   presence. This keeps Omniology's uptime decoupled from our world.

4. **The building is the only core-side asset we author.** A premium venue GLB
   with named anchors (modeled on `/club`'s `club-venue.js` contract), plus its
   environment/lighting. Everything else reuses existing systems as libraries.

5. **No mocks, ever (CLAUDE.md).** Screens and the desk wire to Omniology's
   *real* endpoints. Where Omniology's API is not yet live, we ship real,
   designed loading/empty/error states (not sample data). The moment the real
   base URL + contract land, it's live with no code rewrite — only config.

6. **$THREE is the only coin.** USDC is fine as a payment asset (it is not a
   coin we promote). Never render, name, or hardcode any other token anywhere in
   this venue. Read the canonical USDC mint from the repo's x402 spec — never
   paste a mint from memory.

---

## Surface map (what gets built, by prompt)

| Prompt | Deliverable | Depends on |
|---|---|---|
| **01** | Route + page + bootstrap skeleton; multiplayer presence in a namespaced `walk_world`; local player movement/camera; empty lit space you can walk around with others | — |
| **02** | Premium Arena venue GLB + named-anchor module (build script + loader + anchor resolution); environment, lighting, spawn, collision/bounds | 01 |
| **03** | Generalized live in-world screens (current contest, ~88s countdown, leaderboard, recent entries) fed by Omniology's contest feed via an adapter; mounted on venue screen anchors | 02 + CONTRACTS |
| **04** | In-world entry desk interactable → `/api/x402-pay` external flow → live SSE settlement UI → receipt; pushes the new entry to the screens from 03 | 03 + CONTRACTS |
| **05** | `@three-ws/omniology-mcp` server (`list_contests`, `get_contest`, `get_leaderboard`, `submit_entry`), x402-priced, `server.json`, modeled on `packages/*-mcp` | CONTRACTS |
| **06** | Polish pass: all states designed, responsive, a11y, performance (instancing/LOD), tests, changelog entry, real-browser end-to-end verification | 01–05 |

---

## The one hard external dependency

For screens (03) and submission (04) to be **100% working with no mocks**,
Omniology must expose the endpoints in `CONTRACTS.md`. The questions we need
answered to lock that contract are in `QUESTIONS-FOR-OMNIOLOGY.md` — send those
first. Until the feed URL exists, 03/04 are built against the documented
contract behind a thin adapter, and verified against their real endpoint as soon
as it's live.

---

## Status

These files are **uncommitted working docs**. They are not pushed to either
mirror. Commit them only if/when the project is greenlit.
