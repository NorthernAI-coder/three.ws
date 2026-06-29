# 01 — Live Trading Desk

> **Mission (one line):** An agent runs a real pump.fun trading loop on camera — every scored launch, buy, and exit narrated live, PnL ticking, and its 3D avatar cheering on a win or slumping on a loss.

## The watchable moment
A viewer opens `/agent-screen?agentId=…` and watches money move in real time. The activity log streams "scored MINT 0.82 → buying 0.05 SOL", then "filled @ 0.0000031, +12% unrealized", and a PnL ticker in the header climbs in green. The instant a position closes in profit, the 3D avatar head fires a `celebrate` gesture; on a stop-loss it `slump`s into a `sad` clip. It is the tension of a live poker stream — you can't look away because real SOL is on the line and the avatar reacts like a person would.

## Who benefits
- **Viewer:** sees a transparent, narrated autonomous trader — provably real trades, real PnL, real risk, with a face that reacts.
- **Agent owner:** their agent becomes a watchable performance; good runs build reputation and draw watchers to the agent profile and its $THREE-denominated economy.
- **Platform:** turns the existing sniper/trade infrastructure into spectator content, linking `/agents-live`, the agent profile, and the trade ledger into one loop.

## Where it lives
- **Surface:** both — a card on `/agents-live` and the hero panel on `/agent-screen?agentId=…`
- **Entry points (verified to exist):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (live screen + Avatar Cam + Activity Log)
  - `pages/agents-live.html` / `src/agents-live.js` (wall card + activity-terminal fallback)
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient` SSE client)
  - `workers/agent-sniper/index.js`, `workers/agent-sniper/executor.js` (`executeBuy`, `executeSell`)
  - `workers/agent-sniper/screen-push.js` (`screenPush` fire-and-forget pusher — already wired)
  - `src/animation-manager.js` (`AnimationManager.playOnce(name, { settleTo })`)

## Data flow (source → transform → render)
1. **Source:** the live trade loop — `workers/agent-sniper/executor.js` (`executeBuy` / `executeSell`) and the discretionary `POST /api/agents/:id/trade` (`api/agents/agent-trade.js`). Scoring comes from `workers/agent-sniper/scorer.js`; trending context from `GET /api/pump/trending`.
2. **Transform:** each lifecycle event is shaped into a narration line + a typed PnL delta `{ phase: 'scored'|'buy'|'hold'|'exit', mint, scoreOrPrice, solDelta, unrealizedUsd, realizedUsd }`. Every spend is gated FIRST by `api/_lib/agent-trade-guards.js` (`reserveSpendUsd` / per-tx + daily ceilings + `frozen` kill switch) — no money moves before the reservation succeeds.
3. **Transport:** the loop calls `screenPush()` → `POST /api/agent-screen-push` with `{ frame: { activity, type: 'trade' }, agentId }`. Viewers receive it over SSE from `GET /api/agent-screen-stream` via `createAgentScreenClient`. A new typed event `pnl` is carried in the frame payload's `activity`/`type` so no schema break is needed.
4. **Render:** activity-log entry (typed `trade`), a header PnL ticker computed from the running realized+unrealized sum, and an avatar emote — `playOnce('celebrate', { settleTo: 'idle' })` on a green exit, `playOnce('sad', { settleTo: 'idle' })` on a red exit, `playOnce('wave')` on session start.

## Build spec
1. In `workers/agent-sniper/executor.js`, at the four real lifecycle points — score computed, buy reserved+filled, position marked, exit filled — call `screenPush({ activity, type: 'trade' })` with a plain-language line. Reuse the existing `log()` call sites; do not invent new trade actions. Guard every buy behind `agent-trade-guards` exactly as the executor already does — narration is additive only.
2. Extend `workers/agent-sniper/screen-push.js` to accept an optional `pnl` object on the frame and forward it in the POST body's `frame` (the push endpoint already passes `frame` through to Redis verbatim; `activity` carries the human line, a compact `[+12.4%]` suffix carries the number).
3. In `src/agent-screen.js`, parse `type === 'trade'` frames: append to the Activity Log with a green/red class by sign, and maintain a `pnlTotalUsd` accumulator rendered in a new header ticker `#asc-pnl` (added in `pages/agent-screen.html`). Animate the number with a transform-based count-up (no `setTimeout` fake progress — drive it from real frames).
4. Wire avatar reactions: in the same frame handler, when an exit frame's PnL delta is positive call `webcamAnimManager.playOnce('celebrate', { settleTo: 'idle' })`; negative → `playOnce('sad', { settleTo: 'idle' })`. Gate on `webcamAnimManager.supportsCanonicalClips()` so rigs that can't be skeleton-driven simply skip the emote (never T-pose).
5. In `src/agents-live.js`, give `type: 'trade'` lines a colored dot/row in the card's activity terminal and surface the latest PnL in `.al-card-action`, so the wall reads as a row of live trading desks.
6. Add a header tooltip on `#asc-pnl` explaining "session realized + unrealized, from real fills" and a keyboard shortcut (`P`) to toggle a compact vs. detailed PnL breakdown.

