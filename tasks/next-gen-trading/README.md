# Next-Gen Trading — The three.ws Edge (Epic)

**Thesis:** three.ws is the only place where a **3D AI agent with its own self-custodied
Solana wallet** trades, snipes, and launches autonomously — and where every launch on
pump.fun is fingerprinted in real time by a live **intelligence engine** + **learning
loop**, every track record is **verifiable on-chain** (ERC-8004), and value moves between
agents over **x402 micropayments**. No competitor has that combination. This epic turns
those assets into features the rest of the market structurally *cannot* clone.

This is **not** a set of "me-too" sniper bots. Every task below is an invention: it must
deliver something a trader genuinely cannot get on Photon, BullX, Trojan, GMGN, Axiom, or
any pump.fun bot today. Build like a founder, ship like a craftsman.

## What already exists (build on it — do not rebuild)

The audit that produced this epic confirmed the following are real and working. Read them
before designing; your features compose with these, they don't replace them.

- **Autonomous sniper worker** — `workers/agent-sniper/` (live PumpPortal feed `api/_lib/pumpfun-ws-feed.js`,
  scoring `scorer.js`, execution `executor.js` + `trade-client.js`, positions `positions.js`,
  AMM exit `amm-exit.js`, per-agent lock, budget/spend guards). Strategies + positions in
  `api/_lib/migrations/20260615020000_agent_sniper.sql`.
- **Coin intelligence engine** — `workers/agent-sniper/intel/` observes every launch for a
  window and computes `bundle_score`, `organic_score`, `concentration_top1/5/10`,
  `snipe_ratio`, `wallet_entropy`, `fresh_wallet_ratio`, `bubblemap_connectivity`; persists
  to `pump_coin_intel` / `pump_coin_wallets` / `pump_coin_outcomes`; a **learning loop**
  (`intel/learn.js`) correlates signals→outcomes into `pump_intel_weights`.
- **Oracle conviction** — `workers/agent-sniper/oracle-gate.js` + `oracle_conviction` /
  `oracle_narrative` tables (pillars: pedigree, structure, narrative, momentum).
- **Discretionary agent-wallet trading** — `api/agents/agent-trade.js`,
  `api/agents/solana-trade.js`; shared guardrails `api/_lib/agent-trade-guards.js`
  (spend limits, daily budget, price-impact, allowlist, kill switch); custody audit
  `agent_custody_events`.
- **Pump.fun launch + buy/sell** — `api/pump/[action].js`, `api/_lib/pump.js`,
  `api/_lib/pump-swap-ix.js`, `api/_lib/pump-launch.js`; `pump_agent_mints`, `/launches`.
- **x402 micropayments** — `api/x402-pay.js` (per-agent USDC settlement, SSE).
- **On-chain identity + reputation** — `contracts/src/{IdentityRegistry,ReputationRegistry,
  ValidationRegistry}.sol`, `api/erc8004/*`, `erc8004_agents_index`, Solana attestations.
- **Verifiable track record + leaderboard + copy scaffolding** — `api/_lib/trader-stats.js`
  (composite score, verification badge), `api/sniper/{leaderboard,trader,history,stream}.js`,
  `copy_subscriptions`.
- **RPC failover** — `api/_lib/solana/connection.js` (Helius/Alchemy/Ankr/PublicNode rotation).
- **SDKs** — `@three-ws/sdk`, `@three-ws/solana-agent`, `@three-ws/agent-payments`.
- **Wallet hub UI + design tokens** — `src/agent-wallet-hub/` (tabs balance/deposit/trade/
  snipe/pay/withdraw); CSS vars in `src/agent-wallet-hub/index.js`.

## The tasks

| #  | Task                                                              | Wave | Depends on |
|----|-------------------------------------------------------------------|------|------------|
| 01 | Rug/Honeypot Simulation Firewall (pre-trade safety engine)        | 0    | —          |
| 02 | MEV-Aware Execution Engine (Jito bundles, dynamic fees, atomic)   | 0    | —          |
| 03 | Smart-Money Wallet Graph & Cluster Intelligence                   | 0    | —          |
| 04 | Pre-Launch Creator-Wallet Radar (block-zero pre-cog sniping)      | 1    | 03         |
| 05 | Natural-Language Strategy Compiler + Historical Backtester        | 1    | —          |
| 06 | Reputation-Gated Signal Marketplace (x402 paid alpha feeds)       | 1    | 03         |
| 07 | Agent Trading Swarms (pooled treasury + pro-rata x402 payouts)    | 2    | 06         |
| 08 | Launch Copilot — Autonomous Fair-Launch Market-Maker             | 1    | 01,02      |
| 09 | Mission Control — Real-Time Trading Terminal (the capstone UI)    | 2    | 01,03,04   |
| 10 | Social Trading Arena — On-Chain PvP Tournaments ($THREE prizes)   | 2    | —          |
| 11 | End-to-end devnet smoke harness + Definition-of-Done sweep        | 3    | all        |

```
Wave 0 (foundations, parallel):   01 ── 02 ── 03
Wave 1 (parallel, after 0):       04←03   05   06←03   08←01,02
Wave 2 (parallel, after 1):       07←06   09←01,03,04   10
Wave 3 (gate):                    11 (proves the whole edge end-to-end)
```

Tasks are written to run **independently and in parallel** in separate agent chats.
Concurrent agents share one worktree — stage explicit paths, never `git add -A`/`git add .`,
and re-check `git status` before committing. Each task file is self-deleting: when its work
is shipped and verified, `git rm` the file in the same commit. When every numbered file is
gone, delete this README.

## Definition of done (whole epic)

- Every feature is reachable from the product (navigation, not a hidden route), wired
  100% with real APIs and real on-chain/data-engine data — zero mocks, zero fake/sample
  arrays, zero `setTimeout` fake-loading, zero TODOs/stubs.
- Every surface has designed loading/empty/error/populated states, hover/active/focus,
  is responsive at 320/768/1440, accessible (semantic HTML, ARIA, keyboard, focus rings),
  and console-clean.
- All trading paths honor the existing spend guards (`agent-trade-guards.js`), custody
  audit (`agent_custody_events`), and the firewall (task 01) before any buy.
- The only coin referenced anywhere is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Runtime-supplied mints in generic trade plumbing are the only exception and are never
  promoted, hardcoded, or recommended.
- `npm run build`, `npm run typecheck`, `npm test` clean; `data/changelog.json` entries
  for every user-visible change; the **completionist** subagent passes on each task's diff.
- `node scripts/next-gen-trading-smoke.mjs` (task 11) proves create→fund→protect→snipe→
  signal→swarm→launch-MM→arena end-to-end on devnet, simulate-first with honest BLOCKED
  reporting — never a fake pass.
