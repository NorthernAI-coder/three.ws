# USE-04: Seller — `upto` scheme on EVM (usage-metered)

## Goal
Add an `upto`-scheme paid endpoint where the buyer authorizes a max (e.g., $0.10) and we settle for the actual usage (e.g., LLM tokens generated, frames rendered, bytes served). EVM only, Permit2-based.

## Why
- Variable-cost endpoints can't use `exact`. LLM gen, asset rendering, vanity grinder runs — all variable.
- This repo already has a vanity grinder and pose studio; both are perfect `upto` candidates.

## Reference
- Scheme overview: [/tmp/x402-docs/docs/schemes/upto.mdx](/tmp/x402-docs/docs/schemes/upto.mdx)
- Spec: [/tmp/x402-docs/specs/schemes/upto/scheme_upto.md](/tmp/x402-docs/specs/schemes/upto/scheme_upto.md)
- EVM impl: [/tmp/x402-docs/specs/schemes/upto/scheme_upto_evm.md](/tmp/x402-docs/specs/schemes/upto/scheme_upto_evm.md)
- Seller quickstart `upto` section: [/tmp/x402-docs/docs/getting-started/quickstart-for-sellers.mdx](/tmp/x402-docs/docs/getting-started/quickstart-for-sellers.mdx)

## Dependencies
- USE-00, USE-01
- USE-02 (reuses Vercel middleware pattern)

## Files to create
- `api/x402/upto-llm-gen.js` — paid LLM-style endpoint; price is per-token-generated, capped at the authorized max
- `api/x402/upto-pose-render.js` — paid pose rendering; price scales with frame count
- `api/_lib/x402/upto-billing.js` — shared usage-to-amount converter (atomic units, percentage, dollar-string formats)

## Files to modify
- `api/_lib/x402/sdk.js` — register `UptoEvmScheme` for `eip155:*` alongside `ExactEvmScheme`
- `vercel.json` — routes
- `public/x402.js` — UI flow showing authorized max, then actual charged amount in the receipt

## Implementation

### Key differences vs `exact`
1. `accepts[].scheme: "upto"` and `accepts[].price: "$0.10"` (the MAX).
2. After the work completes, call `setSettlementOverrides(res, { amount: <actualAtomicUnits> })` BEFORE returning the body.
3. Settle amount must be `<=` authorized max. `"0"` is valid (no on-chain tx, no charge).

### Settlement amount formats (USE-09 buyer must read same)
- Raw atomic units: `"1000"` → 1000 base units (USDC: $0.001)
- Percentage: `"50%"` → 50% of authorized max
- Dollar: `"$0.05"` (only works when route price was `$`-prefixed)

### LLM endpoint
- Wire the OpenAI/Anthropic worker proxy that already exists in this repo
- Count tokens generated; convert to USDC atomic units; cap at `maxPrice`
- Return `{ result, usage: { actualChargedAtomic, authorizedMaxAtomic } }`
- Set settlement overrides to actual usage

### Pose-render endpoint
- Wire to the existing pose-studio renderer
- Price-per-frame at a fixed rate; cap at `maxPrice`
- Return preview URLs + actual frame count

### Facilitator address binding
Per spec, `upto` requires `extra.facilitatorAddress` in `PaymentRequirements` so the client binds the authorization to a specific facilitator. Query the facilitator's `/supported` endpoint on cold start to grab its address and cache it.

## Wiring checklist
- [ ] `UptoEvmScheme` registered on resource server
- [ ] `setSettlementOverrides` called in every handler before returning success
- [ ] `extra.facilitatorAddress` populated correctly (read from cached `/supported`)
- [ ] UI shows authorized max AND actual charged amount post-settlement
- [ ] Routes in `vercel.json`
- [ ] `.env.example` updated if any new vars

## Acceptance
- [ ] Buyer authorizes $0.10, server settles $0.04, on-chain tx confirms $0.04 transfer
- [ ] $0.00 settle path verified — no on-chain transaction sent, no gas burned
- [ ] Attempting to settle > authorized max returns `invalid_upto_evm_payload_settlement_exceeds_amount`
- [ ] Each settlement format (atomic, percent, dollar) tested
- [ ] Existing `exact` endpoints still working (regression)
