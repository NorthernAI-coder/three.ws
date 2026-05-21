# USE-24: Audit Logging — Every payment recorded

## Goal
Durable, queryable audit log of every payment event (verified, settled, failed, bypassed, refunded, expired) across all paid endpoints, transports, and schemes. Both server-side and client-side.

## Why
- Compliance, accounting, dispute resolution.
- Without this, claims like "I paid you" or "I never charged that" can't be verified.

## Reference
- Lifecycle hooks: [/tmp/x402-docs/docs/advanced-concepts/lifecycle-hooks.mdx](/tmp/x402-docs/docs/advanced-concepts/lifecycle-hooks.mdx)

## Dependencies
- USE-00, USE-01, USE-02

## Files to create
- `api/_lib/x402/audit-log.js` — wraps Postgres / Vercel Postgres for durable storage; falls back to append-only files in dev
- `api/_lib/x402/audit-events.js` — typed event constructors: `verified`, `settled`, `failed`, `bypassed`, `refunded`, `expired`
- `api/x402/audit/query.js` — admin-only query endpoint (auth required)
- `api/x402/audit/my-history.js` — buyer-facing endpoint (returns their own payments, SIWX-gated)

## Files to modify
- `api/_lib/x402/sdk.js` — install audit hooks on every resource server, facilitator client, and buyer client
- `api/_lib/x402/facilitator.js` — pipe `onCall` to audit
- `.env.example` — `POSTGRES_URL` (or `DATABASE_URL`)

## Implementation

### Event shape
Every event has: `id`, `timestamp`, `type`, `actor` (server/client/facilitator), `route`, `scheme`, `network`, `payer`, `payTo`, `amount`, `transaction?`, `errorReason?`, `extensions?`, `correlation_id` (request id for grouping).

### Hooks
```js
// Server
resourceServer.onAfterVerify(async (ctx) => audit.record(events.verified({ ctx })));
resourceServer.onAfterSettle(async (ctx) => audit.record(events.settled({ ctx })));
resourceServer.onSettleFailure(async (ctx) => audit.record(events.failed({ ctx })));
httpServer.onProtectedRequest(async (ctx) => /* on bypass */ audit.record(events.bypassed({ ctx })));

// Facilitator wrapper
facilitator.onCall = (info) => audit.record(events.facilitatorCall(info));

// Client
client.onAfterPaymentCreation(async (ctx) => audit.record(events.paymentSubmitted({ ctx })));
```

### Storage
Use Vercel Postgres in production. In dev, an SQLite file is fine. Schema:
```sql
CREATE TABLE x402_audit (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  route TEXT,
  scheme TEXT,
  network TEXT,
  payer TEXT,
  pay_to TEXT,
  amount TEXT,
  transaction TEXT,
  error_reason TEXT,
  extensions JSONB,
  correlation_id TEXT
);
CREATE INDEX ON x402_audit (payer, timestamp DESC);
CREATE INDEX ON x402_audit (transaction);
CREATE INDEX ON x402_audit (correlation_id);
```

### Buyer history endpoint
`/api/x402/audit/my-history` — SIWX-authenticated (USE-16). Returns the wallet's payments across all our endpoints.

### Admin query
`/api/x402/audit/query?from=...&to=...&type=...` — protected by `INTERNAL_API_KEY` (USE-23). Supports CSV export.

### Privacy
PII shouldn't enter audit logs. Only on-chain identifiers (addresses, tx hashes), amounts, and timestamps. No IP addresses, no user agents, no request bodies.

## Wiring checklist
- [ ] Hooks installed everywhere (server, client, facilitator wrapper, bypass path)
- [ ] Postgres provisioned in dev + prod
- [ ] Query endpoint protected
- [ ] Buyer history endpoint SIWX-gated
- [ ] No PII in event records

## Acceptance
- [ ] After running any paid flow, querying the audit log returns matching events
- [ ] `correlation_id` lets us trace a single request from `verify` → `settle` → `audit` → client `onAfterPaymentCreation`
- [ ] Buyer hitting `/api/x402/audit/my-history` with valid SIWX gets only their own records
- [ ] Admin query with `?type=failed&from=...` returns failed payments only
- [ ] Audit log survives Vercel function redeploys (durable, not in-memory)
