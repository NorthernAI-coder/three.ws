# 14 · Payment reconciliation ledger + ops alerts

> **Phase 2 — Money safety** · **Depends on:** 10, 12 (share the table contracts) · **Parallel-safe:** yes · **Effort:** L

## Mission
There is **no reconciliation** between on-chain payment state and the DB, no refund audit, and no
early-warning on repeated settlement failures. A $1B platform must be able to answer, at any moment:
"who paid, what did they get, what's owed, and what's stuck?" Build a durable payment ledger plus a
reconciliation job and fraud/anomaly alerts.

## Context (read first)
- `CLAUDE.md`.
- Payment write paths: `api/x402-pay.js`, `api/x402-checkout-record.js` (unique `(sku_id, tx_signature)`), `api/_lib/x402-spec.js`, `api/_lib/x402-bsc-direct.js` (replay guard), `api/pump/[action].js`.
- Metrics sink already present: `api/_lib/axiom.js` (payment metrics). Ops alerts: `sendOpsAlert` + prompt 06 helper.
- The `x402_failed_deliveries` table from prompt 10.

## Build this
1. **Unified ledger** — a `payments_ledger` table capturing every money event (charge, settle, refund, failed-delivery, payout) with: rail, payer, payTo, amount, asset, tx ref, sku/agent, status, timestamps. All payment paths write to it (single helper, not scattered inserts).
2. **Reconciliation job** — a cron/worker that compares ledger entries to on-chain/facilitator truth: flags settled-but-not-delivered, delivered-but-not-settled, refunds owed, and orphaned txs. Emits a daily reconciliation report.
3. **Anomaly alerts** — real-time alert on: repeated settlement failures from one payer (fraud signal), refund spikes, daily-ceiling breaches (prompt 12), and any ledger row stuck > N minutes.
4. **Ops surface** — a minimal authenticated read (admin-gated, see `requireAdmin`) that lists open/stuck items for manual resolution; feeds the status/ops view.
5. **Tests** — ledger writes on each event; reconciliation correctly flags each mismatch class; alert fires on the fraud pattern.

## Files likely in play
`api/_lib/payments-ledger.js` (new), `api/_lib/migrations/*_payments_ledger.sql` (new), a reconciliation worker/cron (`workers/` or a scheduled function), `api/_lib/axiom.js` (metric hooks), admin read endpoint, tests.

## Definition of done
- [ ] Every money event writes to one ledger via one helper.
- [ ] Reconciliation job flags all mismatch classes + emits a daily report.
- [ ] Anomaly alerts wired (fraud, refund spike, stuck rows, ceiling breach).
- [ ] Admin-gated ops read of open items.
- [ ] Tests cover writes, reconciliation, and an alert path.
- [ ] Changelog: internal/ops → **no** entry (unless an admin-visible page is added → **feature**).

## Guardrails
Follow CLAUDE.md. Admin endpoints must use `requireAdmin`. $THREE/synthetic only in fixtures. Don't log full secrets/keys in the ledger. Push both remotes.
