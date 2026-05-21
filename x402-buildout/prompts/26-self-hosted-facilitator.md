# USE-26: Self-Hosted Facilitator

## Goal
Run our own facilitator: `/verify`, `/settle`, `/supported`, and `/discovery/resources` endpoints. Eliminates dependency on third-party facilitators for our own paid traffic and enables custom KYT/compliance logic.

## Why
- We control the verification logic.
- We pay our own gas — no facilitator fees.
- We can add compliance hooks (sanctions screening, KYT, jurisdictional rules) without changing the standard.

## Reference
- Facilitator concept: [/tmp/x402-docs/docs/core-concepts/facilitator.md](/tmp/x402-docs/docs/core-concepts/facilitator.md)
- Facilitator interface: [/tmp/x402-docs/specs/x402-specification-v2.md §7](/tmp/x402-docs/specs/x402-specification-v2.md)
- Facilitator examples: [examples/typescript/facilitator/](https://github.com/x402-foundation/x402/tree/main/examples/typescript/facilitator)

## Dependencies
- USE-00, USE-01

## Files to create
- `api/facilitator/verify.js` — POST endpoint
- `api/facilitator/settle.js` — POST endpoint
- `api/facilitator/supported.js` — GET endpoint
- `api/facilitator/discovery/resources.js` — GET endpoint
- `api/facilitator/discovery/search.js` — GET endpoint
- `api/_lib/x402/facilitator-server/index.js` — sets up `x402Facilitator` with EVM + SVM schemes
- `api/_lib/x402/facilitator-server/compliance.js` — KYT and sanctions hooks
- `data/facilitator/bazaar-index/` — durable Bazaar index (Postgres or Redis-backed)

## Files to modify
- `vercel.json` — routes for facilitator endpoints
- `.env.example` — `FACILITATOR_EVM_GAS_WALLET_PRIVATE_KEY` (the wallet that pays settlement gas), `FACILITATOR_SVM_FEE_PAYER_PRIVATE_KEY`, `FACILITATOR_RPC_URL_BASE`, `FACILITATOR_RPC_URL_SOLANA`, `KYT_API_KEY` (Chainalysis / TRM / similar)

## Implementation

### Verifier + Settler
```js
import { x402Facilitator } from "@x402/core";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { ExactSvmScheme } from "@x402/svm/exact/facilitator";
import { UptoEvmScheme } from "@x402/evm/upto/facilitator";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/facilitator";

const facilitator = new x402Facilitator({
  signers: {
    "eip155:*": evmGasWalletSigner,
    "solana:*": svmFeePayerSigner,
  },
  rpcUrls: { ... },
});

facilitator.register("eip155:*", new ExactEvmScheme());
facilitator.register("eip155:*", new UptoEvmScheme());
facilitator.register("eip155:*", new BatchSettlementEvmScheme());
facilitator.register("solana:*", new ExactSvmScheme());
```

### Compliance hook
`onBeforeVerify`: check `payer` address against sanctions API (Chainalysis Address Screening). Reject with clear reason. Allow caching so we don't hit the KYT API every call for a known-good address.

### Bazaar indexing
`onAfterVerify`: extract `extensions.bazaar.info` (using SDK's `extractDiscoveryInfo` helper) and write to our Bazaar index. Expose via `/discovery/resources`.

### Gas wallet ops
- The facilitator's EVM wallet pays gas. Monitor balance.
- Endpoint `/api/facilitator/health` returns gas wallet balance, recent failures, current throughput.
- Cron tops up gas wallet from a treasury if balance falls below threshold (out of scope here, but document the integration point).

### Solana fee payer
Similar — a dedicated Solana account funds transaction fees. Surface its public key in `extra.feePayer` of Solana PaymentRequirements.

### CORS
Facilitator endpoints must allow CORS from arbitrary origins so buyer clients (browser-based) can use them.

## Wiring checklist
- [ ] All four endpoints (`/verify`, `/settle`, `/supported`, `/discovery/resources`) live and tested
- [ ] Gas wallets funded
- [ ] KYT integration screens addresses on first verify, caches result
- [ ] Bazaar index persists across function invocations (Postgres or Redis)
- [ ] CORS configured for cross-origin buyer access

## Acceptance
- [ ] `curl http://localhost:3000/api/facilitator/supported` returns valid SupportedResponse
- [ ] Resource server pointing at our facilitator URL successfully verifies + settles an `exact` EVM payment
- [ ] Same for `exact` SVM
- [ ] Sanctioned address (test address from Chainalysis list) blocked at verify
- [ ] `/api/facilitator/discovery/resources` returns endpoints we've seen `bazaar` info for
- [ ] Gas wallet balance visible via `/api/facilitator/health`
