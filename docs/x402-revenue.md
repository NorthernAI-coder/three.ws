# x402 Revenue & Receipts

Every time someone pays one of three.ws's [paid endpoints](x402-endpoints.md), the
settlement is recorded. This page is the reference for **where that money is
recorded**, how to read endpoint revenue, and how the durable receipt is issued to
the buyer.

> Source: settlement persistence
> [`api/_lib/x402/audit-log.js`](../api/_lib/x402/audit-log.js), receipt storage
> [`api/_lib/x402/receipt-storage.js`](../api/_lib/x402/receipt-storage.js),
> revenue report [`api/_lib/x402/revenue-analytics.js`](../api/_lib/x402/revenue-analytics.js),
> served by [`api/x402/analytics.js`](../api/x402/analytics.js).

---

## Two directions of money — don't confuse them

three.ws records value moving in **two opposite directions**, in two different
tables. They never overlap, and mixing them up will double-count your numbers.

| Direction | Meaning | Table | Surfaced by |
|---|---|---|---|
| **Revenue IN** | Money paid **to** our endpoints for using them | `x402_audit_log` | `/api/x402/analytics?report=revenue` (this page) |
| **Spend OUT** | Money an agent's wallet **paid out** (tips, trades, agent-to-agent x402) | `agent_custody_events` | The [Money Pulse](money-feed.md) at `/api/pulse` |

The [Money Pulse](money-feed.md) shows the agent economy — one agent paying
another, tips, launches. **This page is the other side of the ledger:** the
platform's own endpoint revenue. A call to `/api/x402/token-intel` writes a
**revenue** row in `x402_audit_log`; it is not an `agent_custody_events` spend and
does not appear in the Money Pulse.

---

## The settlement flow

When a buyer pays a paid endpoint, the shared handler
([`api/_lib/x402-paid-endpoint.js`](../api/_lib/x402-paid-endpoint.js)) runs:

1. **Challenge** — no `X-PAYMENT` header → respond `402 Payment Required` with the
   accepted networks, asset, price, and pay-to address.
2. **Verify** — the buyer retries with an `X-PAYMENT` header; the facilitator's
   `/verify` confirms the signed payment matches the requirement
   ([`api/_lib/x402-spec.js`](../api/_lib/x402-spec.js) `verifyPayment()`).
3. **Settle** — the facilitator's `/settle` (or, for BSC, a direct on-chain
   `pay(bytes32)` contract call) moves the USDC (`settlePayment()`).
4. **Persist** — `logPaymentEvent()` writes one row to `x402_audit_log`, and a
   signed receipt is stored in `x402_receipts`.
5. **Run + respond** — the endpoint logic executes and returns the result.

Steps 4's writes are fire-and-forget (`queueMicrotask`) with a connection-level
retry, so a transient DB blip never silently drops a settled payment.

---

## The revenue ledger — `x402_audit_log`

This is the **single source of truth for money flowing through our endpoints.**
Every payment event lands here — settled, failed, and access-control events alike.

```sql
CREATE TABLE x402_audit_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type           TEXT NOT NULL,   -- 'payment_settled' | 'payment_failed'
                                         -- | 'siwx_grant' | 'siwx_access' | 'bypass_granted'
  route                TEXT NOT NULL,    -- e.g. '/api/x402/token-intel'
  resource_url         TEXT,
  payer                TEXT,             -- wallet address
  network              TEXT,             -- e.g. 'solana' | 'base' | 'bsc'
  amount_atomics       TEXT,             -- USDC atomics (6 decimals): '10000' = $0.01
  asset                TEXT,
  tx_hash              TEXT,
  settlement_status    TEXT,             -- 'success' | 'failed'
  facilitator_response JSONB,
  duration_ms          INTEGER,
  ip_address           TEXT,
  user_agent           TEXT,
  metadata             JSONB,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
```

Schema:
[`api/_lib/migrations/2026-05-27-x402-audit-log.sql`](../api/_lib/migrations/2026-05-27-x402-audit-log.sql).
Filter `event_type = 'payment_settled'` for revenue; `amount_atomics` is USDC at 6
decimals, so divide by `1e6` for dollars.

### Reading revenue directly

Total settled revenue and unique payers over the last 24h:

```sql
SELECT
  count(*)                                  AS payments,
  count(DISTINCT payer)                     AS unique_payers,
  sum((amount_atomics)::numeric / 1e6)      AS gross_usd
FROM x402_audit_log
WHERE event_type = 'payment_settled'
  AND created_at >= now() - interval '24 hours';
```

Revenue by endpoint, last 7 days, top 10:

