# Task 10 — Payments integrity: idempotency, reconciliation, refunds, audit

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track D —
> Reliability.** The most consequential reliability task — it's real money. Coordinate with
> `08` (checkout), `09` (facilitator resilience), `11` (caps).

## The thesis

Nothing erodes trust — or a valuation — faster than charging someone twice, or charging them
and not delivering. three.ws's x402 stack is solid but has integrity gaps: idempotency is
opt-in per endpoint and missing on several, settlement can fail after verify succeeds with no
reconciliation, there's no refund path when a paid generation fails, and the audit log can't
be queried by transaction. A $1B payments surface closes every one of these.

## What exists today (read first)

- **Paid-endpoint core** — [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js):
  supports a payment-identifier (idempotency) extension, but it's **optional per endpoint**.
  `api/x402/forge.js` and `api/x402/pump-launch.js` use it; **`api/x402/vanity.js` and
  `api/x402/dance-tip.js` do not** — a timeout between verify and settle can double-charge.
- **Verify/settle** — [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js): `verifyPayment()` /
  `settlePayment()` call the facilitator; if settle fails after verify succeeds, the handler
  500s while the buyer may be charged — and there's **no reconciliation job**.
- **Idempotency cache** — [api/_lib/x402/idempotency-cache.js](../../api/_lib/x402/idempotency-cache.js):
  no lock, so two concurrent requests with the same paymentId can both miss and settle twice.
- **Audit log** — [api/_lib/x402/audit-log.js](../../api/_lib/x402/audit-log.js): stores events
  but offers no query-by-transaction API, so reconciliation is manual.

## What to build

1. **Idempotency everywhere.** Make the payment-identifier path **mandatory** for every paid
   endpoint (verify → settle keyed on a stable payment id). Add it to the endpoints missing it
   (`vanity`, `dance-tip`, and any others you find). A retried request returns the original
   result, never a second charge.
2. **Concurrency-safe settlement.** Add a real lock (Redis SETNX/lease or equivalent) around
   settle keyed by payment id so parallel requests can't both settle. Handle lock
   acquisition/expiry cleanly.
3. **Settlement reconciliation job.** A cron (under `api/cron/`, hardened per `13`) that finds
   payments stuck in "verified-but-not-settled" (or settled-but-not-fulfilled) and resolves
   them — completes settlement, fulfills, or flags for refund. Idempotent and observable (`12`).
4. **Refund / credit-back path.** When a paid action fails *after* settlement (provider 5xx,
   RPC error), trigger a real refund or platform credit-back through a defined mechanism — not
   manual ops. Record it in the ledger and notify the buyer
   ([api/_lib/notify.js](../../api/_lib/notify.js) / email).
5. **Queryable audit.** Add an owner/admin endpoint to query settlement/audit events by
   transaction id and by buyer, so any charge can be traced end-to-end.

## Hard rules specific to this task

- **Real funds, real chain.** Every verify/settle/refund hits the real facilitator/chain. No
  simulated settlement, no fake refund. Test with synthetic placeholders, never a real
  third-party mint (**$THREE** CA or `THREEsynthetic1111…` only).
- Preserve the verify→grind/generate→settle ordering where the endpoint depends on it.
- Don't retry settlement in a way that can double-settle — that's the whole point; coordinate
  with `09`'s retry policy (settlement is non-idempotent unless keyed + locked).

## Definition of done

README DoD, plus: every paid endpoint enforces idempotency (a replayed payment returns the
original result, no second charge); concurrent same-id settles are serialized; the
reconciliation cron resolves stuck payments; a post-settlement failure produces a real refund
+ buyer notification; audit is queryable by tx. Vitest covers double-charge prevention, the
concurrency lock, and the reconciliation logic. Changelog (`security`/`fix`). Self-review,
then harden the next-weakest payment path.

Delete this file when done.
