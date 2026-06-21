# 10 · Settlement↔delivery atomicity + refund path

> **Phase 2 — Money safety** · **Depends on:** 02 (tests), 14 (ledger — can land together) · **Parallel-safe:** no (core money logic) · **Effort:** L

## Mission
**Highest-priority money bug.** In `api/x402-pay.js`, settlement happens *after* MCP dispatch: if a
tool executes but fails before returning a result, the **payment is confirmed but no service is
delivered**, and there is **no refund path**. At volume this is unreconciled customer loss. Make
pay→deliver atomic-enough that every confirmed payment either delivers or refunds, and every
exception is recorded for reconciliation.

## Context (read first)
- `CLAUDE.md` ($THREE only; no shortcuts on money).
- `api/x402-pay.js` (~lines 790–832 settle-vs-dispatch ordering; lines 541–680 `runExternalFlow`).
- `api/_lib/x402-spec.js` (`settlePayment`, facilitator), `api/_lib/x402/idempotency-cache.js`.
- Reconciliation ledger from prompt 14 (build the table contract together if running them in sequence).

## Build this
1. **Order of operations** — settle only after the deliverable is secured, OR capture-then-settle: verify payment authorization → execute/deliver → settle. Where the deliverable can fail after an irreversible settlement, you MUST have a refund.
2. **Refund path** — implement `refundPayment(...)` for each rail (Solana SPL transfer back; EVM/BSC equivalent) that returns funds to the payer and records the refund. Trigger it automatically when delivery fails after settlement.
3. **Failed-delivery record** — write every "paid but not delivered (yet)" event to a durable table (`x402_failed_deliveries`: tx, sku, payer, amount, reason, refunded_at). This is the source of truth for ops + the ledger (prompt 14).
4. **Idempotent retries** — a delivery that times out but later succeeds must not double-charge or double-deliver; reconcile via the idempotency cache + the failed-delivery table.
5. **Tests** — simulate: dispatch throws after settle → refund issued + recorded; refund itself fails → flagged for manual reconciliation + alert; happy path unaffected. Add to gate.

## Files likely in play
`api/x402-pay.js`, `api/_lib/x402-spec.js`, `api/_lib/x402/refund.js` (new), `api/_lib/migrations/*_x402_failed_deliveries.sql` (new), `api/_lib/x402/idempotency-cache.js`, tests.

## Definition of done
- [ ] Every confirmed payment provably delivers or refunds; no settle-then-silently-fail path remains.
- [ ] `x402_failed_deliveries` table + migration; populated on failure, cleared on refund/redelivery.
- [ ] Refund implemented and tested per rail; refund failure alerts (via prompt 06 helper).
- [ ] Tests cover the loss scenario + idempotent retry; added to `GATE_TESTS`.
- [ ] Changelog: **fix** entry (user-visible trust: "payments that don't deliver are now auto-refunded").

## Guardrails
Follow CLAUDE.md. This is real money — be conservative, fail-closed, and over-record. Use $THREE CA or synthetic placeholders in tests. Push both remotes.
