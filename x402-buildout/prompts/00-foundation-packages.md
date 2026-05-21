# USE-00: Foundation — Packages, Env, Shared Signers

## Goal
Stand up the v2 x402 SDK foundation that every other use case depends on: package install, env vars, shared EVM + SVM signer factories, single `x402.js` helper module.

## Why
The existing `api/_lib/x402.js`, `x402-spec.js`, `x402-paid-endpoint.js` predate the v2 SDK. Before we expand, every other prompt needs:
- `@x402/core`, `@x402/evm`, `@x402/svm`, `@x402/express`, `@x402/extensions`, `@x402/fetch`, `@x402/axios` installed
- Signers constructed from `EVM_PRIVATE_KEY` and `SVM_PRIVATE_KEY` / `EVM_PAYMENT_PRIVATE_KEY` etc.
- A single `getFacilitatorClient()` and `getResourceServer()` factory the rest of the codebase shares.

## Reference
- v2 spec: [/tmp/x402-docs/specs/x402-specification-v2.md](/tmp/x402-docs/specs/x402-specification-v2.md)
- Quickstart: [/tmp/x402-docs/docs/getting-started/quickstart-for-sellers.mdx](/tmp/x402-docs/docs/getting-started/quickstart-for-sellers.mdx)
- Existing wiring: [api/_lib/x402.js](../../api/_lib/x402.js), [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js), [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js)

## Dependencies
None — this is the root.

## Files to create
- `api/_lib/x402/sdk.js` — exports `getEvmSigner()`, `getSvmSigner()`, `getFacilitatorClient()`, `getResourceServer()`, `getEvmAddress()`, `getSvmAddress()`, network constants
- `api/_lib/x402/networks.js` — CAIP-2 constants for every network we use (`eip155:8453`, `eip155:84532`, `solana:5eykt4Us...`, `solana:EtWTRABZ...`)
- `api/_lib/x402/signers.js` — reads private keys from env, returns viem account / `@solana/kit` signer

## Files to modify
- `package.json` — add SDK deps
- `.env.example` (create if missing) — `EVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY`, `EVM_PAYMENT_ADDRESS`, `SVM_PAYMENT_ADDRESS`, `X402_FACILITATOR_URL`
- `vercel.json` — ensure `node_modules/@x402/**` is in function `includeFiles`

## Implementation

### 1. Install packages
```bash
npm install @x402/core @x402/evm @x402/svm @x402/express @x402/extensions @x402/fetch @x402/axios viem @solana/kit @scure/base
```

Keep `serialize-javascript` override in place.

### 2. `api/_lib/x402/networks.js`
Export constants only. No env access in this file.
- `BASE_MAINNET = "eip155:8453"`
- `BASE_SEPOLIA = "eip155:84532"`
- `SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"`
- `SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1"`
- `DEFAULT_EVM_NETWORK` = mainnet when `NODE_ENV === "production"`, sepolia otherwise
- `DEFAULT_SVM_NETWORK` = mainnet in prod, devnet otherwise
- `FACILITATOR_URL_TESTNET = "https://x402.org/facilitator"`
- `FACILITATOR_URL_MAINNET` from `process.env.X402_FACILITATOR_URL` (default `https://api.cdp.coinbase.com/platform/v2/x402`)

### 3. `api/_lib/x402/signers.js`
- `getEvmSigner()` — `privateKeyToAccount(process.env.EVM_PRIVATE_KEY)`. Throw clear error if missing.
- `getSvmSigner()` — `createKeyPairSignerFromBytes(base58.decode(process.env.SVM_PRIVATE_KEY))`. Returns a Promise.
- `getEvmAddress()` — `process.env.EVM_PAYMENT_ADDRESS` (where the resource server receives funds).
- `getSvmAddress()` — `process.env.SVM_PAYMENT_ADDRESS`.

### 4. `api/_lib/x402/sdk.js`
- `getFacilitatorClient({ mainnet } = {})` returns `new HTTPFacilitatorClient({ url })`.
- `getResourceServer({ networks = ["evm", "svm"], mainnet } = {})` builds a `new x402ResourceServer(getFacilitatorClient(...))` and registers `ExactEvmScheme()` and/or `ExactSvmScheme()` against the right CAIP-2 networks.
- All exports are singletons cached per-process (these are stateless and safe).

### 5. Update `api/_lib/x402.js`
Re-export from `./x402/sdk.js` so existing callers continue to work while new code points at the v2 helpers. Do NOT silently remove old fields used by existing endpoints — read what's there first, then add.

## Wiring checklist
- [ ] `npm install` succeeds and `node -e "import('@x402/core')"` resolves
- [ ] `.env.example` lists every new variable with one-line description
- [ ] `vercel.json` `includeFiles` updated for `@x402/**` packages
- [ ] `api/_lib/x402.js` continues to export everything the existing `api/x402-*.js` endpoints depend on (verify by grepping the codebase)
- [ ] `getResourceServer()` registered for both `eip155:*` and `solana:*` namespaces

## Acceptance
- [ ] `node --eval "import('./api/_lib/x402/sdk.js').then(m => console.log(Object.keys(m)))"` prints every export
- [ ] `curl -X GET https://x402.org/facilitator/supported` succeeds and parses
- [ ] No existing `api/x402-*.js` endpoint regresses (smoke-test each that's wired)
- [ ] Committed to a branch; PR opened against `main`
