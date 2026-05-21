# USE-15: Payment Identifier — Idempotency

## Goal
Wire the `payment-identifier` extension on every paid endpoint and every buyer client. Server caches responses keyed by `paymentId`. Same `paymentId` within TTL returns cached response without re-charging.

## Why
- Network flakiness causes legitimate retries. Without idempotency, every retry double-charges.
- Required for trustworthy production usage (USE-29..40).

## Reference
- Docs: [/tmp/x402-docs/docs/extensions/payment-identifier.mdx](/tmp/x402-docs/docs/extensions/payment-identifier.mdx)
- Spec: [/tmp/x402-docs/specs/extensions/payment_identifier.md](/tmp/x402-docs/specs/extensions/payment_identifier.md)

## Dependencies
- USE-00, USE-02 (or any seller), USE-06 (or any buyer)
- USE-05 dependency (Redis) is reused for the cache store

## Files to create
- `api/_lib/x402/idempotency-cache.js` — Redis-backed cache: `get(id)`, `set(id, payload, ttlSec)`
- `api/_lib/x402/payment-identifier-server.js` — hooks `onProtectedRequest` to check cache; `onAfterSettle` to write cache
- `api/_lib/x402/payment-identifier-client.js` — adds `paymentId` to outgoing payloads when server declares support

## Files to modify
- Every paid endpoint: declare `payment-identifier` extension in route config
- Every buyer client init: install the client hook
- `.env.example` — `X402_IDEMPOTENCY_TTL_SECONDS` (default 3600)

## Implementation

### Server
```js
import { declarePaymentIdentifierExtension, PAYMENT_IDENTIFIER, extractPaymentIdentifier } from "@x402/extensions/payment-identifier";

// In route config
extensions: { [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(false) }

// On resource server
resourceServer.onAfterSettle(async ({ paymentPayload, settlementResponse, response }) => {
  const id = extractPaymentIdentifier(paymentPayload);
  if (id) await idempotencyCache.set(id, { settlementResponse, body: response.body }, TTL);
});

httpServer.onProtectedRequest(async (context) => {
  if (!context.paymentHeader) return;
  const payload = decodePayload(context.paymentHeader);
  const id = extractPaymentIdentifier(payload);
  if (!id) return;
  const cached = await idempotencyCache.get(id);
  if (cached) return { grantAccess: true, cachedResponse: cached };
});
```

### Client
```js
import { generatePaymentId, appendPaymentIdentifierToExtensions } from "@x402/extensions/payment-identifier";

client.onBeforePaymentCreation(async ({ paymentRequired, requestContext }) => {
  if (!paymentRequired.extensions) return;
  // Use a stable id per logical request; if caller didn't supply one, generate per-call
  const id = requestContext.paymentId ?? generatePaymentId();
  appendPaymentIdentifierToExtensions(paymentRequired.extensions, id);
});
```

### Per-call payment IDs
Wrappers expose an option `{ paymentId: "order_xyz" }` so caller code can pass a stable ID across retries. For browser flows, derive ID from `requestId` stored in `sessionStorage`.

### Required vs optional
Default optional. Where critical (USE-32 fact-checker, USE-30 oracle), set `declarePaymentIdentifierExtension(true)` so caller MUST provide an ID.

### Cache hygiene
- Hash the payload alongside the ID. If same ID + different payload arrives, return `409 Conflict` (per docs).
- TTL configurable per route (default 3600s).

## Wiring checklist
- [ ] Redis cache live in dev + prod
- [ ] Every paid endpoint declares the extension (optional by default; required where called out)
- [ ] Buyer wrappers accept optional `paymentId` and generate one when omitted
- [ ] 409 returned on ID collision with different payload

## Acceptance
- [ ] First call processes payment, returns 200 with body. Cache populated.
- [ ] Second call with same `paymentId` returns same body, NO on-chain settlement (verified by checking facilitator logs)
- [ ] Same `paymentId` + different body → 409
- [ ] Cache eviction after TTL — subsequent same-ID call re-processes
