# Task 07 — End-to-end devnet smoke: launch → buy → sell

**Priority:** HIGH (run LAST). **Depends on:** 01, 02, 03. **Type:** integration proof.
**Supersedes:** the empty `tasks/devnet-smoke-trade.md` stub.

## Goal

Prove the entire launchpad loop works against real on-chain state on **devnet**, with a funded
signer, for **both** a SOL-paired and a USDC-paired coin: launch a coin, buy it, sell it, confirm
each transaction on-chain, and verify every row lands in Postgres with correct quote columns.
This is the acceptance gate for Tasks 01–03 — nothing is "done" until this passes.

## Why this matters

Every other task touches the trade path. A unit test mocks the chain; this proves the real
prep → sign → broadcast → confirm pipeline against a real RPC, real pump SDK, real PDAs. Memory
notes the devnet smoke "awaits a funded signer" — getting one funded is part of this task.

## Context — read first

- `api/pump/[action].js` — `launch-prep`/`launch-confirm`, `buy-prep`/`buy-confirm`,
  `sell-prep`/`sell-confirm`, `launch-agent` (custodial).
- `api/_lib/pump.js`, `pump-launch.js`, `pump-swap-ix.js`, `pump-quote.js`.
- `SOLANA_RPC_URL_DEVNET`; devnet SOL faucet for the signer; devnet USDC for the USDC leg.
- `A2A_PAYER_PRIVATE_KEY` / existing demo wallets in `~/.config/x402-test-wallets/` (per memory)
  — reuse a funded signer rather than minting a new one if possible.
- Mints in fixtures: only `$THREE` CA or a synthetic `THREEsynthetic1111…` placeholder.

## Scope

1. **Funded signer.** Establish a devnet signer with SOL (faucet) and devnet USDC. Document how
   it's funded and where the key lives (never commit the key).
2. **Smoke script** under `scripts/` (not repo root — repo-hygiene rule), e.g.
   `scripts/pump-devnet-smoke.mjs`, that:
   - launches a SOL-paired coin via the real prep/confirm endpoints, signing locally;
   - buys then sells it; asserts on-chain confirmation and correct `pump_agent_trades` rows;
   - repeats for a USDC-paired coin (exercises Task 01 columns + Task 02/03 paths);
   - runs one custodial (agent-signed) buy/sell to cover Task 03;
   - prints a clear PASS/FAIL summary with tx signatures (explorer links).
3. **Idempotent / re-runnable** — no leftover state that breaks a second run.

## Definition of done

- [ ] Script runs against devnet and reports PASS for: SOL launch+buy+sell, USDC launch+buy+sell,
      custodial buy+sell. Real tx signatures shown.
- [ ] `pump_agent_trades` rows for the USDC legs carry correct `quote_mint`/`quote_symbol`/
      `quote_amount` (Task 01).
- [ ] Failures produce actionable output (which step, which signature, the RPC error).
- [ ] Script documented in `tasks/pumpfun-launchpad-100/` or a short `docs/` note: how to fund
      the signer and run it.
- [ ] No secret committed; signer key referenced from env / local config only.

## Out of scope

Mainnet execution. This is a devnet correctness proof.

## Deliverables / status (2026-06-15)

- **Script:** [`scripts/pump-devnet-smoke.mjs`](../../scripts/pump-devnet-smoke.mjs) — SOL + USDC +
  custodial launch→buy→sell over the real production helpers, signing locally, with Postgres
  record + quote-column assertions, an idempotent self-seeded test agent, a `--simulate-only`
  build proof, and a `PASS/FAIL/SKIP` summary with explorer links. Refuses mainnet RPC.
- **Runbook:** [`07-devnet-smoke-runbook.md`](07-devnet-smoke-runbook.md) — how to fund the signer
  (SOL faucet + devnet USDC) and run it.
- **Verified:** `--simulate-only` is **4/4 PASS** (all launch instructions build, compile to v0,
  and reach the whitelisted devnet program). Tasks 01/03 landed in commits `3ac9c6e9` + `870bb372`
  (quote columns wired into every INSERT site + custodial USDC); the `20260614000000_pump_trades_quote.sql`
  migration is applied. The **live broadcast + DB assertions are blocked only by devnet funding**
  (public airdrop 429; devnet USDC needs the Circle faucet) — re-run with a premium devnet RPC key
  or pre-funded keypair to complete the live legs.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/pumpfun-launchpad-100/07-devnet-smoke-trade.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
