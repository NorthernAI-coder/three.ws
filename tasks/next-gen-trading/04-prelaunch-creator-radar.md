# Task 04 — Pre-Launch Creator-Wallet Radar (block-zero pre-cog sniping)

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. Genuinely innovative, not a clone. No mocks, no
> fake/sample data, no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire 100%
> end-to-end with REAL APIs and real on-chain data. Every state designed. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime-supplied mints in generic trade
> plumbing are the only exception and are never promoted. After it works, self-review and ship
> the 10× improvement. `data/changelog.json` entry for every user-visible change. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.
>
> **Depends on task 03 (smart-money graph).** Use its wallet reputation as the watchlist source.

## The invention

Everyone snipes *after* a coin appears in the PumpPortal feed — by then thousands of bots see
it too. We go earlier: **watch the wallets of creators who have repeatedly graduated coins, and
the smart-money wallets from task 03, in real time.** When a watched wallet funds a fresh wallet
that then deploys a mint — or itself prepares a launch — we detect it at or before block-0 and
pre-arm the snipe so our agent is first, legitimately, on signal rather than on luck. This is
"pre-cog": acting on the on-chain *precursor* to a launch, not the launch event.

## Context (real, verified)

- Creator history already enriched per mint: `api/_lib/pumpfun-ws-feed.js#enrichMint`
  (`creator_launches`, `creator_graduated`, via `frontend-api-v3.pump.fun/coins/user-created-coins/`).
- Funder edges + outcomes: `pump_coin_wallets.funder`, `pump_coin_outcomes` (task 03 turns these
  into `wallet_reputation`). The pump.fun program id and claim-scan RPC plumbing already exist:
  `api/_lib/pump-claims.js` (`scanFirstClaims`, program `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`).
- Live feed + worker loop to extend: `workers/agent-sniper/index.js`, `first-claim-watch.js`
  (the existing pattern for a parallel watcher with its own poll cadence + dedupe set).
- RPC: `api/_lib/solana/connection.js`; Helius (`HELIUS_API_KEY`) supports address-activity
  webhooks / `getSignaturesForAddress` for real-time wallet monitoring.
- Pre-arm execution reuses `executor.js#executeBuy`, the firewall (task 01), and the MEV engine
  (task 02).

## Goal

A `workers/agent-sniper/prelaunch-radar.js` watcher that maintains a live, auto-curated watchlist
of high-signal creator + smart-money wallets, detects launch precursors on-chain, and pre-arms a
snipe through the existing executor — with a strategy trigger `prelaunch_radar` and full audit.

## What to build

1. **Watchlist builder** — derive the watched set from (a) creators with `creator_graduated >= N`
   (configurable) seen in recent feed history, and (b) top `wallet_reputation` addresses (task 03),
   excluding sybil clusters. Persist to a `radar_watchlist` table (address, reason, score,
   network, added_at, last_hit_at) and refresh on an interval. Cap the set; evict stale low-signal
   wallets.
2. **Precursor detection** — monitor watched wallets in real time (Helius address webhook if
   configured, else polled `getSignaturesForAddress` with backoff). Detect two precursors:
   (a) a watched wallet **funds a brand-new wallet** that has no history (likely a fresh deploy
   wallet), and (b) a watched wallet **submits a pump.fun create instruction**. Correlate the
   resulting mint as soon as it lands and emit a `radar_event { trigger_wallet, new_wallet?, mint,
   confidence, ts }`. Dedupe via an in-process set like `first-claim-watch.js`.
3. **Pre-arm + fire** — for each agent strategy with `trigger='prelaunch_radar'`, score the event
   (creator pedigree + smart-money + task-01 firewall the instant the mint exists), and if it
   passes, schedule `executeBuy` through the MEV engine with the strategy's size — racing to be in
   the first block. All spend guards, kill switch, and custody audit apply unchanged.
4. **Schema** — add `trigger='prelaunch_radar'` support + radar-specific gates to
   `agent_sniper_strategies` (`min_creator_graduated_radar`, `require_smart_money_funder`,
   `radar_max_age_ms`). New `radar_watchlist` + `radar_events` tables via dated migration.
5. **API + UI** — `GET /api/sniper/radar?network=…` (owner: their armed radar; public: anonymized
   live precursor stream count) and an SSE feed mirroring `api/sniper/stream.js`. Build a **Radar**
   view: live precursor events with confidence, which watched wallet triggered, and (for the owner)
   whether their agent fired. A "watchlist" panel showing why each wallet is watched. All states
   designed; empty state explains the radar is learning.

## Constraints

- Detection must be from **real on-chain reads** — real funding txs, real create instructions.
  Never fabricate a precursor or a confidence. If the webhook/RPC is unavailable, degrade to the
  normal feed-based snipe and report the radar as paused, honestly.
- This is signal-based first-mover advantage, not exploitation: do not implement anything that
  front-runs another *user's pending transaction* in the mempool. We act on *public on-chain
  precursors* (funding, deploys), not on intercepting victims. Keep it clearly on that side.
- Latency matters but safety wins: the firewall (task 01) still gates the buy the moment the mint
  is real; never buy a mint that can't be sold just to be first.
- $THREE-only; synthetic placeholder addresses/mints in fixtures.

## Success criteria

- `radar_watchlist` auto-curates from real creator + smart-money data; precursors detected from
  real chain activity populate `radar_events`.
- A `prelaunch_radar` strategy pre-arms and fires through the firewall + MEV engine with full
  spend-guard + custody audit coverage.
- Radar UI + SSE render with all states. Build/typecheck/test clean. Changelog entry (tags:
  feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/04-prelaunch-creator-radar.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
