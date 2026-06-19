# Task 06 — Creator Reputation & Anti-Scam Registry

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best.
> Genuinely innovative, not a clone. No mocks/fake data/placeholders/TODO/stubs/`setTimeout`
> fake-loading. Wire 100% with REAL APIs + on-chain data. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints in generic plumbing are the only
> exception, never promoted.

## ⛓ Chain protocol — STEP 0, before building

Node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before building:
read all `tasks/` + `BACKLOG.md`; invent **10 genuinely new, non-duplicate, real-codebase-grounded
feature ideas**; write each as a full prompt in `tasks/trading-frontier/next/<slug>.md` matching
this file's structure (including this Chain protocol section); append each to `BACKLOG.md` after a
dedup check. Only then build YOUR feature to the production-ready bar (epic README) and `git rm`
this file in the completion commit.

## The invention

The biggest tell on whether a launch is worth touching is *who launched it* — but that history is
scattered and easy to hide behind fresh wallets. We already enrich creator history per mint
(`creator_launches`, `creator_graduated`) and capture every launch's structure + outcome. Build a
persistent **Creator Reputation & Anti-Scam Registry**: a durable per-creator profile (and cluster,
via funding graph) scoring lifetime graduation rate, rug rate, average ATH, serial-rug patterns,
and fresh-wallet evasion — surfaced as a "creator score" everywhere a coin appears, and as a
searchable directory. A credit bureau for memecoin creators, built from real outcomes.

## Context (real, verified)

- Creator enrichment at launch: `api/_lib/pumpfun-ws-feed.js#enrichMint` (creator history via
  `frontend-api-v3.pump.fun/coins/user-created-coins/{creator}`).
- Outcomes + per-wallet funding edges: `pump_coin_outcomes`, `pump_coin_wallets.funder` — the basis
  for both reputation and cluster/evasion detection (pair with `tasks/next-gen-trading/03` smart-
  money clustering if present).
- Consumers: `workers/agent-sniper/scorer.js` (creator gates already exist:
  `max_creator_launches`, `min_creator_graduated`), `oracle-gate.js`, the firewall
  (`tasks/next-gen-trading/01`), Mission Control.
- Risk flags already captured per coin: `pump_coin_intel.risk_flags`.

## Goal

A maintained `creator_reputation` table + cluster linkage, a recompute job, a
`getCreatorReputation(address)` API used by scoring + firewall + UI, and a public creator directory
— all derived from real launch outcomes.

## What to build

1. **Reputation model** — `creator_reputation` (creator, network, launches, graduated, rugged,
   grad_rate, rug_rate, avg_ath_multiple, median_lifespan, score 0–100, labels[] e.g.
   `serial_rugger`/`reliable_grad`/`fresh_wallet`, cluster_id, first_seen, last_seen, scored_at).
   Link creators that share funding sources into clusters so a rugger can't escape by spinning up a
   new wallet (the new wallet inherits cluster reputation with a confidence).
2. **Recompute job** — a worker/`scripts/` job joining launches ⋈ `pump_coin_outcomes` per creator
   + cluster, with confidence regression for thin histories (mirror `trader-stats.js`). Idempotent;
   batched for Neon HTTP; fire-and-forget writes that never block the feed.
3. **Wire into trading** — feed the real creator score into `scoreMint`/`scoreIntel`, the oracle,
   and the firewall (WARN/BLOCK on `serial_rugger` clusters). Add strategy gates
   `min_creator_score` / `block_creator_clusters`.
4. **API + UI** — `GET /api/intel/creator/:address` (public, rate-limited, cached) and a searchable
   **Creators** directory (`/api/intel/creators` ranked). Build a creator profile card (score,
   grad/rug rates, launch history with outcomes, cluster + evasion flags, Solscan links) shown
   wherever a coin's creator is displayed (coin detail, terminal, trade). All states designed;
   accessible; responsive; an honest "new creator, no history" state.

## Constraints

- Scores derive only from **real launch outcomes** — no hand-maintained blocklists, no naming/
  shaming without on-chain evidence. Cluster inheritance carries an explicit confidence, never a
  certainty. Provide a path to surface false-positive concerns.
- Public address analytics only; never expose private keys. $THREE-only rule; the registry rates
  *creators*, never promotes a token.

## Success criteria

- `creator_reputation` + clusters populate from real outcomes; fresh-wallet evasion is linked with
  confidence; recompute is idempotent.
- Creator score is wired into scoring + firewall; `min_creator_score`/cluster-block gates work.
- Creators directory + profile cards render everywhere a creator appears, all states designed.
- Production-ready bar met; chain extended. Build/typecheck/test clean. Changelog (tags: feature,
  security). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/06-creator-reputation-registry.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
