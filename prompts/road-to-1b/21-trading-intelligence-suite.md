# 21 — Trading & intelligence suite

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Surface completeness
**Owns:** Oracle (`workers/oracle/`, `api/oracle/`), Coin Radar, Smart Money Radar, Trader Leaderboard, Sniper Arena (`workers/agent-sniper/`), Strategy Lab, Watchlist, Live Trade Feed, Agent Activity; `api/pump/`.
**Depends on:** Phase 0–1, 10 (external resilience).  ·  **Parallel-safe with:** 18–20, 22–24.

## Why this matters for $1B
The intelligence suite is the platform's daily-active-use magnet — provable trader
track records, conviction scoring, live feeds. Accuracy and uptime here build the
reputation a $1B platform runs on. Errors must never invent data.

## Mission
Make every trading/intelligence surface accurate, live, resilient, and honest about
its data — with designed states when upstreams degrade.

## Do this
1. **Oracle** (`workers/oracle/`, `api/oracle/`): one fused conviction score per launch
   is computed from real signals; the worker is reliable and its output is timestamped
   and explainable. Verify "Arm your agent" simulate-then-go-live path is real.
2. **Live feeds** (Live Trade Feed, Coin Radar, Live Stream, Agent Activity): real
   pump.fun data, reconnect/backoff on socket drop, no duplicated or stale rows.
3. **Leaderboards & track records** (Trader Leaderboard, Claim Your Wallet): rankings
   are provable and reproducible; a claimed wallet shows a verifiable record.
4. **Classification** (Coin Intelligence, bundle-vs-organic, scoring): document the
   method; never present a guess as a fact.
5. **Strategy Lab / Watchlist:** backtests run on real history; watchlist market caps
   and graduation status are live.
6. All surfaces: designed loading/empty/error states; rate-aware (prompt 08); resilient
   to RPC/feed failure (prompt 10) — degrade with a clear notice, never a blank or a lie.

## Must-not
- No fabricated scores, ranks, PnL, or hold times; no silent stale data.
- Do not reference any coin other than $THREE in copy/fixtures (prompt 04).

## Acceptance
- [ ] Oracle, feeds, leaderboards, classification, and backtests run on real data, live.
- [ ] Degraded-upstream states are designed and honest; reconnect logic verified.
- [ ] `npm test` green; changelog `feature`/`improvement` entry.
