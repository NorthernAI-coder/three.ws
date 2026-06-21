# 24 — Wallets & payments (x402, agent wallets, USDC, pay-by-name)

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Surface completeness
**Owns:** `api/_lib/agent-wallet.js`, `api/x402/` (incl. `api/x402/pay-by-name.js`), `agent-payments-sdk/`, SNS pay-by-name, the send/fund/trade flows.
**Depends on:** Phase 0–1, 07 (security), 08 (limits).  ·  **Parallel-safe with:** 18–23.

## Why this matters for $1B
This is the money layer — agent wallets, x402 paid calls, USDC transfers, pay-by-name.
It custodies funds and moves value. One authz or rounding bug is an existential event.
It is also the differentiator: agents that can earn and spend autonomously.

## Mission
Make every wallet and payment path correct, owner-authorized, idempotent, and clearly
presented — across x402, USDC sends, funding, trading, and pay-by-name.

## Do this
1. **Ownership:** confirm the one-agent-one-owner model (immutable `user_id`); only the
   owner can withdraw, set limits, or rebrand. Audit every wallet-mutating endpoint
   server-side (ties prompt 07).
2. **x402:** paid-endpoint flow (`api/x402/`, `api/_lib/x402-paid-endpoint.js`) returns
   correct 402 challenges and settles real USDC; verify discovery/indexing still works
   (CDP Bazaar / x402scan). Pay-by-name (`api/x402/pay-by-name.js`, `*.threews.sol`)
   resolves and pays the right address.
3. **Transfers/funding/trading:** the send-usdc, fund, and trade flows complete with
   real balances; amount bounds + idempotency keys prevent double-spend; prices are
   recomputed server-side.
4. **SDK:** `agent-payments-sdk/` builds and its public API matches the live endpoints
   (ties prompt 25).
5. **UX:** designed states for insufficient balance, network failure mid-transfer,
   pending/confirmed; clear receipts; never a silent money failure.

## Must-not
- No client-trusted identity, amount, or price on any money path.
- No transfer/mint without idempotency; no leaking keys to logs (prompt 05).

## Acceptance
- [ ] Owner-only mutations enforced; x402 + pay-by-name + send/fund/trade verified with real funds (or testnet where appropriate).
- [ ] Idempotency + server-side price recomputation + amount bounds in place; states designed.
- [ ] `npm test` green; changelog `feature`/`security` entry.
