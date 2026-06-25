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
   entry submission live entirely in Omniology's service. Screens *poll* their
   feed (through our read-through proxy); the entry desk *submits* via a dedicated
   server endpoint that runs Omniology's 3-step entry handshake (their submit flow
   is **not** x402 — see CONTRACTS §0/§1.3 — so `/api/x402-pay` is not used; we
   reuse only its safe primitives). The Colyseus room only carries player
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
| **04** | In-world entry desk + server endpoint running Omniology's 3-step entry handshake (sign-and-broadcast with the player's agent key, **C7 inspect-before-sign**), live SSE stepper + receipt; pushes the entry to the screens from 03 | 03 + CONTRACTS + SECURITY |
| **05** | Register Omniology's **existing** MCP (`{base}/mcp`) in `.mcp.json`; optional thin safety-wrapper package only if non-world agents need our guardrails. (Their MCP already exists — we do not rebuild it.) | CONTRACTS |
| **06** | Polish pass: all states designed, responsive, a11y, performance (instancing/LOD), tests, changelog entry, real-browser end-to-end verification | 01–05 |

---

## External dependency — mostly resolved

Omniology already publishes a real API and MCP server (engine base
`https://omniology-engine.fly.dev`, MCP at `{base}/mcp`), so `CONTRACTS.md` is
written against their **actual** endpoints — screens (03) and the desk (04) can be
built against real data, not guesses. Re-verify field names against a live
response before building. `QUESTIONS-FOR-OMNIOLOGY.md` is now down to a few open
items (team identity, sandbox env, leaderboard REST-vs-MCP, who enforces geo).

## Diligence + go/no-go gates (see SECURITY.md)

Diligence found Omniology to be a real, on-chain-transparent skill-contest
platform (88s contests; 0.02 USDC entry; winner ~70% of pot; 30% house rake; real
USDC on Solana; no proprietary token; public `/audit` + `/winners`). It is
deliberately structured around the gambling question (AI-judged on a rubric, not
chance) and geo-blocks AZ/IA/MD/VT/WA. No scam signals found; team is unnamed.

Two **business gates** must clear before placement (neither is engineering):
1. **Legal:** our counsel blesses hosting a paid-entry skill contest, and tells us
   who owns the geo/eligibility duty for our users.
2. **Identity:** real names behind the operators (basic KYC).

The **technical** risk is contained by SECURITY.md (C7 inspect-before-sign, C1
per-entry cap, C3 bounded responses, C4 sanitized content, C5 server-side proxy,
C6 no partner code in our origin). With those, a fully compromised Omniology can
only break its own contests — it cannot move funds, OOM us, inject content, or run
code in our origin.

---

## Status

These files are **uncommitted working docs**. They are not pushed to either
mirror. Commit them only if/when the project is greenlit.
