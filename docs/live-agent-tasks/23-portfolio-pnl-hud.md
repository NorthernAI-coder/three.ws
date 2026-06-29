# 23 — Portfolio / PnL HUD (the live scoreboard)

> **Mission (one line):** A real-time PnL HUD overlays both surfaces — the agent's holdings valued live, net worth and 24h change ticking, a sparkline breathing — so every watcher can see the score, not just the action.

## The watchable moment
A clean glass HUD floats over the screen canvas: net worth in SOL and USD, a green or red 24h delta that ticks as prices move, and a thin sparkline that redraws with each snapshot. Below it, the top holdings stack as compact rows — $THREE pinned and featured at the top, other holdings shown as neutral on-chain data. On the `/agents-live` wall, the same data condenses to a single PnL badge in the corner of each card: `+12.4%` glowing green. You can watch an agent trade AND watch its book react in the same frame. It turns watching into spectating a scoreboard.

## Who benefits
- **Viewer:** Sees whether the agent is actually winning — real stakes, real numbers, live.
- **Agent owner:** Their agent's performance is on display; a strong book is a flex and a reputation signal.
- **Platform:** Links the live surfaces to the real on-chain valuation layer and the pump intel engine, and features $THREE prominently across every screen.

## Where it lives
- **Surface:** both — HUD overlay on `/agent-screen` stage; compact PnL badge on each `/agents-live` card.
- **Entry points (verified to exist):**
  - `src/agent-screen.js` — stage + floating panel system (the HUD is a new panel)
  - `pages/agent-screen.html` — stage container, panel chrome, design tokens
  - `src/agents-live.js` — `buildCard` (badge insertion), card lifecycle
  - `pages/agents-live.html` — card markup + styles
  - `api/agents/balances.js` — batched real on-chain wallet valuation + 24h P&L + sparkline (`wallet_value_snapshots`)
  - `api/agents/portfolio.js` — owner-only deep snapshot + `…/portfolio/stream` SSE (cost basis, per-holding P&L)
  - `api/pump/intel.js` — per-mint classification + signals for holding context
  - `mcp-server/src/tools/pump-snapshot.js` — live price/volume/holders for an arbitrary mint
  - `api/pump/check-three-balance.js` + `api/_lib/three-gate.js` — $THREE balance read

