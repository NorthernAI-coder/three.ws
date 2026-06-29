# 10 — Copy-Trade Mirror, Live

> **Mission (one line):** Watch an agent shadow a target wallet in real time — the source buys, the agent re-quotes and replicates through the firewall, and both trades land side by side with latency and fill on screen.

## The watchable moment
On the screen canvas, two columns: **Source** and **Mirror**. A trade hits the source wallet — a row flashes in on the left (*"Target bought 0.4 SOL of $THREE"*). Milliseconds later the agent re-quotes and a matching row flashes in on the right, sized by the configured rule, stamped with **latency 380ms** and the actual **fill** it got — guarded, capped, real. The activity log narrates the relay. The emotion: speed and discipline. You are watching an autonomous trader keep pace with a human, inside hard limits it cannot break.

## Who benefits
- **Viewer:** a live, legible demonstration of copy-trading — source vs. mirror, latency vs. fill, transparently.
- **Agent owner:** their agent mirrors a chosen wallet with sizing rules and spend guards they control.
- **Platform:** ties the strategies engine, the live trade stream, and the trade firewall into one watchable loop; proves real execution under guardrails.

## Where it lives
- **Surface:** both — `/agent-screen?agentId=…` (side-by-side source/mirror + latency/fill + log) and `/agents-live` card (the dual-column frame)
- **Entry points (verified to exist):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (`#asc-screen-canvas`, activity-log panel)
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient` — frame/log)
  - `packages/strategies/src/index.js` (`copy()` client over `/api/copy/*`; `COPY_SIZING` = fixed / multiplier / pct_balance)
  - `api/pump/trades-stream.js` (SSE; `?mint=…` per-mint buy/sell via PumpPortal — detects the source trade)
  - `api/agents/agent-trade.js` (`POST /api/agents/:id/trade` — server-signed replication from the agent's own custodial wallet; `/quote` for re-quote)
  - `api/_lib/agent-trade-guards.js` (`enforceSpendLimit`, `getDailySpendLamports`, `validateSolanaAddress`, `SpendLimitError` — the hard caps, price-impact break, idempotency)
  - `api/agent-screen-push.js` / `api/agent-screen-stream.js` (push the dual-column frame + relay log to the wall)

## Data flow (source → transform → render)
1. **Source:** subscribe to the target wallet's activity. Trade detection rides `api/pump/trades-stream.js` (per-mint SSE) for the mints the target touches; the copy engine (`packages/strategies` `copy()` over `/api/copy/*`) defines the target wallet + sizing rule.
2. **Transform:** when a source buy/sell is detected, re-quote via `GET/POST /api/agents/:id/trade/quote` (expected out, price impact, fees, guard preview), size it per the rule (fixed / multiplier / pct_balance), and timestamp `detected→quoted→submitted` to compute latency.
3. **Transport:** execute through `POST /api/agents/:id/trade` (server-signed, firewall-enforced by `agent-trade-guards.js`). On fill, push a dual-column frame via `api/agent-screen-push` (`type:"trade"`) and a relay narration line (`type:"activity"`). Viewers read `api/agent-screen-stream`.
4. **Render:** Source column (target's trade) and Mirror column (the agent's replicated trade) with latency + actual fill + explorer tx link; the `/agents-live` card paints the dual-column frame.

## Build spec
1. **Mirror panel** `src/agent-screen-mirror.js`: render two columns (Source / Mirror), a header with the target wallet (truncated, copyable) and the active sizing rule, and a relay strip showing the most recent latency + fill.
2. **Source detection:** open `api/pump/trades-stream.js` for the relevant mint(s) and filter to the target wallet's trades. On a hit, immediately append the Source row and kick off the re-quote.
3. **Re-quote + size:** call `/api/agents/:id/trade/quote`, apply the configured `COPY_SIZING` rule, and show the previewed impact/guard status before submit. If a guard would block (over cap, impact too high), render a **blocked** row with the reason — never a silent skip.
4. **Replicate:** `POST /api/agents/:id/trade` with CSRF/bearer as the endpoint expects; on success append the Mirror row with `latency = submitted - detected`, the real fill amount, and the explorer URL. `SpendLimitError`/guard rejections render as actionable blocked rows.
5. **Live wiring:** subscribe via `createAgentScreenClient` so the columns/log update from the stream; fire a `toast` on each completed mirror.
6. **Wall frame:** render the dual-column view to a canvas and `agent-screen-push` it so the agent's card shows the live mirror.
7. **Controls (owner):** target wallet + sizing rule + the spend caps (`daily_usd`, `per_tx_usd`) shown read-only to viewers, editable to the owner through the existing trade-limits endpoints. Mount as a layout-persisted "Mirror" panel in `src/agent-screen.js`.

## Files to create / modify
- `src/agent-screen-mirror.js` — dual-column renderer, source detection, re-quote, replicate, latency/fill (new)
- `src/agent-screen.js` — Mirror panel toggle + owner controls + layout persistence (modify)
- `src/agent-screen.css` (screen stylesheet) — two-column, latency badge, blocked-row, toast styles (modify)
- No API changes: `packages/strategies`, `api/pump/trades-stream.js`, `api/agents/agent-trade.js`, `api/_lib/agent-trade-guards.js`, `api/agent-screen-push.js`/`stream.js` already exist.

## Real integrations (no mocks, ever)
- Real `api/pump/trades-stream.js` (PumpPortal) for source-trade detection.
- Real `api/agents/agent-trade.js` server-signed execution from the agent's custodial wallet, enforced by the real `agent-trade-guards.js` firewall (caps, price-impact break, idempotency).
- Real `packages/strategies` copy engine + real explorer tx URLs.
- Credentials: Solana RPC, PumpPortal/pump.fun, agent custody keys — in `.env` / `vercel env`. If missing, ask once then proceed.

## Every state designed
- **Loading:** two skeleton columns + "Watching the target wallet…" while the source stream connects.
- **Empty:** no source trade yet → "No trades from the target yet — the mirror is armed and waiting." with the active rule shown.
- **Error:** stream drop → reconnect overlay; trade rejected by a guard → a **blocked** row with the reason (over daily cap / impact too high) and how to adjust — never a silent fail.
- **Populated:** paired source/mirror rows with latency + fill — the hero state.
- **Overflow:** rapid-fire source trades (queue + render in order, bound the list), 0/1/1000 rows (scroll/virtualize the tail), very long wallet labels (truncate + copy), mid-relay network drop (mark the in-flight row, resume on reconnect).

## Definition of done
- [ ] Reachable from `/agent-screen` via the Mirror panel; dual-column frame visible on the `/agents-live` card.
- [ ] Real `trades-stream` + real `agent-trade` calls visible in the network tab; real fills + explorer links.
- [ ] Hover / active / focus states on the wallet copy, rule selector, and rows.
- [ ] All five states implemented (blocked-by-guard row included).
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); add a unit test for sizing math + latency computation + blocked-row mapping.
- [ ] Verified live in a browser against `npm run dev` (port 3000).
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag `feature`): "Watch an agent mirror a target wallet live — the source trade and the agent's guarded replica land side by side with latency and fill shown, every order inside hard spend caps." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. The mirror is generic, coin-agnostic plumbing that takes the source trade's mint at runtime — never hardcode, market, or recommend a non-$THREE mint anywhere in source or copy. $THREE remains the only coin the platform promotes.
- No mocks, no fake data, no `setTimeout` fake progress, no simulated fills, no TODOs, no stubs. Real trades, real guards.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
