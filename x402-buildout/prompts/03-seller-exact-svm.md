# USE-03: Seller — `exact` scheme on SVM (Solana + Devnet)

## Goal
Add `exact`-scheme paid endpoint on Solana, accepting USDC on `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (mainnet) with `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (devnet) for dev. Use `TransferChecked` with facilitator as fee payer.

## Why
This repo is Solana-heavy (Pump.fun feed, Solana RPC, agent payments SDK). Native Solana x402 is essential. Solana settlement differs from EVM: partially-signed transactions and strict instruction layout rules.

## Reference
- SVM spec: [/tmp/x402-docs/specs/schemes/exact/scheme_exact_svm.md](/tmp/x402-docs/specs/schemes/exact/scheme_exact_svm.md)
- Scheme overview SVM section: [/tmp/x402-docs/docs/schemes/exact.mdx](/tmp/x402-docs/docs/schemes/exact.mdx)
- Solana buyer quickstart: [/tmp/x402-docs/docs/getting-started/quickstart-for-buyers.mdx](/tmp/x402-docs/docs/getting-started/quickstart-for-buyers.mdx) (SVM section)
- Existing SVM wiring: `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`

## Dependencies
- USE-00, USE-01
- (Recommended) USE-02 to confirm middleware pattern works for EVM first

## Files to create
- `api/x402/exact-svm-demo.js` — paid Solana endpoint
- `api/_lib/x402/svm-settlement-cache.js` — 120-second in-memory cache (REQUIRED by spec for self-settling, recommended even with facilitator) — see SVM spec §"Duplicate Settlement Mitigation"

## Files to modify
- `api/_lib/x402/sdk.js` — register `ExactSvmScheme` for `solana:*`
- `vercel.json` — route for `/api/x402/exact-svm-demo`
- `public/x402.js` — Solana button using `@solana/kit` signer

## Implementation

### Solana-specific configuration
The Solana scheme requires `extra.feePayer` (facilitator's address) in `PaymentRequirements`. The facilitator typically populates this; verify our facilitator client surfaces it.

### Duplicate settlement protection
Per spec, on Solana the same signed transaction can be submitted multiple times before confirmation. The facilitator's RPC returns success each time but the transfer only executes once.

If we use a facilitator: the `@x402/svm` package includes built-in `SettlementCache` — enable it when registering the scheme.

If we ever self-settle (USE-26): we MUST implement our own short-lived cache keyed on the base64 transaction string with 120s TTL.

Wire `api/_lib/x402/svm-settlement-cache.js` so it can be passed in either mode.

### The endpoint
- Price: `"$0.001"`
- `payTo`: `getSvmAddress()` (base58 Solana address)
- Returns a real resource (e.g., a Solana-themed pose seed, or pulls one bar of Pump.fun data through the existing feed)

### Memo support
Optional but useful: support `extra.memo` so payments carry an invoice / order ID per spec. Surface this via a query parameter `?ref=<id>` that becomes the memo.

## Wiring checklist
- [ ] Endpoint returns 402 + PAYMENT-REQUIRED header listing `solana:*` accepts
- [ ] Settlement cache enabled when constructing `ExactSvmScheme`
- [ ] `vercel.json` route added
- [ ] UI in `public/x402.js` includes Solana payment flow using `@solana/kit` and base58 private key (env-only, never hardcoded)
- [ ] `extra.memo` honored when `?ref` query param present

## Acceptance
- [ ] `curl -i http://localhost:3000/api/x402/exact-svm-demo` shows 402 with `solana:*` accepts
- [ ] Solana wallet with devnet USDC pays through UI; transaction visible on solscan devnet
- [ ] Memo from `?ref=invoice-123` appears in the on-chain Memo instruction
- [ ] Duplicate submission of same signed tx returns `duplicate_settlement` error (test by replaying)
- [ ] Confirmed transfer destination is the ATA PDA for `(payTo, USDC mint)` — not an arbitrary account