## Data flow (source → transform → render)
1. **Source:** Public valuation for any agent's wallet via `POST /api/agents/balances` (batched, 60s-cached, real Helius DAS → public RPC, Jupiter/pump.fun pricing). For the owner viewing their own agent, the richer owner-gated `GET /api/agents/:id/portfolio` + `…/portfolio/stream` SSE adds cost basis and per-source P&L. Per-holding price/context for non-balance mints comes from `api/pump/intel.js` (read-only) and the `pump_snapshot` MCP tool plumbing.
2. **Transform:** Normalize to a `PnlSnapshot`: `{ netWorthSol, netWorthUsd, change24hPct, change24hUsd, holdings: [{ mint, symbol, valueSol, valueUsd, pct, isThree }], sparkline: number[] }`. $THREE (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is detected and pinned first with a featured marker; all other holdings render as neutral on-chain rows — no promotion, no recommendation.
3. **Transport:** `/agent-screen` HUD: poll `balances` on a 30s cadence, OR (owner) subscribe to `…/portfolio/stream` SSE for push updates. `/agents-live` badges: a single batched `POST /api/agents/balances` with all visible card ids (the endpoint exists precisely to avoid an N×3 request storm).
4. **Render:** HUD panel on the stage (net worth, 24h delta, sparkline, holdings rows); compact `+N%` badge in each wall card corner, color-coded, with a tooltip showing net worth.

## Build spec
1. **`src/shared/pnl-snapshot.js` (new):** A pure normalizer `toPnlSnapshot(raw)` mapping the `balances`/`portfolio` response shapes into the `PnlSnapshot` above, with `isThree` detection against the $THREE CA and a `formatPnl` helper (SOL/USD, signed %, color tone). No fetching here — pure, unit-testable.
2. **`src/shared/pnl-fetch.js` (new):** `fetchBatchBalances(agentIds)` → one `POST /api/agents/balances`; `subscribePortfolio(agentId, onSnapshot)` → owner SSE to `…/portfolio/stream` with the reconnect pattern from `agent-screen-client.js`. Both return normalized `PnlSnapshot`s. Errors surface to callers (handled at the UI boundary), never swallowed into fake zeros.
3. **`src/agent-screen.js` — HUD panel:** Add a floating, draggable/minimizable HUD panel (reuse the existing panel framework). Header: net worth SOL + USD. Sub: 24h delta with up/down arrow + color. Body: sparkline canvas (redraw on each snapshot from `snapshot.sparkline`, empty → flat baseline with "no history yet"). Holdings list: $THREE row pinned + featured chip, then top holdings by value. Wire to `pnl-fetch` (owner → SSE; otherwise 30s poll). Persist panel position/visibility like the other panels.
4. **Sparkline render:** Small canvas drawn from real `wallet_value_snapshots`-derived series. 0 points → flat line + "Tracking starts now"; 1 point → single dot + value; many → smoothed polyline with min/max ticks. `will-change: transform` only where animating.
5. **`src/agents-live.js` — PnL badge:** In `buildCard`, add `<div class="al-card-pnl" data-pnl hidden></div>` in the screen corner. After the roster page mounts, call `fetchBatchBalances([...visible ids])` once and hydrate each badge with `change24hPct` (color-coded) + a `title` of net worth. Refresh on a slow cadence (e.g. 60s) for in-view cards only (pairs with task 21's IntersectionObserver). Hide the badge when balances are null (no wallet / no data).
6. **`$THREE` featuring:** In the HUD holdings list, when the agent holds $THREE, pin it first with a featured chip and a link to `/coin/FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump` (verify the live coin route before linking; fall back to no link if absent). Other holdings: neutral rows, on-chain data only, never a buy/recommend affordance.
7. **`pages/agent-screen.html` + `pages/agents-live.html` — styles:** HUD glass panel, delta colors (use existing success/danger tokens), sparkline canvas sizing, and the compact `.al-card-pnl` badge (positive/negative variants, hover lift, accessible contrast). Reduced-motion: no badge pulse.

## Files to create / modify
- `src/shared/pnl-snapshot.js` — new: pure normalizer + formatters (unit-tested).
- `src/shared/pnl-fetch.js` — new: batched balances fetch + owner portfolio SSE.
- `src/agent-screen.js` — floating PnL HUD panel wired to live data.
- `src/agents-live.js` — compact PnL badge per card, batched hydration.
- `pages/agent-screen.html` — HUD styles.
- `pages/agents-live.html` — PnL badge styles.

## Real integrations (no mocks, ever)
- `api/agents/balances.js` — real batched on-chain valuation (Helius DAS → RPC, Jupiter/pump.fun pricing, real `wallet_value_snapshots` sparkline).
- `api/agents/portfolio.js` + `…/portfolio/stream` — owner-only real cost basis + push snapshots.
- `api/pump/intel.js` + `mcp-server/src/tools/pump-snapshot.js` — real per-mint price/context.
- `api/pump/check-three-balance.js` / `api/_lib/three-gate.js` — real $THREE balance.
- Credentials: `HELIUS_API_KEY`, Jupiter/pump.fun (public), session/JWT for owner portfolio. Locate in `.env` / `vercel env`. Missing snapshot history → empty sparkline (designed empty state), never a synthesized curve.

## Every state designed
- **Loading:** HUD shows skeleton number bars + a muted flat sparkline; badge shows a dim `· · ·` while batched balances resolve.
- **Empty:** Agent with no wallet / no holdings → HUD: "No on-chain holdings yet" + how the wallet gets funded; badge hidden.
- **Error:** Balances fetch fails → HUD shows "Couldn't value holdings — retry" with a working retry button; badge hidden, not zeroed. SSE drop (owner) → reconnect + "reconnecting" tick.
- **Populated:** Net worth + live 24h delta + sparkline + ranked holdings ($THREE featured) — the hero state.
- **Overflow:** 0 holdings (empty), 1 holding (no ranking noise), 1000 cards (batched single request, in-view only), very long token symbols truncated, a holding worth $0.0001 still shown truthfully, mid-update price feed gap → last good value held with a staleness dot.

## Definition of done
- [ ] Reachable on both surfaces via real navigation.
- [ ] Real `balances`/`portfolio` calls in the network tab; numbers match on-chain reality.
- [ ] $THREE pinned + featured; no other token promoted or made buyable.
- [ ] Hover/active/focus on HUD panel controls, holding rows, and the wall badge.
- [ ] All five states implemented.
- [ ] No console errors/warnings; SSE + timers cleaned up on unmount/`visibilitychange`.
- [ ] Existing tests pass (`npm test`); add unit tests for `toPnlSnapshot` ($THREE pinning, % math) and sparkline edge cases (0/1/N points).
- [ ] Verified live in a browser against `npm run dev` (port 3000) with a real funded agent wallet.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `feature`) — e.g. "Live agent screens and the wall now show a real-time portfolio HUD: net worth, 24h PnL, and a sparkline, with $THREE featured." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. $THREE is featured/pinned; every other holding is neutral runtime on-chain data only — never hardcoded, marketed, recommended, or made buyable. The HUD is a scoreboard, not a shill.
- No mocks, no fake data, no synthesized sparkline, no `setTimeout` fake progress, no TODOs, no stubs.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
