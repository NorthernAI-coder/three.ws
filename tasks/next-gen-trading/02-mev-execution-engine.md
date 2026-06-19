# Task 02 — MEV-Aware Execution Engine (Jito bundles, dynamic fees, atomic protection)

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. Genuinely innovative, not a clone. No mocks, no
> fake/sample data, no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire 100%
> end-to-end with REAL APIs and real on-chain data. Every state designed. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime-supplied mints in generic trade
> plumbing are the only exception and are never promoted. After it works, self-review and ship
> the 10× improvement. `data/changelog.json` entry for every user-visible change. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.

## The invention

Snipers win or lose in the first block. Today our `signAndSend` (`workers/agent-sniper/trade-client.js`)
sends a single raw tx with a fixed compute budget — at the mercy of public mempool ordering and
sandwich bots. We build a real **MEV-aware execution layer**: Jito bundle submission with a
dynamic tip, priority-fee modeling from recent blocks, simulate-then-send with adaptive retry,
and atomic anti-sandwich protection. The edge: better fills, fewer reverts, measurable.

## Context (real, verified)

- Current broadcast: `workers/agent-sniper/trade-client.js#signAndSend` (~L29) — blockhash →
  v0 message → sign → `sendRawTransaction(skipPreflight:false, maxRetries:3)` → confirm race.
- Discretionary broadcast paths: `api/agents/agent-trade.js`, `api/agents/solana-trade.js`
  (`_solRpcWithBackoffFallback`). Tx serialization helper: `api/_lib/pump.js#buildUnsignedTxBase64`.
- RPC failover + cooldowns: `api/_lib/solana/connection.js`. Helius (`HELIUS_API_KEY`) supports
  `getPriorityFeeEstimate`.
- Slippage/impact config lives on `agent_sniper_strategies` (`slippage_bps`, `max_price_impact_pct`)
  and trade limits (`api/_lib/agent-trade-guards.js`).
- SDK has compute-unit/priority-fee helpers: `solana-agent-sdk` (`estimatePriorityFee`,
  `estimateComputeUnits`) — reuse rather than reinvent where sensible.

## Goal

A single `api/_lib/execution-engine.js` (`submitProtected({ network, connection, payer,
instructions, opts })`) used by the sniper worker AND the discretionary endpoints, that:
chooses the cheapest viable inclusion path, sets a data-driven priority fee + compute limit,
optionally routes a Jito bundle with a tip, simulates before send, and retries adaptively —
returning `{ signature, slot, route, tipLamports, priorityFeeMicroLamports, attempts, landedMs }`.

## What to build

1. **Dynamic compute budget** — prepend `ComputeBudgetProgram.setComputeUnitLimit` (from a real
   `simulateTransaction` unit estimate, not a guess) and `setComputeUnitPrice` from a real
   priority-fee estimate (Helius `getPriorityFeeEstimate`, falling back to a recent-blocks
   percentile via `getRecentPrioritizationFees`). Cache estimates briefly.
2. **Jito bundle route** — integrate the Jito Block Engine REST API
   (`JITO_BLOCK_ENGINE_URL`, default `https://mainnet.block-engine.jito.wtf`): fetch tip-floor,
   append a real SOL tip transfer to a Jito tip account as the last instruction, and submit via
   `sendBundle`. Poll bundle status for landing. Tip sizing is **adaptive**: scale with a
   per-strategy `mev_tip_mode` (`off`|`economy`|`turbo`) and back off if bundles aren't landing.
   Devnet/no-Jito → transparently fall back to the protected single-tx route.
3. **Atomic protection** — when the firewall (task 01) is present, optionally pack the safety
   round-trip check inline; always set tight, honest slippage from strategy config so a sandwich
   makes the tx revert rather than fill at a terrible price (fail-closed, not fill-at-any-cost).
4. **Adaptive retry + landing telemetry** — simulate first; on blockhash-expiry or not-landed,
   refresh blockhash and re-submit up to a bounded count with escalating fee/tip; record
   `landedMs`, route, attempts. Never silently double-spend — dedupe by the worker's existing
   idempotency lock.
5. **Wire it in** — replace the body of `workers/agent-sniper/trade-client.js#signAndSend` to call
   `submitProtected` (keep the signature stable for callers); route the discretionary buy/sell in
   `agent-trade.js`/`solana-trade.js` through it too. Persist execution telemetry onto
   `agent_sniper_positions` (new nullable columns: `exec_route`, `tip_lamports`,
   `priority_fee_microlamports`, `landed_ms`) via a dated migration.
6. **Surface it** — add an "Execution" readout to the sniper/positions UI and the trade result
   toast: route used (Jito turbo / protected), tip paid, time-to-land. Add `mev_tip_mode` +
   `firewall_level` (if task 01 merged) to the strategy editor. All states designed.

## Constraints

- Real RPC + real Jito only — no simulated landings, no fabricated fee numbers. If Jito is
  unreachable, fall back and say so in telemetry; never claim a bundle landed that didn't.
- Tips are real SOL leaving the agent wallet — count them in the spend guards
  (`agent-trade-guards.js`) and the `agent_custody_events` ledger (category `mev_tip`), and
  respect the daily budget / kill switch. A tip must never bypass spend limits.
- Keep the hot path fast: estimates cached, single simulate, bounded retries.
- $THREE-only rule; synthetic placeholder mints in any fixtures.

## Success criteria

- Sniper + discretionary buys flow through `submitProtected`; on mainnet a buy can land via a
  real Jito bundle with a real tip, with graceful fallback on devnet.
- Execution telemetry (route/tip/fee/landed_ms) is persisted and shown in the UI.
- Tips are spend-guarded and audited; kill switch halts them.
- Build/typecheck/test clean. Changelog entry (tags: feature, improvement, infra).
  Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/02-mev-execution-engine.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
