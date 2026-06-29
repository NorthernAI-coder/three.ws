# 16 — Market-Maker Floor Defense

> **Mission (one line):** An agent stands on the fair-launch floor of a $THREE-class coin and physically buys the dip in front of you — every defensive fill rendered as an arena strike, the floor drawn as a glowing line nobody is allowed to break.

## The watchable moment
On `/agents-live` and inside the arena (`src/play/arena-world.js`), the agent's avatar stands over a coin whose price is drawn as a horizontal **floor line** glowing across the stage. A sell pressure wave drops the price toward the line — and the instant it touches, the agent lunges into a `buy` emote, a stream of coins flies up, and the line holds. Profit gets recycled with a calmer two-sided sweep; graduation triggers a `bigWin` celebration and an LP-deposit burst. Each move is narrated ("Floor touched at 0.0000142 SOL — defended with 0.4 SOL"). The emotion is **tension**: you watch a line you don't want broken, and a thing that won't let it break.

## Who benefits
- **Viewer:** sees an abstract concept — "market making" — as a literal, legible fight for a price floor, with real on-chain stakes.
- **Agent owner:** their MM policy becomes a live demo of discipline (bounded, non-manipulative, never washes) — the best possible advertisement for the strategy.
- **Platform:** links the `agent-mm` worker to the arena and the live wall, turning a backend loop into a spectator product and a reason to launch on three.ws.

## Where it lives
- **Surface:** `/agents-live` card | arena embed via `src/play/arena-world.js` | both
- **Entry points (verify these exist before editing):**
  - `pages/agents-live.html` / `src/agents-live.js`
  - `src/play/arena-world.js` (has `spawnAgent`, `emote('buy')`, `emote('bigWin')`, `_spawnCoin`, `_fx` tick loop, floor/label projection)
  - `workers/agent-mm/index.js` (sweep loop, `runSweep`, `heartbeat` → `bot_heartbeat`)
  - `workers/agent-mm/engine.js` (`runPolicy` → seed → defend → recycle → rebalance)
  - `workers/agent-mm/graduation.js` (`provideLp`, distribute, hold)
  - `api/agents/agent-trade.js` (`executeAgentTrade` — the only fund path)

## Data flow (source → transform → render)
1. **Source:** `workers/agent-mm/engine.js` `runPolicy()` already computes, per sweep, the live market (`quoteMarket`), the policy floor price, inventory, and the chosen action (`seed|defend|recycle|rebalance|graduate`). Every fill goes through `executeAgentTrade` in `api/agents/agent-trade.js`. Persist each decision as a structured `agent_actions` row (`action_type` ∈ `mm_defend|mm_recycle|mm_rebalance|mm_seed|mm_graduate|mm_quote`, `summary`, `context` JSON: `{ mint, floorSol, priceSol, sizeSol, sideBuy, simulate, signature }`).
2. **Transform:** in `index.js` after `runPolicy` returns its outcome tag, write the row + publish a compact MM event to the screen-push transport (`api/agent-screen-push.js`) keyed by the policy's agent. Normalize price/floor to the same SOL units the arena uses for the line.
3. **Transport:** SSE via `api/agent-screen-stream.js` (re-uses the `agent_actions` poll already in that file) for the activity log; the structured `context` rides in the same row so the arena can read it.
4. **Render:** `arena-world.js` reads MM events for the spawned agent and (a) draws/updates the **floor line** mesh at `floorSol`, (b) animates the **price marker** toward `priceSol`, (c) on a `mm_defend` fill calls `agent.emote('buy')` + `_spawnCoin` upward, on `mm_recycle` a softer two-sided sweep, on `mm_graduate` `emote('bigWin')` + an LP burst. The narration line goes to the activity log panel.

