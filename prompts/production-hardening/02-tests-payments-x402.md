# 02 · Test the money path (x402, settlement, payments)

> **Phase 0 — Test confidence** · **Depends on:** 01 (gate machinery) · **Parallel-safe:** yes · **Effort:** L

## Mission
Money endpoints are the highest-risk, least-tested surface: 4 of 5 x402 payment endpoints have
zero tests, and none are in the deploy gate. Write deterministic, offline-safe unit/integration
tests that lock down payment correctness — happy path **and** the failure modes that lose or
double-charge money — then add them to the gate (prompt 01).

## Context (read first)
- `CLAUDE.md` (note: **$THREE is the only coin**; use the real CA or a synthetic `THREEsynthetic…` placeholder in fixtures — never a real third-party mint).
- Payment surface: `api/x402-pay.js`, `api/x402-checkout.js`, `api/x402-checkout-record.js`, `api/x402-merchant.js`, `api/x402-status.js`.
- Libs: `api/_lib/x402-spec.js` (facilitator), `api/_lib/x402-solana-confirm.js` (static tx decode), `api/_lib/evm-payment-verify.js`, `api/_lib/x402/idempotency-cache.js`, `api/_lib/x402-bsc-direct.js`, `api/_lib/solana/connection.js` (RPC failover).
- Existing patterns: `tests/api/x402.test.js`, `tests/solana-confirm.test.js`, `tests/agent-custody-guards.test.js`. Match their style (route-layer fixtures, real `Transaction` objects, deterministic — not client rewrites).

## What to cover (write tests for)
1. **x402-pay prepare/confirm** — valid payment → 200 + correct credit; missing/invalid payment payload → 402 with proper `accepts`; underpaid amount → reject; wrong recipient → reject; wrong mint → reject.
2. **Settlement vs delivery** — assert the *intended* ordering and that a post-settlement failure is detectable (this test will tighten once prompt 10 lands; encode the expected contract now).
3. **Idempotency** — same payment signature submitted twice credits once (internal Solana path via `idempotency-cache.js`); checkout double-record blocked by the unique `(sku_id, tx_signature)` index (`x402-checkout-record.js`).
4. **Solana static decode** — `x402-solana-confirm.js`: a signed SPL-Token transfer is validated **without** RPC; malformed/short tx → reject; transfer to wrong owner → reject.
5. **EVM verify** — `evm-payment-verify.js`: correct Transfer event/amount/confirmations passes; spoofed/insufficient → reject.
6. **RPC failover** — `solana/connection.js`: provider rotation + cooldown behavior under simulated endpoint failure (mock at the transport boundary only, not the verification logic).
7. **x402-checkout ATA probe** — `ataExists()` failing open is *intentional + idempotent*; assert the extra create-ATA instruction is idempotent and amounts/recipients are unchanged.

## Files likely in play
`tests/api/x402-pay.test.js` (new), `tests/api/x402-checkout.test.js` (new — extend existing `tests/x402-checkout-prepare.test.js` if present), `tests/api/x402-settlement.test.js` (new), `tests/api/evm-payment-verify.test.js` (new), `tests/api/solana-rpc-failover.test.js` (new). Add the deterministic ones to `GATE_TESTS`.

## Definition of done
- [ ] New tests pass under `vitest run`; deterministic across 3 reruns.
- [ ] Money-path happy + failure cases covered per the list above.
- [ ] Deterministic tests added to `scripts/test-gate.mjs` + `.vercelignore` (re-run `--audit`).
- [ ] No real third-party token addresses in fixtures; $THREE CA or synthetic placeholders only.
- [ ] No mocks of the verification logic itself — only the network transport boundary.
- [ ] Changelog: internal test work → **no** entry.

## Guardrails
Follow CLAUDE.md. If a test reveals a real money bug, **note it clearly in your final summary** and (if quick + safe) fix it; otherwise the dedicated Phase-2 prompt will. Push both remotes.