## Files to create / modify
- `workers/agent-sniper/executor.js` — emit narrated `screenPush` lines at score/buy/hold/exit (modify).
- `workers/agent-sniper/screen-push.js` — forward optional PnL payload on the frame (modify).
- `src/agent-screen.js` — trade-frame parsing, PnL ticker, avatar emote on exit (modify).
- `pages/agent-screen.html` — `#asc-pnl` header ticker element + tooltip markup (modify).
- `src/agents-live.js` — colored trade rows + latest-PnL in card action line (modify).
- `tests/agent-screen-pnl.test.js` — unit test for the pure PnL accumulator + sign→emote mapping (create).

## Real integrations (no mocks, ever)
- pump.fun trade execution via `PumpTradeClient` (`api/_lib/pump.js`), `api/agents/agent-trade.js`, and the sniper executor — real on-chain buys/sells from the agent's custodial wallet.
- Solana RPC for fills/confirmation; `GET /api/pump/trending` (Birdeye → pump.fun fallback) for context.
- Spend governance: `api/_lib/agent-trade-guards.js` (`reserveSpendUsd`, per-tx/daily caps, `frozen`). Hard caps are enforced server-side and surfaced in the log when a buy is skipped for cap.
- Transport: `api/agent-screen-push.js` + `api/agent-screen-stream.js` (Upstash Redis, 90s frame TTL).
- Credentials: `AGENT_JWT`, `AGENT_ID`, `PUSH_URL` for the worker; spend limits live on the agent row. Locate in `.env` / `vercel env`; if missing, ask once then proceed.

## Every state designed
- **Loading:** Activity Log shows a skeleton of shimmering rows; PnL ticker shows `—` until the first fill.
- **Empty:** before the first trade, the panel reads "Desk armed. Watching launches — first scored coin appears here." with the spend-cap badge visible so the viewer knows the limits.
- **Error:** a skipped buy (cap hit, frozen wallet, RPC failure) renders an amber actionable line ("daily cap reached — resets in 4h") instead of a silent gap; SSE drop shows the existing reconnect badge.
- **Populated:** the hero state — streaming trade lines, climbing/falling PnL, avatar emoting.
- **Overflow:** 0 trades (empty state), 1 trade (single row + ticker), 1000+ trades (log trimmed to the 50-entry cap from `agent-screen-push.js`, ticker still accurate from the running total); very long mint/name truncated with ellipsis + title; mid-session network drop falls back to the activity terminal on the wall.

## Definition of done
- [ ] Reachable from `/agents-live` and `/agent-screen` via real navigation.
- [ ] Real trade fills visible in the network/RPC path; PnL computed from real fills.
- [ ] Hover / active / focus states on the PnL ticker, tooltip, and card rows.
- [ ] All five states implemented.
- [ ] No console errors or warnings from this code.
- [ ] `npm test` passes; `tests/agent-screen-pnl.test.js` added for the pure accumulator + emote mapping.
- [ ] Verified live in a browser against `npm run dev` (port 3000), with a sniper running in `SNIPER_MODE=simulate` to exercise the full real-quote path without broadcasting, then confirmed once against a live fill.
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag: `feature`) — e.g. "Live Trading Desk: watch an agent trade pump.fun in real time with a PnL ticker and an avatar that celebrates wins." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. The trade loop consumes runtime mints supplied by the live pump.fun feed (generic plumbing) — never hardcode, market, or recommend any non-$THREE mint in code, copy, or narration.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. The PnL count-up is driven by real frames only.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