```sql
SELECT
  route,
  count(*)                              AS calls,
  sum((amount_atomics)::numeric / 1e6)  AS gross_usd
FROM x402_audit_log
WHERE event_type = 'payment_settled'
  AND created_at >= now() - interval '7 days'
GROUP BY route
ORDER BY gross_usd DESC
LIMIT 10;
```

---

## The revenue report — `/api/x402/analytics`

You don't have to query SQL. The `analytics` endpoint serves the same numbers,
pre-aggregated. It is itself a [paid endpoint](x402-endpoints.md) ($0.005 default)
— pass `report=revenue` and a `period`:

```bash
# After settling the 402 challenge (see the x402 buyer client doc), retry with:
curl -s "https://three.ws/api/x402/analytics?report=revenue&period=24h" \
  -H "X-PAYMENT: <settled-payment-header>"
```

`report` accepts: `revenue`, `x402_volume`, `clubs`, `marketplace`,
`agent_leaderboard`, `sniper_trades`, `user_activity`. `period` accepts `1h`,
`6h`, `24h`, `7d`, `30d`, `all`.

The `revenue` report shape
([`revenue-analytics.js`](../api/_lib/x402/revenue-analytics.js)):

```json
{
  "report": "revenue",
  "period": "24h",
  "since": "2026-06-29T00:00:00.000Z",
  "generated_at": "2026-06-30T00:00:00.000Z",
  "totals": {
    "gross_usd": 12.34,
    "net_platform_usd": 11.90,
    "settlement_fee_usd": 0.44,
    "total_payments": 247,
    "failed_payments": 3,
    "unique_payers": 18,
    "avg_payment_usd": 0.05
  },
  "fee_splits": {
    "gross_usd": 12.34,
    "settlement_fee_usd": 0.44,
    "net_platform_usd": 11.90,
    "effective_fee_rate": 0.0357,
    "fee_per_settlement_usd": 0.0018,
    "fee_source": "..."
  },
  "by_endpoint": [
    { "endpoint": "/api/x402/token-intel", "count": 120, "gross_usd": 1.20, "share": 0.097 }
  ],
  "top_endpoint": { "endpoint": "/api/x402/token-intel", "gross_usd": 1.20 }
}
```

`net_platform_usd` is gross minus the estimated on-chain settlement fee — what the
platform actually keeps. `failed_payments` counts `event_type = 'payment_failed'`
rows in the same window, so you can watch the settlement success rate.

---

## Receipts — `x402_receipts`

Each successful settlement also issues the buyer a durable, signed receipt
([`receipt-storage.js`](../api/_lib/x402/receipt-storage.js)):

```sql
CREATE TABLE x402_receipts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer        text        NOT NULL,   -- buyer wallet
  network      text        NOT NULL,
  resource_url text        NOT NULL,   -- what they paid for
  format       text        NOT NULL,
  receipt      jsonb       NOT NULL,   -- the signed receipt artifact
  transaction  text,                   -- settlement tx
  issued_at    timestamptz NOT NULL DEFAULT now()
);
```

A buyer reads **their own** receipts at
[`/api/x402/my-receipts`](x402-endpoints.md) — that endpoint is free but gated by
a wallet signature (SIWX), so a buyer proves ownership of the `payer` address
rather than paying again.

### Anti-replay — `bsc_consumed_tx`

For BSC direct-scheme settlements (where there is no facilitator and the buyer
pays the `ThreeWSPayments` contract directly), each on-chain `Payment` tx is
recorded in `bsc_consumed_tx` (`tx_hash` primary key) the first time it is spent,
so the same on-chain payment can never be replayed against two requests.

---

## Driving volume through these endpoints

Revenue only exists if the endpoints get called. The
[Autonomous x402 loop](autonomous-x402.md) is the scheduled buyer that pays many
of these endpoints on a cadence to feed the oracle and sniper, and the
[Circulation engine](circulation-engine.md) drives real agent-to-agent commerce.
Both settle **real** USDC through the same flow above — every row in
`x402_audit_log` is a verifiable settlement, never a synthetic number.

---

## Related

- [x402 paid endpoints](x402-endpoints.md) — the catalog of what charges and how much.
- [x402 protocol](x402.md) — the challenge / verify / settle mechanics.
- [x402 buyer client](x402-buyer.md) — how to settle a 402 challenge in code.
- [Autonomous x402 loop](autonomous-x402.md) — the scheduled buyer that drives volume.
- [Money feed](money-feed.md) — the agent-spend side of the ledger (the Money Pulse), distinct from endpoint revenue.
