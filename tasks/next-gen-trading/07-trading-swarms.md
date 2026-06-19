# Task 07 — Agent Trading Swarms (pooled treasury + shared signals + pro-rata x402 payouts)

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. Genuinely innovative, not a clone. No mocks, no
> fake/sample data, no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire 100%
> end-to-end with REAL APIs and real on-chain data. Every state designed. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime-supplied mints in generic trade
> plumbing are the only exception and are never promoted. After it works, self-review and ship
> the 10× improvement. `data/changelog.json` entry for every user-visible change. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.
>
> **Depends on task 06 (signal marketplace) and tasks 01/02/03.**

## The invention

Solo snipers are capital- and signal-limited. A **trading swarm** lets multiple agents pool
capital into a shared, auditable treasury and combine their individual signals into one
**consensus conviction** — the swarm only fires when enough reputable members agree, sizing by
combined edge. Profits and losses distribute **pro-rata to each member's contribution via real
x402 settlement**, with a transparent on-chain-auditable ledger. It's a self-organizing,
permissionless trading guild of AI agents — a primitive that simply does not exist anywhere.

## Context (real, verified)

- Per-agent custodial wallets + signing: `api/_lib/agent-wallet.js` (`recoverSolanaAgentKeypair`),
  custody audit `agent_custody_events`, spend guards `api/_lib/agent-trade-guards.js`.
- x402 agent-to-agent settlement for payouts: `api/x402-pay.js`, `agent_payments` ledger,
  `api/agents/a2a-*.js`.
- Member signals come from task 06 `signal_emissions` and/or each member's own sniper score
  (`workers/agent-sniper/scorer.js`). Smart-money consensus from task 03.
- Execution reuses `executor.js` / `agent-trade.js`, firewall (01), MEV engine (02).
- Reputation weighting: `api/_lib/trader-stats.js` composite score.

## Goal

A swarm primitive: create/join a swarm, contribute capital to a swarm treasury wallet, a
consensus engine that fires trades on weighted member agreement, and a real pro-rata
profit-distribution settlement — all auditable, all spend-guarded, with a clean exit.

## What to build

1. **Swarm + treasury model** — `swarms` (id, name, owner_agent_id, network, policy jsonb:
   min_consensus, max_per_trade, daily_budget, fee_bps to creator, join rules) and
   `swarm_members` (swarm_id, agent_id, contribution_lamports, share_bps, joined_at, status).
   The treasury is a dedicated custodial Solana wallet provisioned via the existing
   `agent-wallet.js` provisioning path (a swarm is itself an agent-owned wallet) — real on-chain,
   real custody audit. Members fund it by real SOL transfer; shares computed from net
   contributions.
2. **Consensus engine** — a worker loop (extend `workers/agent-sniper/`) that, per candidate mint,
   gathers member signals (their sniper scores + task-06 emissions + task-03 smart-money), weights
   them by each member's verified `trader-stats` score, and fires a buy from the **treasury wallet**
   only when weighted agreement ≥ `min_consensus`. Size from combined conviction, bounded by swarm
   policy + the firewall (01), executed via the MEV engine (02). Every decision logged with the
   vote breakdown.
3. **Pro-rata settlement** — on each closed position, compute realized PnL and distribute net
   proceeds back to members **pro-rata by share** via real x402/SOL transfers from the treasury,
   minus an optional creator fee (bps). Record every payout in `agent_payments` +
   `agent_custody_events` (category `swarm_payout`). Idempotent, audited, spend-guarded. A member
   can **exit** at any time: their share is settled out to their own wallet from current treasury
   value (open positions handled by policy — settle-at-mark or wait-to-close, made explicit).
4. **Anti-abuse** — cap any single member's share to prevent treasury capture; require the
   firewall on every swarm buy; honor a swarm-level kill switch any member-with-threshold or the
   creator can trigger; never let consensus override per-treasury spend limits.
5. **API + UI** — `/api/swarms` (CRUD, join, contribute, exit), `/api/swarms/:id` (state, members,
   positions, vote log, payout history), `/api/swarms/:id/stream` (SSE live decisions). Build a
   **Swarms** surface: directory of open swarms (with verified aggregate track record), a swarm
   dashboard (treasury balance, live consensus votes, open positions, member shares, payout
   ledger), and join/contribute/exit flows with clear, honest disclosure of risk and fees. All
   states designed; accessible; responsive.

## Constraints

- The treasury is real custodial SOL — every movement (contribution, trade, payout, exit) is a
  real on-chain tx, spend-guarded and audited. No internal "virtual balances" that don't reconcile
  to the on-chain treasury balance; the ledger must always tie out to chain.
- Consensus fires only on real member signals; never fabricate a vote or a member.
- Member funds are theirs: exit + withdraw must always be possible; never trap capital. Make the
  open-position settlement policy explicit and fair.
- $THREE-only rule; swarms trade arbitrary runtime mints but promote no token.

## Success criteria

- A swarm can be created, funded by multiple agents (real SOL), and its treasury balance ties to
  chain; consensus fires a real firewall-gated buy from the treasury.
- Closed positions distribute real pro-rata payouts via x402/SOL, fully audited; a member can exit
  and withdraw their settled share.
- Swarms UI (directory, dashboard, join/exit) renders all states; kill switch + caps enforced.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/07-trading-swarms.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
