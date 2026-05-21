# USE-01: Unified Facilitator Client

## Goal
Wrap `HTTPFacilitatorClient` with our own caching, failover, and observability layer so every paid endpoint in this repo uses a single facilitator entry point.

## Why
- Facilitators differ by network (x402.org for testnet, CDP / PayAI / self-hosted for mainnet).
- We need a single place to swap between them, add timeouts, retries, and log every `/verify` and `/settle` call for audit.
- Downstream prompts (sellers, buyers, hooks) all consume this client.

## Reference
- Facilitator interface: [/tmp/x402-docs/specs/x402-specification-v2.md §7](/tmp/x402-docs/specs/x402-specification-v2.md)
- Facilitator concept doc: [/tmp/x402-docs/docs/core-concepts/facilitator.md](/tmp/x402-docs/docs/core-concepts/facilitator.md)
- Networks: [/tmp/x402-docs/docs/core-concepts/network-and-token-support.mdx](/tmp/x402-docs/docs/core-concepts/network-and-token-support.mdx)

## Dependencies
- USE-00 (foundation)

## Files to create
- `api/_lib/x402/facilitator.js` — `class X402Facilitator { verify(), settle(), supported(), discovery() }`
- `api/_lib/x402/facilitator-routes.js` — routing layer that selects facilitator URL by `(scheme, network)` tuple
- `api/x402-facilitator-supported.js` — HTTP endpoint that proxies our resolved facilitator's `/supported` for clients

## Files to modify
- `api/_lib/x402/sdk.js` — `getFacilitatorClient()` returns our wrapper instead of raw `HTTPFacilitatorClient`
- `.env.example` — add `X402_FACILITATOR_TIMEOUT_MS`, `X402_FACILITATOR_MAINNET_URL`, `X402_FACILITATOR_TESTNET_URL`

## Implementation

### `X402Facilitator` API surface
```
new X402Facilitator({ url, timeoutMs, onCall })
  .verify({ paymentPayload, paymentRequirements }) → VerifyResponse
  .settle({ paymentPayload, paymentRequirements }) → SettlementResponse
  .supported() → SupportedResponse
  .discovery({ type, scheme, network, extensions, limit, offset })
  .search({ query, type })
```

- Wrap the underlying `HTTPFacilitatorClient` from `@x402/core`.
- Add `AbortController` for `timeoutMs` (default 30000).
- Wrap every call in `onCall({ method, url, request, response, durationMs, error })` for audit logging — consumers wire this to USE-24.
- Retry once on 502/503/504, never on 4xx.

### Routing rules
- Production (`NODE_ENV === "production"`): mainnet URL.
- Otherwise: testnet URL (x402.org).
- Override per-call via `getFacilitatorClient({ mainnet: true })`.
- For `batch-settlement`: same routing, but expose `mainnet` knob explicitly (some facilitators don't support all schemes).

### `/api/x402-facilitator-supported` endpoint
Proxy our resolved facilitator's `/supported` to the browser so `public/x402.js` can list supported `(scheme, network)` tuples without hardcoding.

## Wiring checklist
- [ ] `api/_lib/x402/facilitator.js` exported and consumed by `getFacilitatorClient()`
- [ ] `vercel.json` route added for `/api/x402-facilitator-supported`
- [ ] Browser-side `public/x402.js` calls `/api/x402-facilitator-supported` on init and caches result
- [ ] Logs every facilitator call to console in dev mode (don't log signatures or private keys)

## Acceptance
- [ ] `curl http://localhost:3000/api/x402-facilitator-supported` returns supported kinds JSON
- [ ] `X402Facilitator.verify()` rejects within `timeoutMs` if facilitator stalls (simulate with a `127.0.0.1:1` URL)
- [ ] Single retry observed in logs when facilitator returns 503
- [ ] Existing paid endpoints (`api/x402/*.js`) verified — none broken
