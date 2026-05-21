# USE-02: Seller — `exact` scheme on EVM (Base + Base Sepolia)

## Goal
Stand up a production-grade `exact`-scheme paid endpoint on EVM. The endpoint accepts USDC on Base mainnet (`eip155:8453`) with Base Sepolia (`eip155:84532`) for dev, settles via our facilitator, and uses EIP-3009 by default with Permit2 fallback.

## Why
`exact` is the default payment scheme. Every other scheme (`upto`, `batch-settlement`) is an extension of this. We must have a clean reference implementation in our repo before layering on extensions.

## Reference
- Scheme overview: [/tmp/x402-docs/docs/schemes/exact.mdx](/tmp/x402-docs/docs/schemes/exact.mdx)
- EVM spec: [/tmp/x402-docs/specs/schemes/exact/scheme_exact_evm.md](/tmp/x402-docs/specs/schemes/exact/scheme_exact_evm.md)
- Quickstart for sellers: [/tmp/x402-docs/docs/getting-started/quickstart-for-sellers.mdx](/tmp/x402-docs/docs/getting-started/quickstart-for-sellers.mdx)
- Existing endpoint pattern to follow: [api/x402/dance-tip.js](../../api/x402/dance-tip.js)

## Dependencies
- USE-00 (foundation), USE-01 (facilitator client)

## Files to create
- `api/x402/exact-evm-demo.js` — Vercel function exposing a paid endpoint
- `api/_lib/x402/middleware-exact.js` — reusable `paymentMiddleware`-style helper for Vercel functions (Vercel doesn't use Express middleware natively; we build the equivalent)

## Files to modify
- `api/_lib/x402/sdk.js` — `getResourceServer()` registers `ExactEvmScheme` for `eip155:*`
- `vercel.json` — route for `/api/x402/exact-evm-demo`
- `public/x402.js` — add a "Demo: pay $0.001 on Base" button that calls the endpoint with the buyer fetch client

## Implementation

### Vercel-flavored middleware
Vercel functions are single-handler; `@x402/express` won't work directly. Build the equivalent:

```
// api/_lib/x402/middleware-exact.js
export function withExactPayment(routeConfig, handler) {
  return async function (req, res) {
    const server = getResourceServer({ mainnet: process.env.NODE_ENV === "production" });
    const httpServer = new x402HTTPResourceServer(server, { [`${req.method} ${routeConfig.path}`]: routeConfig });
    return httpServer.handle(req, res, handler);
  };
}
```

Wrap with `withExactPayment({ path, accepts, description, mimeType }, async (req, res) => { ... })`.

### The endpoint
- Price: `"$0.001"` (1 hundredth of a cent — micropayment demo).
- Network: dynamic (mainnet in prod, sepolia in dev).
- `payTo`: `getEvmAddress()` from foundation.
- On success, return a real payload: structured JSON describing the buyer's payment receipt + a sample resource (e.g., a randomly generated 3D pose seed).

### Tie to the 3D-Agent stack
Pick a real demo resource. Suggestion: paid pose-seed generator — `/api/x402/exact-evm-demo?prompt=ballerina` returns `{ seed, parameters, preview }` that `pose-studio` can consume.

## Wiring checklist
- [ ] Endpoint returns 402 + `PAYMENT-REQUIRED` header on unauthenticated GET
- [ ] Endpoint returns 200 + resource + `PAYMENT-RESPONSE` header after valid `PAYMENT-SIGNATURE`
- [ ] Real settlement observed on Basescan (mainnet) or Base Sepolia explorer (dev)
- [ ] `vercel.json` route added
- [ ] UI surface in `public/x402.js` exercises the endpoint via the buyer client (USE-06)

## Acceptance
- [ ] `curl -i http://localhost:3000/api/x402/exact-evm-demo` shows 402 with PAYMENT-REQUIRED header
- [ ] Wallet with Base Sepolia USDC pays through the UI and receives the resource
- [ ] Transaction hash appears in PAYMENT-RESPONSE header and on the block explorer
- [ ] No console errors in browser; no error logs server-side
- [ ] Existing `api/x402/dance-tip.js` and siblings still work (regression check)
