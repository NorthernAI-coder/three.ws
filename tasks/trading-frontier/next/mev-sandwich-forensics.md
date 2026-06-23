# Task — MEV / Sandwich Forensics (how much the bots took from you)

> **Operating bar.** Senior engineer + product thinker building three.ws to beat the best in the
> world. Genuinely innovative, not a clone. No mocks, no fake/sample data, no placeholders, no
> TODO/stubs, no `setTimeout` fake-loading. Wire 100% end-to-end with REAL APIs and real on-chain
> data. The only coin is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime mints
> in generic trade plumbing are the only exception and are never promoted.

## ⛓ Chain protocol — do this as STEP 0, before building

This task is a node in a self-extending chain (see `tasks/trading-frontier/README.md`). Before you
build the feature below:
1. Read all of `tasks/` (every epic) + `tasks/trading-frontier/BACKLOG.md`. Know what exists/planned.
2. Invent **10 genuinely new, non-duplicate feature ideas**, each innovative, grounded in the real
   three.ws codebase (cite real files/APIs/tables), advancing sniping/trading/launching/buying/selling.
3. Write each as a full prompt in `tasks/trading-frontier/next/<slug>.md`, matching this file's
   structure exactly — including this Chain protocol section, so the chain continues.
4. Append one line per new prompt to `BACKLOG.md` after confirming it isn't a duplicate.
5. Only then build YOUR feature to the **production-ready bar** in the epic README, and `git rm`
   this file in the completion commit.

## The invention

The MEV execution engine (next-gen 02) helps you *land* a trade. It never tells you when you got
*robbed*. Build **MEV / Sandwich Forensics**: a post-trade detective that re-reads each of the
agent's swap transactions and its block neighborhood, detects when the agent was sandwiched (a bot
bought immediately before and sold immediately after the agent in the same pool/slot), quantifies
the SOL the agent actually lost to that extraction versus its quoted execution, and surfaces the
toxic pools / RPC routes where it keeps happening. The honest receipt of the invisible MEV tax —
and an evidence trail to route around it.

## Context (real, verified)

- Agent swap signatures: `agent_sniper_positions` (`buy_sig`/`sell_sig`) and `agent_custody_events`
  (`signature`, category trade/snipe). Tx + block neighbors come from `getParsedTransaction` /
  `getBlock` over the RPC layer already wired in `api/agents/solana-wallet.js`
  (`getParsedTransactions`, `_solRpcWithBackoffFallback`, `solanaConnection`).
- Expected execution to compare against: the quote each trade recorded (entry/exit lamports in the
  position row; price-impact fields `entry_price_impact_pct`), and curve/AMM state
  `api/_lib/pump.js#getAmmPoolState`. SOL/USD: `api/_lib/pumpfun-ws-feed.js#getSolPrice`.

## Goal

A forensics service (`api/_lib/mev-forensics.js`) + `/api/agents/:id/mev` that classifies each swap
as clean / sandwiched / front-run, quantifies SOL lost to extraction, and aggregates a MEV-tax
report surfaced in the wallet hub.

## What to build

1. **Sandwich detection** — for each swap, inspect the same-pool transactions immediately before
   and after the agent's tx in the slot/block; flag the buy-before / sell-after bot signature and
   estimate the extracted value vs the agent's quoted execution. Conservative + evidence-linked
   (every flag points to the on-chain txs).
2. **MEV-tax aggregate** — total SOL/USD lost to extraction, sandwich rate, worst pools, and which
   RPC/route correlates with the most extraction.
3. **API** — `/api/agents/:id/mev?window=` returns per-swap verdicts + the aggregate; cached;
   concurrent tx fetch; honest "indeterminate" when block data is unavailable (never a false accusation).
4. **UI** — a MEV panel: MEV-tax header (SOL/USD lost, sandwich rate), a per-swap table with verdict
   + Solscan links to the bot txs, and a toxic-pool/route summary. All states designed (empty/clean);
   accessible; responsive.

## Constraints

- Every accusation is backed by real on-chain neighbor transactions; ambiguous cases are marked
  indeterminate, never fabricated. Read-only forensics; no trades initiated.
- $THREE-only rule; runtime mints are trade data only.

## Success criteria

- The forensics correctly identifies real sandwich/front-run events around the agent's swaps and
  quantifies the SOL lost, with evidence links and honest indeterminate handling.
- MEV UI renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature, security). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/mev-sandwich-forensics.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
