# 11 · Idempotency for external x402 flows

> **Phase 2 — Money safety** · **Depends on:** 10 · **Parallel-safe:** no (money logic) · **Effort:** M

## Mission
The internal Solana flow uses an idempotency cache, but `runExternalFlow` in `api/x402-pay.js`
**bypasses it entirely**. A network timeout mid-response on an external paid call can cause a
**double-charge** on retry. Bring external x402 flows under the same idempotency guarantee.

## Context (read first)
- `CLAUDE.md`.
- `api/x402-pay.js` `runExternalFlow` (~lines 541–680; the code already logs "status could not be confirmed" ~617–621 but offers no replay protection).
- `api/_lib/x402/idempotency-cache.js` (the existing internal guard — generalize it).
- Redis requirement + the fail-closed posture from prompt 09.

## Build this
1. **Idempotency key for external flows** — derive a stable key (payer + payTo + amount + asset + request fingerprint, or an explicit client-supplied `Idempotency-Key`). Before signing/sending, check the cache; on a confirmed prior result, return it instead of re-paying.
2. **Two-phase record** — mark "in-flight" before send, "settled"/"failed" after. A retry that finds "in-flight" must not re-send; it reconciles (poll/confirm) the original.
3. **Confirmation-after-timeout** — when send times out, attempt to confirm the original on-chain/with the facilitator before ever retrying; only retry if provably not landed.
4. **Generalize the cache** — refactor `idempotency-cache.js` so both internal and external flows share one implementation and one store (Redis-backed, with the prompt-09 fail-closed behavior).
5. **Tests** — same key twice → one charge; timeout-then-retry → reconcile, not double-send; concurrent duplicate requests → one settles. Add to gate.

## Files likely in play
`api/x402-pay.js`, `api/_lib/x402/idempotency-cache.js`, `api/_lib/x402/refund.js` (from prompt 10, for reconciliation), tests.

## Definition of done
- [ ] `runExternalFlow` is idempotent; duplicate/retried external payments charge exactly once.
- [ ] Timeout path reconciles before any retry; no blind re-send.
- [ ] One shared idempotency implementation for internal + external.
- [ ] Tests cover duplicate, timeout-retry, and concurrent-duplicate; added to `GATE_TESTS`.
- [ ] Changelog: **fix** entry (trust: "no more double-charges on flaky networks").

## Guardrails
Follow CLAUDE.md. Fail-closed if the idempotency store is unavailable (don't pay without it). $THREE/synthetic only in fixtures. Push both remotes.
