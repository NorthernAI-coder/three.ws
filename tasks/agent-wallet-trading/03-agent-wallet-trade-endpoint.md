# Task: Authenticated "trade from the agent wallet" endpoint + shared guardrail module

## Context

Pump.fun trading is real, but the product path is **user-signed**: the client
provides `wallet_address`, the user signs with their own external wallet, and the
server only verifies the signature after the fact
(`api/pump/[action].js` buy/sell prep+confirm, verify-after-sign at `:524`). The
**only** code that signs a pump.fun trade from the agent's own custodial wallet is
the sniper worker (`workers/agent-sniper/executor.js`), which loads the agent
keypair (`keys.js:25` → `agent_identities.meta.encrypted_solana_secret`), builds
buy/sell instructions (`api/_lib/pump.js:130`, `api/_lib/pump-swap-ix.js`), signs a
v0 tx (`trade-client.js:29`), and enforces serious guardrails first
(`executor.js:51-85`: idempotency lock, daily budget, per-trade cap, concurrency,
price-impact breaker, SOL fee headroom).

For the user's flow — fund the agent wallet, then have the agent trade from it —
we need that same custodial signing exposed as an authenticated, owner-only API,
with the guardrails shared (not duplicated) between this discretionary path and the
sniper. This is the security-critical core of the epic.

## Goal

`POST /api/agents/:id/trade` (owner-authenticated) that buys/sells a pump.fun token
**from the agent's own wallet**, server-signed, reusing the exact instruction
builders and a **shared guardrail module** extracted from the sniper executor.
Real on-chain execution, idempotent, fully guarded, audit-logged.

## Files to Read First

- `workers/agent-sniper/executor.js:46-206` — `executeBuy`/`executeSell`, guardrail
  sequence (`:51-85`), idempotency `INSERT…ON CONFLICT`, PnL recording, graduation
  catch (`:161`)
- `workers/agent-sniper/keys.js:25-45` — agent keypair loading (TTL cache)
- `workers/agent-sniper/trade-client.js:29-60` — `signAndSend` v0 tx flow
- `api/_lib/pump.js:130-137`, `api/_lib/pump-swap-ix.js` — buy/sell instruction builders
- `api/pump/[action].js` — existing buy/sell prep+confirm, slippage handling,
  fee-recipient routing, quote helpers (reuse, don't re-derive)
- `api/_lib/agent-wallet.js:419` — `recoverSolanaAgentKeypair` (the only decrypt path)
- `api/_lib/agent-pumpfun.js:26` — RPC failover connection
- Auth helper used elsewhere (`requireAuth`) and the audit-log helper used by
  `recoverSolanaAgentKeypair`

## What to Build / Do

1. **Extract a shared guardrail module** (e.g. `api/_lib/agent-trade-guards.js`)
   from `workers/agent-sniper/executor.js`: idempotency lock, per-trade lamport cap,
   daily budget, max-concurrent, price-impact circuit breaker, SOL fee headroom,
   kill switch, wallet-balance check. The sniper executor and the new endpoint must
   **both** call this module — one source of truth for "is this trade allowed."
   Refactor the sniper to use it (no behavior change; its tests still pass).
2. **`POST /api/agents/:id/trade`**: owner-authenticated (`requireAuth` + ownership
   check). Body: `{ side: 'buy'|'sell', mint, amount, denom: 'sol'|'token',
   slippageBps, network }`. Flow: `ensureAgentWallet` (task 01) → recover keypair
   (audit-logged) → quote → run shared guards → build instructions
   (`api/_lib/pump.js` / `pump-swap-ix.js`) → `signAndSend` → record the trade
   (reuse the sniper's position/trade ledger tables or the existing `pump_agent_*`
   tables — pick the one the sniper UI/PnL already reads so history is unified) →
   return signature + filled amounts + new balance.
3. **Idempotency + safety**: require a client-supplied idempotency key (or derive
   one) so a retried request never double-spends. Enforce the same daily/per-trade
   caps as the sniper (configurable per agent). Never execute if guards reject —
   return a structured, actionable error (reason + limit), never a 500.
4. **A read endpoint** (or extend an existing one) for the agent's discretionary
   trade quote/preview so the UI (task 04) can show expected out, price impact, and
   fees before the user confirms.

## Constraints

- The agent keypair is decrypted only via `recoverSolanaAgentKeypair`
  (`api/_lib/agent-wallet.js:419`), only server-side, only after auth + ownership,
  always audit-logged. Never return or log the secret.
- No duplicated guardrail logic — the shared module is the single source of truth;
  the sniper must be refactored to consume it in the same change (or a clearly
  preceding one) and its tests must still pass.
- Real quotes and real submission only. Honor `SNIPER_MODE`/a `simulate` flag so the
  endpoint can run in paper mode for tests, but production default is live execution
  against real RPC. No fabricated fills.
- Errors handled at the boundary (auth, input, RPC, guard rejection, graduation) and
  returned as structured JSON with a recovery hint. A guard rejection is a 4xx with
  the reason, not an exception.
- Respect the graduation case: if the mint has graduated, route the sell through the
  AMM path (coordinate with task 07) rather than throwing.

## Success Criteria

- `POST /api/agents/:id/trade` buys and sells a pump.fun token from the agent's own
  wallet on devnet, returns a confirmed signature, and the new balance reflects the
  trade.
- The shared guardrail module is used by both the endpoint and the sniper; sniper
  tests still pass; `git grep` shows no second copy of the cap/breaker logic.
- Retrying the same idempotency key does not double-execute.
- Guard rejections (over budget, over per-trade cap, price-impact breaker, kill
  switch, insufficient balance) each return a clear 4xx with reason — verified with
  unit tests.
- Unauthenticated or non-owner callers are rejected; no secret ever appears in a
  response or log.
- `npm run typecheck` + `npm test` clean. Changelog entry (tag: feature). Run the
  **completionist** subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/03-agent-wallet-trade-endpoint.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
