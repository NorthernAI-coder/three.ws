# USE-06: Buyer — `fetch` client (multi-network EVM + SVM)

## Goal
Wrap `fetch` so any call to an x402-paid URL automatically handles 402 → sign → retry. Register EVM and SVM schemes so the same wrapped fetch handles both networks transparently.

## Why
- Any in-repo code that consumes paid APIs (other agents, workers, server-to-server calls) needs a turnkey HTTP client.
- The browser side of `public/x402.js` and Node-side scripts both benefit.

## Reference
- Buyer quickstart: [/tmp/x402-docs/docs/getting-started/quickstart-for-buyers.mdx](/tmp/x402-docs/docs/getting-started/quickstart-for-buyers.mdx)
- `@x402/fetch`: [typescript/packages/http/fetch](https://github.com/x402-foundation/x402/tree/main/typescript/packages/http/fetch)

## Dependencies
- USE-00, USE-01

## Files to create
- `api/_lib/x402/buyer-fetch.js` — server-side wrapped fetch (works in Vercel functions, scripts, workers)
- `public/x402-buyer.js` — browser-side wrapped fetch, ES module
- `scripts/x402-buy.mjs` — CLI utility: `node scripts/x402-buy.mjs <url> [--network=eip155:8453]`

## Files to modify
- `public/x402.js` — replace ad-hoc payment logic with `x402-buyer.js`
- `.env.example` — `EVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY` (buyer side)

## Implementation

### Shared client factory
```js
// api/_lib/x402/buyer-fetch.js
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";

export function buildBuyerFetch({ evmSigner, svmSigner } = {}) {
  const client = new x402Client();
  if (evmSigner) client.register("eip155:*", new ExactEvmScheme(evmSigner));
  if (svmSigner) client.register("solana:*", new ExactSvmScheme(svmSigner));
  return wrapFetchWithPayment(globalThis.fetch, client);
}
```

### Browser variant
Same factory but with browser-friendly signers:
- EVM via `viem/accounts.privateKeyToAccount` reading from `localStorage` or a wallet connector (NEVER expose private key in HTML; use connectors or BYO key flow with explicit user warning)
- SVM via `@solana/kit` `createKeyPairSignerFromBytes`

### CLI
`node scripts/x402-buy.mjs https://api.example.com/weather` — exits 0 on success, prints response body, settle response in stderr. Useful for QA + cron-driven agents.

### Server-to-server use
Any internal Vercel function that calls another paid endpoint uses `buildBuyerFetch()` with env-loaded signers. NEVER expose buyer private keys to clients.

## Wiring checklist
- [ ] `public/x402.js` reads from `public/x402-buyer.js` (no duplicated sign logic)
- [ ] Browser flow uses a connected wallet (Phantom, Coinbase Wallet, Metamask) — NOT a private key in env
- [ ] Server-side `buildBuyerFetch()` works in both Vercel function (`api/*.js`) and Node script (`scripts/*.mjs`)
- [ ] CLI exits with non-zero on payment error

## Acceptance
- [ ] `node scripts/x402-buy.mjs http://localhost:3000/api/x402/exact-evm-demo` returns the resource and prints settlement tx
- [ ] Same CLI works against the Solana endpoint (`exact-svm-demo`)
- [ ] Browser pays through UI without copying private keys anywhere
- [ ] No leaked private keys in network tab or console logs