## Build spec
1. **`workers/agent-mm/engine.js`** — `runPolicy` already decides the action; extend its return to include `{ tag, action, floorSol, priceSol, sizeSol, sideBuy, signature, simulate }` (it already has all of these locally). Do not change any decision/guard logic — read-only enrichment of the return value.
2. **`workers/agent-mm/index.js`** — in `runSweep`, after each `runPolicy`, insert one `agent_actions` row mapping the action to an `action_type` above, with a holder-readable `summary` ("Defended floor: bought 0.40 SOL at 0.0000142") and the structured `context`. Reuse the existing `sql` import. Then POST the same payload to `api/agent-screen-push.js` for that agent so live screens update without waiting on the DB poll.
3. **`src/play/arena-world.js`** — add `setFloor(agentId, { floorSol, priceSol })` that lazily creates a thin emissive plane (the floor line) + a small price marker sprite, and lerps the marker toward `priceSol` in the `_fx` tick loop. Add `onMmEvent(agentId, ev)` that routes `mm_defend→emote('buy')+_spawnCoin`, `mm_recycle→` a paired up/down coin pair, `mm_graduate→emote('bigWin')` + an LP-deposit particle burst (reuse `_spawnCoin` styling with `PALETTE`). Flash the floor line on a successful defend.
4. **`src/agents-live.js`** — for cards backed by an MM policy, subscribe to that agent's `agent-screen-stream`, parse MM `context`, and drive the arena instance via `setFloor` / `onMmEvent`. Show the floor price + last-defense badge on the card chrome.
5. **`workers/agent-mm/index.js` (simulate banner)** — when `cfg.mode==='simulate'` or `policy.mode==='simulate'`, tag events `simulate:true`; arena renders a "SIM" badge on the floor line so viewers never mistake a dry-run for a real fill.
6. **Tests** — add a pure unit test for the action→`action_type`/summary mapping and the floor/price normalization (`tests/agent-mm-render.test.js`). No worker process or chain needed.

## Files to create / modify
- `workers/agent-mm/engine.js` — enrich `runPolicy` return with render fields (no logic change).
- `workers/agent-mm/index.js` — persist `agent_actions` rows + push live MM events per sweep.
- `src/play/arena-world.js` — `setFloor`, `onMmEvent`, floor-line + price-marker meshes, defend/recycle/graduate FX.
- `src/agents-live.js` — subscribe MM streams, drive the arena, card badges.
- `tests/agent-mm-render.test.js` — pure mapping/normalization tests.

## Real integrations (no mocks, ever)
- `workers/agent-mm` live quotes (`quoteMarket`, on-chain curve/AMM state) and real fills through `executeAgentTrade` — the SAME firewall + spend-guard + custody path a manual trade uses. The render layer adds **no** new fund path.
- Solana RPC + pump curve/AMM (already used by `market.js` / `graduation.js`).
- Credentials: MM worker env (`MM_MODE`, `MM_NETWORK`, RPC) in `.env` / worker secrets. If missing, ask once then proceed in `simulate`.

## Every state designed
- **Loading:** floor line renders as a dim skeleton track until the first quote arrives; card shows a shimmer, not a spinner.
- **Empty:** no active MM policy → card reads "No floor under defense yet — launch a $THREE-class coin with a market-maker policy to see it here," linking to the launcher.
- **Error:** quote/RPC failure → floor line goes amber with "Re-quoting…"; a failed fill surfaces the real reason from `executeAgentTrade` in the log, never a silent drop. Stream reconnect is automatic.
- **Populated:** the hero — glowing floor line, price marker dancing above it, defend strikes on touch, narrated fills.
- **Overflow:** 0 coins (empty state), 1 coin (single floor), 1000 sweeps/min (debounce marker lerp + cap FX spawns per frame), very long coin names (truncate label), mid-defense RPC drop (amber + retry next sweep, line holds last known price).

## Definition of done
- [ ] Reachable from `/agents-live` and the arena via real navigation.
- [ ] Real API calls visible in the network tab (`agent-screen-stream`, push), real fills from the live worker.
- [ ] Hover / active / focus states on the card badge and any floor-line controls.
- [ ] All five states above implemented.
- [ ] No console errors or warnings from this code.
- [ ] Existing tests pass (`npm test`); `tests/agent-mm-render.test.js` added and green.
- [ ] Verified live in a browser against `npm run dev` (port 3000) with an MM policy in `simulate` mode.
- [ ] `git diff` self-reviewed; every line justified; no change to MM decision/guard logic.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tags: `feature`, `improvement`), e.g. "Watch the market-maker defend a coin's floor live in the arena — every dip-buy rendered as it happens." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name another. The MM worker is generic plumbing that takes a runtime `mint` from each policy — render whatever the policy supplies, but never hardcode, market, or recommend a non-$THREE mint in source, copy, or labels.
- No mocks, no fake data, no `setTimeout` fake progress, no TODOs, no stubs. Real gated trades only; the render layer never signs or moves funds.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
