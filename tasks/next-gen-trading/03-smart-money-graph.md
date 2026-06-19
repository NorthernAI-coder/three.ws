# Task 03 — Smart-Money Wallet Graph & Cluster Intelligence

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. Genuinely innovative, not a clone. No mocks, no
> fake/sample data, no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire 100%
> end-to-end with REAL APIs and real on-chain data. Every state designed. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime-supplied mints in generic trade
> plumbing are the only exception and are never promoted. After it works, self-review and ship
> the 10× improvement. `data/changelog.json` entry for every user-visible change. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.

## The invention

We already record, per launch, every buyer wallet and its **funder** (`pump_coin_wallets`),
plus eventual **outcomes** (`pump_coin_outcomes`: graduated/pumped/rugged/ath_multiple). Nobody
has stitched this into a persistent, self-updating **wallet reputation graph**. Build it: derive
a rolling "smart money" score per wallet from its realized hit-rate across launches, cluster
wallets that share a common funder (sybil/insider detection), and emit a **live "smart money is
buying X" signal** that the sniper, the firewall, and Mission Control all consume. This is the
on-chain alpha layer competitors fake with vanity lists; ours is computed from outcomes.

## Context (real, verified)

- Per-coin per-wallet ledger: `pump_coin_wallets` (buy/sell counts, volumes, `is_creator`,
  `funder`) — written by `workers/agent-sniper/intel/store.js`.
- Outcome labels: `pump_coin_outcomes` (`outcome`, `ath_multiple`, `ath_market_cap_usd`,
  graduated/rugged) — the ground truth for scoring wallets.
- Signal computation patterns: `workers/agent-sniper/intel/signals.js` (concentration, entropy,
  funder graph) and the learning loop `intel/learn.js` (per-signal conditional win-rates) — mirror
  this style for wallet scoring.
- Existing conviction surface to enrich (don't duplicate): `oracle_conviction.smart_wallet_count`,
  `oracle_agent_watch.require_smart_money` — feed real numbers into these.
- DB: Neon HTTP (`api/_lib/db.js`); migrations in `api/_lib/migrations/`.

## Goal

A maintained `wallet_reputation` table + `wallet_clusters` table, a recompute job, and a
`getSmartMoneyForMint(mint, network)` / `getWalletReputation(addr)` API used by the worker
(scoring + oracle), the firewall, and the UI — all derived from real observed buys and outcomes.

## What to build

1. **Migration** — `wallet_reputation` (address, network, scored_at, trades_seen, winners,
   losers, win_rate, avg_ath_multiple, realized_score 0–100, first_seen, last_seen, labels[]) and
   `wallet_clusters` (cluster_id, address, funder_root, size, confidence, network). Indexes for
   lookup by mint-join and by score.
2. **Recompute job** — a worker entrypoint (extend `workers/agent-sniper/` or a sibling under
   `workers/`, runnable standalone, env-gated) that, on an interval, joins `pump_coin_wallets` ⋈
   `pump_coin_outcomes` to compute each active wallet's hit-rate and ATH-weighted score, and
   clusters wallets by shared `funder` (union-find over funder edges) with a confidence from
   co-occurrence frequency. Fire-and-forget DB writes; never block the live feed. Honest about
   sample size — regress new wallets toward neutral until N observed launches (mirror the
   confidence regression in `trader-stats.js`).
3. **Live signal** — `getSmartMoneyForMint(mint, network)` returns the count + list of
   reputable, non-clustered wallets currently net-buying this mint (from the in-flight intel
   watcher + `pump_coin_wallets`), with a `smart_money_score` and `sybil_flag` when buyers are
   dominated by one cluster. Cache briefly.
4. **Wire into trading** — add an optional strategy gate `min_smart_money_score` /
   `require_smart_money` to `agent_sniper_strategies`; have `scorer.js` (`scoreIntel`) and
   `oracle-gate.js` add the smart-money signal to their score, and feed the real
   `smart_wallet_count` into `oracle_conviction`. The firewall (task 01) WARNs when a buy is
   dominated by a single sybil cluster.
5. **API + UI** — `GET /api/intel/smart-money?mint=…&network=…` (public, rate-limited, cached) and
   `GET /api/intel/wallet/:address`. Build a **Smart-Money** panel: a compact, accessible mini
   wallet-graph (reputable buyers, clusters highlighted, links to Solscan), shown on the coin/
   trade surfaces and consumed by Mission Control (task 09). All states designed; zero-data state
   explains "not enough on-chain history yet."

## Constraints

- Scores derive only from real observed buys + real outcomes — no hand-curated wallet lists, no
  invented "famous trader" names. If there isn't enough data, say so; don't fabricate confidence.
- Never expose or store private keys; this is public on-chain address analytics only.
- Respect Neon HTTP limits — batch the recompute, paginate, and keep the live lookup O(small).
- $THREE-only rule; synthetic placeholder addresses in fixtures (e.g. `THREEsynthetic1111…`),
  never a real third-party wallet.

## Success criteria

- `wallet_reputation` + `wallet_clusters` populate from real data on a real network; recompute
  is re-runnable and idempotent.
- `scoreIntel`/`oracle-gate` incorporate smart-money; `min_smart_money_score` gate works.
- Smart-Money panel + APIs render with all states; sybil clusters are flagged.
- Build/typecheck/test clean. Changelog entry (tags: feature, improvement). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/03-smart-money-graph.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
