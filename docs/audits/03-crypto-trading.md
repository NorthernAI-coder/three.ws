# Audit 03 — Trading & Market Intelligence

Scope: `/oracle`, `/activity`, `/leaderboard`, `/trending`, `/trades`, `/claim-wallet`, `/smart-money`, `/radar`, `/coin-intel`, `/watchlist`, `/pump-dashboard`, `/pump-live`, `/pumpfun`, `/pump-visualizer`, `/constellation`, `/strategy-lab`

Auditor: crypto-trading group. Date: 2026-06-18.

Severity calibration note: many of these pages consume live pump.fun SSE/WS feeds. Missing reconnect-backoff caps and unbounded caches are **robustness/quality** issues (P1/P2), not broken-page or hard-rule violations (P0). True P0 is reserved for broken pages, dead primary CTAs, and the coin-rule. **No coin-rule violations were found on any page in this group** — the only hardcoded mint anywhere is `$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) at pump-dashboard.html:1748, used only as a default chart selection. All other coins are runtime-fetched from `/api/*` or the live feed.

---

## /oracle — pages/oracle.html (+ src/oracle.js)
Verdict: Solid live page. Real feed/stream/leaderboard wiring, designed states. Accessibility gaps on tables/coin buttons.

- [P1] src/oracle.js coin `<button>` (~:459/487) has only `data-mint`, no `aria-label` — screen readers announce nothing. Add `aria-label="View {symbol}"`.
- [P1] oracle.html activity/feed table headers (~:337–338, 376–377) lack `scope="col"`. Add `scope` for WCAG.
- [P1] src/oracle.js 3D-graph (~:342) and wallet-leaderboard (~:578) fetch failures render an error div with no retry control — only fix is a full page refresh. Add a retry button like the feed view has.
- [P2] oracle.html mint-search input (~:548) `min-width:230px` can overflow below ~280px viewports. Allow it to shrink.
- [P2] src/oracle.js feed empty state (~:365) collapses both "warming up" and "filter too strict" into one ambiguous message. Distinguish them.
- [P3] Coin cards open an inline drawer but never link out to `/coin-intel` / `/coin3d`. Add a "full profile" link for deeper discovery.
- Endpoints (real): `/api/oracle/feed`, `/api/oracle/stream` (SSE), `/api/oracle/categories`, `/api/oracle/wallet`, `/api/oracle/leaderboard`, `/api/oracle/activity`, `/api/oracle/search`. Coin rule: clean.

## /activity — pages/activity.html
Verdict: Well-built feed with all three states designed. Minor a11y + stale-data ambiguity.

- [P1] Fetch error (~:353–354, 381–388) has no retry affordance; on a non-reset error the previous data silently remains, so users can't tell stale from loading. Add retry + a stale indicator.
- [P1] Outcome edge bar (CSS ~:125) conveys win/loss/open by color only — no text/ARIA equivalent. Add `aria-label` on the row.
- [P2] Load-more button is hidden while loading (~:375), which reads as "end of list." Show a loading affordance instead.
- Endpoints (real): `/api/oracle/activity`, `/api/oracle/action-stream` (SSE). Cross-wiring good: agent→`/agents/{id}`, coin→`/oracle?mint=`, copy→`/trader/{id}`. Coin rule: clean.

## /leaderboard — pages/leaderboard.html (+ src/leaderboard.js)
Verdict: Two real leaderboards (sniper + oracle), full states, good tablist ARIA. Stale-refresh and row-label gaps.

- [P1] src/leaderboard.js refresh failure (~:155–158) keeps the last good board but never signals staleness; error state only shows on first load. Add a stale/"reconnecting" badge.
- [P1] `.lb-row` and `.lb-oracle-row` lack `aria-label` — screen readers can't identify which trader a row is. Add labels.
- [P1] Oracle leaderboard agent rows (~:307) link only to `/trader/{id}` copy panel, not to the agent's full `/agents/{id}` profile. Add the profile link.
- Endpoints (real): `/api/sniper/leaderboard`, `/api/oracle/leaderboard`. Routes `/play/arena`, `/create-agent`, `/oracle` all exist. Coin rule: clean.

## /trending — pages/trending.html
Verdict: Real ranked feed across windows, designed states. Thin error recovery and link a11y.

- [P1] Fetch error (~:384–388) clears both lists with no explicit retry button on the rows; user must reload. The `#agentRetry`/`#coinRetry` controls exist but are minimal — make them prominent.
- [P1] `.tr-row` anchors (~:140–151) have no `aria-label`; link text doesn't convey rank/name/metric. Add labels.
- [P2] `agent_url`/`coin_url` (~:309, 339) are used unvalidated from the API; a null/malformed value yields a dead link. Guard for null.
- Endpoint (real): `/api/trending?window=&limit=`. Coin rule: clean.

## /trades — pages/trades.html (+ src/trades.js)
Verdict: Clean live trade feed, all states designed, good ARIA (`role="feed"`, `aria-busy`). Production-ready.

- [P2] Time-window segment uses `role="tablist"`/`role="tab"` but keyboard (Enter/Space/arrow) handling lives in src/trades.js and was not confirmed wired. Verify arrow-key tab navigation.
- Endpoint (real): `/api/trades/feed`. Cross-wiring: coin→`/oracle?mint=`, trader→`/trader/{id}` (both routes exist). Coin rule: clean.

## /claim-wallet — pages/claim-wallet.html (+ src/claim-wallet.js)
Verdict: Real wallet-preview page with auth gate and good states. The actual "claim" is deferred to `/login`, which is outside this file — flag to verify the round-trip completes.

- [P1] The page only does GETs: `/api/auth/me` (:17) and `/api/traders/preview?wallet=` (:89). The claim itself is a redirect to `/login?next=/claim-wallet?wallet=` (:183) — there is no claim POST in this codepath. Verify `/login` actually publishes the claim and returns to a claimed state (the `cw-cta-claimed` branch at ~:187 implies it does, but the POST is unseen here).
- States loading/empty("wallet not yet indexed")/error all present and actionable. Routes `/leaderboard`, `/trader/{wallet}` exist. Coin rule: clean.

## /smart-money — pages/smart-money.html (+ src/radar.js shared helpers)
Verdict: Real smart-money feed + wallet leaderboard with drawer, Oracle enrichment. Semantic-table and silent-refresh gaps.

- [P1] Refresh/poll failure silently keeps prior coins with no error indicator — looks live but is stale. Surface a recoverable error/stale state.
- [P2] Wallet leaderboard is a `<div>` grid (`.lhead`/`.lrow`, ~:209–212), not a semantic `<table>` and has no `role="grid"`/headers — screen readers can't parse the columns. Convert to `<table>` or add grid roles.
- [P2] Leaderboard grid at the 620px breakpoint still shows 4 numeric columns; ≤400px squeezes. Add a single-column layout below ~400px.
- Endpoints (real): `/api/pump/smart-money`, `/api/oracle/coin?mint=` (enrichment). Drawer links to `/trader/{wallet}`, `/oracle?mint=`. Coin rule: clean.

## /radar — pages/radar.html (thin shell → src/radar.js)
Verdict: Best-in-group state handling. Thin 92-line shell mounts a real, fully-wired module. No P0/P1.

- 4 distinct states (skeleton, empty "radar is clear", error w/ retry, no-match w/ reset). Polls `/api/pump/coin-intel` every 12s; pauses on tab-hidden. Drawer has Escape + focus trap.
- [P3] `_oracleCache` Map (shared radar.js, ~:1484) grows unbounded across a long session. Add a TTL/cap. (Shared with pump-visualizer — see below.)
- Endpoint (real): `/api/pump/coin-intel`. Links `/launches`, `/oracle?mint=`, `/pump-live` exist. Coin rule: clean.

## /coin-intel — pages/coin-intel.html
Verdict: Strong coin-feed page with drawer detail, Oracle conviction, watchlist persistence, full a11y. Note: this is a *feed* page, not a `?mint=` profile — it opens detail in a drawer via API, which is fine.

- [P3] Drawer is `position:fixed; max-width:94vw` (~:204) — fine on standard screens; could widen on ultra-wide.
- Endpoints (real): `/api/pump/intel` (15s refresh), `/api/oracle/coin?mint=`. Drawer cross-links: `/coin3d?mint=`, `/oracle?mint=`, `/sniper`, pump.fun/Solscan — all routes verified to exist. Watchlist shares `ld_watchlist` localStorage key with /watchlist. Coin rule: clean.

## /watchlist — pages/watchlist.html (thin shell → src/watchlist.js)
Verdict: Clean thin shell, real coin-status cards, Oracle conviction batch, cross-tab sync. No P0/P1.

- [P2] No back-link from an opened Oracle coin detail to the watchlist — minor friction if opened in a new tab.
- Empty/loading/error states present. Mounts `coin-status-card.js`; shares `ld_watchlist` with coin-intel; `storage` event sync. Link `/launches` exists. Coin rule: clean.

## /constellation — pages/constellation.html (thin shell → src/constellation/main.js)
Verdict: Real Three.js token galaxy over live trending + Granite embeddings, with graceful degradation. One dead nav link.

- [P1] Badge link and degradation notices point to **`/ibm/galaxy`** (constellation.html:112; main.js:393, :492) — that route is **not in vercel.json** (only `/ibm/x402-demo` exists; `/galaxy` exists but not `/ibm/galaxy`). Dead link. Repoint to `/galaxy` or add the `/ibm/galaxy` rewrite.
- [P1] If watsonx/Granite isn't configured, semantic clustering is lost and the view falls back to trending-rank layout (main.js:491–498). Degradation is clear and intentional, but it is a silent feature loss on misconfigured deploys — ensure prod has `WATSONX_API_KEY`.
- States: loading overlay, empty ("no trending tokens"), WebGL-missing fatal, degraded-config notice — all designed. Endpoints (real): `/api/pump/trending`, `/api/watsonx/embed`, `/api/brain/chat` (provider ibm-granite). Coin rule: clean.

## /strategy-lab — public/strategy-lab.html
Verdict: Real strategy validate/backtest/run against live MCP on-chain data — NOT a fake simulator. No Math.random/setTimeout fakery. Production-ready.

- [P3] Abort-all uses native `confirm()` (~:447) rather than an in-app modal — dated UX.
- Endpoints (real): `/api/agents`, `/api/agents/{id}/solana`, `/api/pump/strategy-validate`, `/api/pump/strategy-backtest` (real MCP data), `/api/pump/strategy-run`, `/api/pump/portfolio`, `/api/pump/strategy-close-all`. States: initial/validation-issues/running-log/results all present. Coin rule: clean (all coins from backtest response).

## /pump-dashboard — pages/pump-dashboard.html (4894 lines)
Verdict: Large, real dashboard on the PumpPortal firehose + many `/api/*` panels. No broken-page P0; robustness gaps around feed-failure surfacing and reconnect caps.

- [P1] PumpPortal WS (`wss://pumpportal.fun/api/data`, ~:1747) reconnect has no visible max-backoff cap; on a sustained outage the page can retry forever with no permanent error state. Add a cap + dead-feed indicator.
- [P1] No error overlay if `/api/pump/channel-feed` (~:2331) fails — the realtime panel shows "Waiting for realtime feed" indefinitely. Add a fetch-failure state.
- [P1] `/api/agents/featured` (~:1989) and token-logo `<img>` (~:2104) have no error handler/`onerror` fallback — broken-spinner / broken-image on failure.
- [P2] `THREE_MINT` (:1748) is the only hardcoded mint and is correct ($THREE default chart selection) — noted, not a violation.
- [P2] RPC URL migration to `/api/solana-rpc` (~:1754–1759) swallows failures silently.
- Coin rule: clean ($THREE only; token decimals for USDC/USDT/wSOL are infra, not product data). Sidebar `/dashboard/tokens` link verified to exist.

## /pump-live — pages/pump-live.html (888 lines)
Verdict: Real WS live feed with correct reconnect cap and a manual-retry error state. Solid; minor stale-price and badge gaps.

- [P1] After `MAX_RECONNECT_ATTEMPTS` (8) the page shows a permanent error+retry (~:565–586) — correct, but the dead state reads like a transient blip. Make the "feed stopped" state more explicit.
- [P1] SOL price from `/api/pump/helius-stats` is fire-and-forget; until it arrives market caps render in SOL and may look stale (~:397–416). Add a "price loading" hint.
- [P2] `/api/oracle/batch` non-OK is swallowed (~:829) — conviction badges silently stay empty. Log/retry.
- Endpoints (real): PumpPortal WS, `/api/pump/helius-stats`, `/api/img`, `/api/oracle/batch`. Coin rule: clean.

## /pumpfun — public/pumpfun.html (1757 lines)
Verdict: Real agent feed (SSE) + avatar/agent config + 3D viewer. EventSource recovery and picker-loading gaps.

- [P1] `/api/agents/pumpfun-feed` EventSource `onerror` (~:1281) only reconnects on `readyState===CLOSED`; a stuck `CONNECTING` state never recovers and never surfaces an error — feed can hang blank. Add a connection timeout + error state.
- [P1] Avatar picker fetches `/api/avatars/public` and `/api/avatars` on tab click (~:866–914) with no skeleton/loading — empty grid until data arrives. Add a loading state.
- [P2] Agent config saved to `localStorage` (~:719) with no shape validation; corrupted config fails silently on load (~:737). Validate on read.
- [P2] Share-link copy (~:1673) concatenates `pathname+search` without stripping query params (e.g. a `?asset=` value) — possible over-share. Canonicalize the shared URL.
- [P3] 3D viewer auto-loops `repetitions: Infinity` (~:1093) with no pause control; on viewer load failure user must refresh.
- Endpoints (real): `/api/agents/pumpfun-feed` (SSE), `/api/avatars`, `/api/avatars/public`. Coin rule: clean.

## /pump-visualizer — pages/pump-visualizer.html (2509 lines)
Verdict: Heavy WebGL visualizer over multiple live feeds. Real data, but the most robustness debt in the group (reconnect, GPU fallback, unbounded cache, external avatar dep).

- [P1] SSE reconnect uses a fixed 1.2s delay (~:2233–2236) with no exponential backoff or permanent error state — sustained PumpPortal outage spins "Connecting…" forever. Add backoff + dead state.
- [P1] WebGL renderer requests `powerPreference:'high-performance'` (~:889–893) with no feature-detect or 2D fallback — low-end/mobile devices may get a blank canvas. Add a fallback.
- [P1] `_oracleCache` Map (~:1484) grows unbounded — memory creep over a long session. Add TTL/cap.
- [P1] Avatar fallback uses external `dicebear.com` (~:1396) with no further fallback; if blocked, avatars render blank. Use the canvas fallback the trending view already has (~:988–1008).
- [P2] Feed dedup set drops oldest 1024 when >4096 (~:2100–2103) — by design, but the same token can re-enter the feed and confuse users.
- [P3] Canvas size forced `100% !important` (~:43–46) blocks CSS responsive rescaling without a JS reboot.
- Double-click and "Open in 3D" go to `/coin3d?mint=` (~:1322, :1432) — route verified to exist; add a 404 guard for safety (P3).
- Endpoints (real): trending/live-feed/migrations/stats `/api/*` + SSE. Coin rule: clean.

---

## Group summary

No P0s. The two most material findings are the **dead `/ibm/galaxy` nav link on /constellation** (P1 — route absent from vercel.json) and the **unverified claim POST on /claim-wallet** (P1 — the claim is deferred to `/login` and must be confirmed to complete the round-trip). The coin rule is fully respected across all 16 pages — the only hardcoded mint anywhere is `$THREE`, used as a default chart selection on /pump-dashboard.

Dominant P1 themes (reachable but incomplete):
1. **Feed-failure UX.** Multiple live feeds (oracle graph, smart-money, pump-dashboard channel-feed, pumpfun SSE, pump-visualizer SSE) silently keep stale data or spin forever instead of surfacing a recoverable error/stale state with retry.
2. **Reconnect robustness.** pump-dashboard and pump-visualizer lack reconnect-backoff caps / permanent dead-feed states (pump-live does this correctly — use it as the pattern).
3. **Table/row accessibility.** oracle, activity, leaderboard, trending, smart-money have `<div>` grids or label-less rows/buttons missing `aria-label`/`scope`/semantic table roles.
4. **External/unbounded deps.** pump-visualizer's dicebear avatar fallback and unbounded `_oracleCache` (shared with /radar) need a local fallback + TTL.

Best-in-group references to copy: **/radar** (four designed states, tab-pause, focus trap), **/trades** (`role="feed"`+`aria-busy`), **/strategy-lab** (real MCP backtest, no fakery), **/pump-live** (correct reconnect cap + manual-retry dead state).
