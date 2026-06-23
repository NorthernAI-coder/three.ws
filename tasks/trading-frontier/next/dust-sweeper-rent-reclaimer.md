# Task — Dust Sweeper & Rent Reclaimer

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

An active sniper wallet accumulates a graveyard of dead/dust SPL token accounts — rugged coins,
worthless remainders — each one a 165-byte token account locking up ~0.002 SOL of rent. Over
hundreds of snipes that is real, recoverable money sitting idle. Build a **Dust Sweeper & Rent
Reclaimer**: detect every dust/dead holding (sub-threshold USD value or unpriceable), batch
`closeAccount` the empty ones to reclaim rent, and optionally dump-then-close the tiny non-zero ones
— all signed server-side through the same custody guards. A self-cleaning wallet that hands the
trader their locked SOL back.

## Context (real, verified)

- Holdings + token programs: `api/agents/solana-wallet.js#handleHoldings`; the existing two-phase
  sweep helper `sweepWalletToAddress` already builds `createCloseAccountInstruction` chunks and
  reclaims ATA rent (see the vanity-swap path in the same file) — reuse that machinery.
- Pricing to classify dust: `api/_lib/balances.js#solanaMintUsdPrice` (Jupiter → pump.fun fallback;
  0 = unpriceable/dead). Server signing + audit: `recoverSolanaAgentKeypair`,
  `agent_custody_events`, spend guards in `api/_lib/agent-trade-guards.js`.
- Token-account rent constant + close instruction already imported in `solana-wallet.js`.

## Goal

A dust-analysis service (`api/_lib/dust-sweeper.js`) + `/api/agents/:id/solana/dust` (GET analyze,
POST reclaim) that finds reclaimable token accounts, estimates the SOL recoverable, and executes a
guarded, audited batch close, surfaced in the wallet hub.

## What to build

1. **Dust detection** — classify each SPL holding as priceable / dust (USD below a threshold) /
   dead (zero or unpriceable); compute total reclaimable rent (closeable empty/dustable accounts)
   in SOL. Honest, never destructive to a holding the user values — require explicit selection.
2. **Guarded batch close** — POST executes a CSRF-protected, owner-authenticated, chunked close of
   the selected accounts (close empty; for tiny non-zero, sell-to-curve where liquid then close),
   reclaiming rent to the agent wallet; idempotent; every action audited in `agent_custody_events`.
3. **API** — GET returns the dust report (count, reclaimable SOL, per-account detail); POST returns
   signatures + reclaimed SOL. Rate-limited; simulate-first preview like the withdraw path.
4. **UI** — a Cleanup panel in the wallet hub: "X SOL reclaimable across N dead accounts" header, a
   selectable list with per-row value/liquidity, a preview, and a confirmed Reclaim action. All
   states designed (empty = "wallet is clean"); accessible; responsive.

## Constraints

- Destructive-adjacent: never close an account the user didn't explicitly select; preview before
  execute; full custody audit. Real on-chain only.
- All signing through existing custody guards/CSRF; idempotent; honest failure handling.
- $THREE-only rule; runtime mints are trade data only.

## Success criteria

- The sweeper correctly identifies reclaimable rent from real dead/dust accounts and executes a
  guarded, audited batch close that returns SOL to the wallet.
- Cleanup UI renders all states, accessible + responsive. Production-ready bar met; chain extended.
- Build/typecheck/test clean. Changelog entry (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/next/dust-sweeper-rent-reclaimer.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
