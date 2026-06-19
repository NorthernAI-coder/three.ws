# Task 05 — Multi-Chain Agent Treasury & Bridge

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

Agents already have BOTH an EVM wallet and a Solana wallet (`api/_lib/agent-wallet.js`), and
ERC-8004 identity spans 15+ chains (`api/_lib/onchain.js`). But the trading life is Solana-locked
and capital is stranded per chain. Build a **unified multi-chain treasury**: one view of the
agent's balances across every chain, and real **bridging** so a user can move USDC/SOL/ETH into the
Solana trading wallet (or back out) in a couple of clicks, with the agent picking a safe route. An
AI agent with a single cross-chain treasury that funds its own trading — a genuinely new primitive.

## Context (real, verified)

- Dual custodial wallets: `api/_lib/agent-wallet.js` (`getOrCreateAgentEvmWallet`,
  `getOrCreateAgentSolanaWallet`, `provisionAgentWallets`, encryption v2 HKDF+AES-GCM).
- Multi-chain identity + RPCs: `api/_lib/onchain.js` (`SERVER_CHAIN_META`, 15 mainnets + 6
  testnets). EVM signing patterns + balances live in the on-chain + agent-payments paths.
- Solana side: `api/agents/solana-wallet.js` (balances, withdraw), USDC mints per cluster.
- Withdraw/custody discipline + audit: `api/_lib/agent-trade-guards.js`, `agent_custody_events`.
- A real bridge API (e.g. a reputable cross-chain bridge/aggregator with a public API) — integrate
  one real provider; never simulate a bridge. Add its config to env, document required keys.

## Goal

A multi-chain balance service + a real bridge integration so funds can move into/out of the Solana
trading wallet across chains, with quotes, route selection, status tracking, and full custody audit.

## What to build

1. **Unified balance service** — `api/_lib/treasury.js` enumerating the agent's native + USDC (and
   key token) balances across its EVM chains + Solana, valued in USD via real price feeds. Cached;
   honest on per-chain RPC failure (show that chain as degraded, not zero).
2. **Bridge integration** — integrate one real bridge/aggregator API: quote a transfer (source
   chain/asset → Solana wallet), show fees + ETA + route, execute by signing from the agent's
   custodial wallet on the source chain, and track status to completion. Both directions (top-up
   the trading wallet; sweep profits out). Idempotent; audited in `agent_custody_events` (category
   `bridge`); spend-guarded where applicable.
3. **Safety** — validate destination, enforce the withdraw allowlist for outbound bridges, respect
   kill switch + limits, and never proceed on an ambiguous/failed quote. Clear handling of the
   inherently async, occasionally-stuck nature of bridges (status polling, recovery guidance).
4. **API + UI** — `/api/agents/:id/treasury` (cross-chain balances), `/api/agents/:id/bridge`
   (quote, execute, status). Build a **Treasury** surface in the wallet hub: a cross-chain balance
   board (per chain, valued), a bridge flow (pick source → quote → confirm → live status with
   explorer links), and an outbound sweep. All states designed (including a "bridge pending /
   delayed" state); accessible; responsive.

## Constraints

- Real bridge + real on-chain txs only — never fake a bridge transfer or a balance. If the bridge
  API is unavailable, the UI says so and offers no fake path.
- Custodial keys never leave the server; outbound bridges honor the allowlist + spend guards.
- $THREE remains the only coin referenced in copy; bridged assets (USDC/SOL/ETH) are functional
  plumbing, not promotions, and no non-$THREE token is ever recommended.

## Success criteria

- Cross-chain balances render live and valued; a real bridge top-up into the Solana wallet
  completes and is audited; an outbound sweep respects the allowlist.
- Bridge flow handles async/stuck states honestly with explorer links. Production-ready bar met;
  chain extended. Build/typecheck/test clean. Changelog (tags: feature). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file (after authoring + registering 10 chained prompts)

```bash
git rm "tasks/trading-frontier/05-multichain-agent-treasury.md"
```
A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
