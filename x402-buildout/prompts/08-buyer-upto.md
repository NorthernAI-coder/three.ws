# USE-08: Buyer — `upto`-aware client

## Goal
Register `UptoEvmScheme` on the buyer client so when a paid endpoint returns 402 with `scheme: "upto"`, the client correctly signs an authorization for the maximum amount and accepts a settle response that may be lower.

## Why
- `exact` client schemes don't accept `upto` 402 responses.
- Without this, any call to a `upto` endpoint (USE-04, USE-29, USE-32) fails.

## Reference
- `upto` scheme: [/tmp/x402-docs/docs/schemes/upto.mdx](/tmp/x402-docs/docs/schemes/upto.mdx)
- Spec: [/tmp/x402-docs/specs/schemes/upto/scheme_upto_evm.md](/tmp/x402-docs/specs/schemes/upto/scheme_upto_evm.md)

## Dependencies
- USE-00, USE-06, USE-07

## Files to modify
- `api/_lib/x402/buyer-fetch.js` — register `UptoEvmScheme` alongside `ExactEvmScheme`
- `api/_lib/x402/buyer-axios.js` — same
- `public/x402-buyer.js` — same on browser side

## Files to create
- `api/_lib/x402/upto-receipt.js` — helper that pulls the `amount` field from the settle response to show actual charge

## Implementation

```js
import { UptoEvmScheme } from "@x402/evm/upto/client";

client.register("eip155:*", new ExactEvmScheme(signer));
client.register("eip155:*", new UptoEvmScheme(signer));
```

Both schemes coexist under the same network namespace — the SDK selects per the 402 response's `scheme` field.

### UI surface
Browser UI should:
1. Show authorized maximum in the confirmation dialog.
2. After settlement, render the actual `amount` field from `SettlementResponse.amount` — which is now required for `upto`.

### Receipt diff
For audit logging, record both the authorized max (`PaymentRequirements.amount`) and the actual settled (`SettlementResponse.amount`). The delta is "money the buyer would've spent under `exact`".

## Wiring checklist
- [ ] Both `ExactEvmScheme` and `UptoEvmScheme` registered everywhere a buyer client is constructed
- [ ] UI displays "Authorized up to: $X.XX" before signing, "Actually charged: $Y.YY" after settlement
- [ ] Audit log captures both values

## Acceptance
- [ ] Calling `/api/x402/upto-llm-gen` from the wrapped fetch returns 200 with body
- [ ] Receipt shows `amount` < authorized max in at least one test run
- [ ] $0.00 settle path: receipt shows `transaction: ""` and `amount: "0"` (no on-chain tx)
- [ ] `exact` endpoints still work (regression)
