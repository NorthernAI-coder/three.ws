# 09 — Sentiment Heatmap 3D

> **Mission (one line):** A live 3D market-sentiment heatmap the agent narrates — a glowing grid/globe of tokens pulsing by momentum, with $THREE at the center and the agent calling out the movers.

## The watchable moment
On the screen canvas, a three.js field of tiles (or a globe of nodes) glows: green-hot tiles surge with positive momentum, cold blue ones fade, and the whole field breathes with the market. $THREE sits featured at the center, larger and labeled. As a token spikes, its tile flares and the agent's activity log calls it — *"$THREE momentum up 14% on rising volume"*, *"Cooling across the board, two movers heating up."* The camera drifts slowly. The emotion: the market made legible — and an agent that reads it aloud.

## Who benefits
- **Viewer:** an at-a-glance read of where attention is moving, narrated so they don't have to interpret raw data.
- **Agent owner:** their agent demonstrates real market intelligence, live and visual.
- **Platform:** showcases the intel stack (sentiment-pulse + pump-snapshot) as a beautiful, shareable surface; $THREE is the visual anchor.

## Where it lives
- **Surface:** both — `/agent-screen?agentId=…` (full 3D heatmap + narration log) and `/agents-live` card (downscaled heatmap frame)
- **Entry points (verified to exist):**
  - `pages/agent-screen.html` / `src/agent-screen.js` (`#asc-screen-canvas`, activity-log panel; Three.js already loaded for the avatar cam)
  - `src/shared/agent-screen-client.js` (`createAgentScreenClient` — frame/log)
  - `mcp-server/src/tools/sentiment-pulse.js` (`buildSentimentPulseTool` — momentum/sentiment source)
  - `mcp-server/src/tools/pump-snapshot.js` (`buildPumpSnapshotTool` — per-token price/volume/holders via Jupiter, Dexscreener, pump.fun, Helius)
  - `api/brain/chat.js` (turns the snapshot into the agent's spoken call-outs)
  - `api/agent-screen-push.js` / `api/agent-screen-stream.js` (push the rendered heatmap frame + narration to the wall)

## Data flow (source → transform → render)
1. **Source:** `buildSentimentPulseTool` for sentiment/momentum scores + `buildPumpSnapshotTool` for per-token price, volume, and holder deltas. $THREE (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is always included and featured; the rest of the field is generic, coin-agnostic snapshot plumbing supplied at runtime.
2. **Transform:** normalize each token to a momentum value in [-1, 1] and a magnitude (volume) → tile color (cold→hot ramp) + tile scale/glow intensity. Rank movers; diff against the previous poll to detect spikes.
3. **Transport:** the heatmap renders client-side in three.js; a caster (or the agent) snapshots the canvas and `POST /api/agent-screen-push` (`type:"analysis"`) so the wall shows the same field. Narration call-outs are pushed as `type:"activity"` log lines, authored by `api/brain/chat.js`.
4. **Render:** three.js grid/globe in `#asc-screen-canvas`; activity log appends each mover call-out; the `/agents-live` card paints the downscaled frame.

## Build spec
1. **Data poller** `src/sentiment-heatmap-data.js`: poll sentiment-pulse + pump-snapshot on an interval (respect their rate limits), always pin $THREE first, normalize to `{ id, label, momentum, magnitude }[]`, and diff to surface spikes. Real fetches only.
2. **3D field** `src/sentiment-heatmap-3d.js`: a three.js scene of instanced tiles (grid) or nodes (globe); map momentum→color via a perceptually-even ramp, magnitude→scale/emissive; $THREE rendered larger, centered, labeled. Slow camera drift; smooth lerp on value changes (no popping). Reuse the loader/renderer pattern from the avatar cam.
3. **Narration:** on each spike/mover, build a compact context (top gainers/losers, $THREE delta) and call `api/brain/chat.js`; push the returned line as a `type:"activity"` log entry. Throttle so the log doesn't flood.
4. **Wall frame:** snapshot the canvas at a low cadence and `agent-screen-push` it so the agent's card shows the heatmap, not a blank screen.
5. **Legend + focus:** render a color/momentum legend and a clickable $THREE focus button that re-centers the camera on it. Hover a tile → tooltip with label + momentum + volume.
6. **Mount:** "Heatmap" panel toggle in `src/agent-screen.js`, layout-persisted.

## Files to create / modify
- `src/sentiment-heatmap-data.js` — poller + normalizer + spike diff (new)
- `src/sentiment-heatmap-3d.js` — three.js grid/globe renderer + camera + legend (new)
- `src/agent-screen.js` — Heatmap panel toggle + narration hook + layout persistence (modify)
- `src/agent-screen.css` (screen stylesheet) — legend, tooltip, focus-button styles (modify)
- Optional thin proxy `api/intel/heatmap.js` if the MCP tools aren't directly callable from the browser (front them server-side; no new data, just transport). No changes to the MCP tools themselves.

## Real integrations (no mocks, ever)
- Real `sentiment-pulse` + `pump-snapshot` (Jupiter / Dexscreener / pump.fun / Helius) — never a fabricated token list.
- Real `api/brain/chat.js` for the spoken call-outs.
- Real `agent-screen-push`/`stream` transport.
- Credentials: Helius / pump.fun / brain keys in `.env` / `vercel env`. If missing, ask once then proceed.

## Every state designed
- **Loading:** dim tile lattice with a shimmer + "Reading the market…", not a spinner.
- **Empty:** snapshot returns only $THREE (or sparse data) → render $THREE alone, centered, with "Market quiet — watching $THREE." Never a black canvas.
- **Error:** data fetch fails → keep the last field rendered with a "stale — retrying" badge and a Retry control; never a silent freeze.
- **Populated:** the full glowing, drifting, narrated field — the hero state.
- **Overflow:** 1 token, hundreds of tokens (cap the field + paginate/cluster the tail), very long token labels (truncate in tooltip), mid-poll network drop (hold last frame + stale badge).

## Definition of done
- [ ] Reachable from `/agent-screen` via the Heatmap panel; frame visible on the `/agents-live` card.
- [ ] Real sentiment + snapshot calls visible in the network tab; real movers narrated.
- [ ] Hover / active / focus states on tiles, the legend, and the $THREE focus button.
- [ ] All five states implemented.
- [ ] No console errors or warnings; renders at a steady frame rate (no jank).
- [ ] Existing tests pass (`npm test`); add a unit test for the momentum→color/scale normalizer + spike diff.
- [ ] Verified live in a browser against `npm run dev` (port 3000).
- [ ] `git diff` self-reviewed; every line justified.

## Changelog
Append a holder-readable entry to `data/changelog.json` (tag `feature`): "A live 3D market-sentiment heatmap now runs on agent screens — tokens glow by momentum with $THREE at the center, and the agent calls out the movers in real time." Then `npm run build:pages`.

## Non-negotiables
- **$THREE is the only coin.** CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. $THREE is featured/anchored; the rest of the field is generic runtime snapshot plumbing — the agent never names, recommends, or promotes any other token, in the viz or the narration. Other tiles render market data only; no shilling.
- No mocks, no fake data, no `setTimeout` fake progress, no fabricated token arrays, no TODOs, no stubs.
- Stage explicit paths on commit (never `git add -A`); push to **both** remotes (`threeD`, `threews`).
