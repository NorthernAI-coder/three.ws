# USE-25: Idempotency Cache — Combined client + server

## Goal
End-to-end idempotency: client generates stable `paymentId` per logical operation (with persistence across retries and restarts), server caches responses keyed by that ID. Survives network failures, process crashes, multi-instance deploys.

## Why
- USE-15 wires the protocol. USE-25 makes it production-correct: persistent IDs, persistent cache, conflict detection.

## Reference
- Same as USE-15

## Dependencies
- USE-15 (extension wired)
- USE-05 (Redis available)

## Files to create
- `api/_lib/x402/idempotency-policy.js` — per-route policy: optional / required / strict (rejects on missing)
- `api/_lib/x402/payment-id-store.js` — client-side ID persistence (browser localStorage, Node JSON file, Redis for serverless)

## Files to modify
- `api/_lib/x402/payment-identifier-server.js` (from USE-15) — add payload hash comparison for `409 Conflict`
- `api/_lib/x402/payment-identifier-client.js` (from USE-15) — persist ID before sending payment payload

## Implementation

### Client-side persistence
```js
const idStore = createPaymentIdStore({ backend: "redis" | "file" | "localstorage" });

async function payWithIdempotency(url, options = {}) {
  const logicalKey = options.logicalKey ?? `${url}#${hash(options)}`;
  let id = await idStore.get(logicalKey);
  if (!id) {
    id = generatePaymentId();
    await idStore.set(logicalKey, id);
  }
  return fetchWithPayment(url, { ...options, paymentId: id });
}
```

### Conflict detection
Server hashes the incoming payload (excluding signature/extensions) and stores hash alongside the cached response. On retry:
- Same id + same hash → return cached
- Same id + different hash → 409 Conflict

### Multi-instance safety
Use Redis SETNX for first-write-wins on cache. Concurrent retries don't double-charge:
```js
const inserted = await redis.setNX(`cache:${id}:lock`, "1", "EX", 10);
if (!inserted) {
  // Another instance is processing this id; wait for cache
  await waitForCache(id, 10_000);
  return cached;
}
// proceed with payment, write cache, release lock
```

### TTL policy
- Default: 1 hour
- Strict routes (`USE-30` oracle, `USE-32` fact-checker): 24 hours
- Configurable per route

### Cleanup
Cache entries auto-expire via Redis TTL. No manual cleanup needed.

## Wiring checklist
- [ ] Client ID persistence works across browser reloads
- [ ] Client ID persistence works across Node process restarts
- [ ] Multi-instance Vercel deployment: same payment ID from concurrent instances → single payment, both get cached response
- [ ] Conflict detection: same ID + different payload → 409
- [ ] Per-route TTL configurable

## Acceptance
- [ ] Client retries 5x with same logical key → 1 payment, 5 identical responses
- [ ] Force-killing the client mid-flight and retrying → no double-payment
- [ ] Two Vercel instances handling concurrent requests with same payment ID → 1 settlement, both serve cached response
- [ ] 409 returned for payload tampering with reused ID
