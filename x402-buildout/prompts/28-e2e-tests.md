# USE-28: End-to-End Tests

## Goal
Automated E2E tests covering every scheme × every transport × every extension combination against REAL testnet (Base Sepolia, Solana Devnet). No mocks per [CLAUDE.md](../../CLAUDE.md).

## Why
- We've built ~25 prior use cases. Without E2E coverage, breakage is silent and discovery is in production.
- Real testnet tests catch protocol-level issues that mocks hide (signature recovery, nonce reuse, gas estimation).

## Reference
- E2E reference: [e2e/](https://github.com/x402-foundation/x402/tree/main/e2e)

## Dependencies
- USE-00 through USE-27

## Files to create
- `tests/e2e/setup.js` — boots local Vercel dev server, loads test wallets with testnet funds
- `tests/e2e/fixtures/wallets.json` — addresses (NOT private keys) of test wallets; keys in env
- `tests/e2e/seller-exact-evm.test.js`
- `tests/e2e/seller-exact-svm.test.js`
- `tests/e2e/seller-upto-evm.test.js`
- `tests/e2e/seller-batch-evm.test.js`
- `tests/e2e/buyer-fetch-multinetwork.test.js`
- `tests/e2e/buyer-axios.test.js`
- `tests/e2e/buyer-batch.test.js`
- `tests/e2e/extensions/bazaar.test.js`
- `tests/e2e/extensions/payment-identifier.test.js`
- `tests/e2e/extensions/sign-in-with-x.test.js`
- `tests/e2e/extensions/offer-receipt.test.js`
- `tests/e2e/extensions/gas-sponsoring.test.js`
- `tests/e2e/hooks/spending-cap.test.js`
- `tests/e2e/hooks/api-key-bypass.test.js`
- `tests/e2e/hooks/audit-log.test.js`
- `tests/e2e/hooks/idempotency.test.js`
- `tests/e2e/facilitator/self-hosted.test.js`
- `tests/e2e/transports/mcp.test.js`
- `tests/e2e/transports/a2a.test.js`

## Files to modify
- `package.json` — add `"test:e2e": "vitest run --config tests/e2e/vitest.config.js"` script
- `.github/workflows/` — add CI workflow that runs E2E against testnet on PR (NOT mainnet)
- `.env.example` — `TEST_EVM_PRIVATE_KEY_BUYER`, `TEST_EVM_PRIVATE_KEY_SELLER`, `TEST_SVM_PRIVATE_KEY_BUYER`, `TEST_SVM_PRIVATE_KEY_SELLER`

## Implementation

### Test wallets
Pre-funded testnet wallets:
- Base Sepolia: USDC + small ETH balance (gas)
- Solana Devnet: USDC + small SOL balance

Top-up cron (manual or scripted) keeps wallets funded between test runs. Document the recovery procedure in `tests/e2e/README.md`.

### Test shape
```js
import { test, expect } from "vitest";
import { setupServer, buildBuyerFetch } from "../setup.js";

test("exact EVM: 402 → pay → 200 with receipt", async () => {
  const { url } = await setupServer({ route: "/api/x402/exact-evm-demo" });
  const fetch = buildBuyerFetch({ evmSigner: testEvmSigner });
  const res = await fetch(url);
  expect(res.status).toBe(200);
  const receipt = extractPaymentResponse(res);
  expect(receipt.success).toBe(true);
  expect(receipt.transaction).toMatch(/^0x[a-f0-9]{64}$/);
});
```

### Coverage matrix
Every test asserts:
- HTTP status code
- `PAYMENT-RESPONSE` header presence and validity
- On-chain transaction visible via RPC within timeout
- Audit log entry created
- Extension responses correct

### Negative tests
- Invalid signature → 402 with specific error
- Replay (same nonce) → rejected
- Expired authorization → rejected
- Settlement of more than authorized → rejected
- Etc.

### CI gotchas
- Testnet faucets rate-limit; persist wallet funds across runs.
- RPC providers rate-limit; use multiple providers in a fallback list.
- Mainnet must NEVER run in CI. Guard with `if (process.env.NETWORK !== "testnet") throw`.

## Wiring checklist
- [ ] Test wallets pre-funded
- [ ] Every prior use case (USE-00..27) has at least one E2E test
- [ ] Negative tests for protocol-level errors
- [ ] CI runs E2E on PR
- [ ] Mainnet guard prevents accidental real-money runs

## Acceptance
- [ ] `npm run test:e2e` passes locally
- [ ] CI pipeline runs E2E on every PR
- [ ] Coverage report shows >80% of x402 code paths exercised
- [ ] Test wallets stay funded automatically OR documented top-up procedure
- [ ] Negative tests catch real protocol violations (verify with intentionally-broken local change)
