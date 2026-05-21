# Prompt 05 — End-to-end verification script

Prompts [01](01-foundation.md) through [04](04-bazaar-declaration.md) have wired the feature. This prompt builds a standalone script that proves the whole chain works against a live (or local) server: hit a paid endpoint, extract and verify the signed offer, pay, extract and verify the signed receipt, confirm the receipt matches the offer.

This is the gate that flips the feature from "wired" to "verified end-to-end." Per [CLAUDE.md](../../CLAUDE.md): a feature is not done until this passes.

## Project rules (must follow)

From [CLAUDE.md](../../CLAUDE.md):

- **No mocks. No fake data.** Real endpoints, real payment, real verification.
- **No `setTimeout` fake-loading or fake progress bars.** Real async or nothing.

## Inputs

- The signer module from prompt 01.
- A real payer wallet for the script to spend from. Use `X402_TEST_PAYER_KEY` (a separate env var, must be a low-balance test wallet on Base mainnet — never a production wallet).
- The exact bazaar endpoint to test against: [api/x402/dance-tip.js](../../api/x402/dance-tip.js) is the cheapest at $0.001 — use it.
- Verification helpers from `@x402/extensions/offer-receipt`:
  - `extractOffersFromPaymentRequired`
  - `decodeSignedOffers`
  - `verifyOfferSignatureEIP712`
  - `extractReceiptFromResponse`
  - `verifyReceiptSignatureEIP712`
  - `verifyReceiptMatchesOffer`
- Payment client: there's likely an existing test/example client in the repo. Find it with:
  ```bash
  grep -rln "x-payment" --include="*.js" . | grep -vE 'node_modules|api/_lib|api/x402'
  ```
  If no suitable client exists, use `@x402/fetch` (install if missing) to handle the 402 challenge automatically.

## Task

Create [scripts/verify-x402-receipts.js](../../scripts/verify-x402-receipts.js) as an executable Node script (`#!/usr/bin/env node`). It must:

### 1. Read config from env or argv

```
node scripts/verify-x402-receipts.js [--base https://three.ws] [--route /api/x402/dance-tip?dancer=1&dance=rumba]
```

Defaults:
- `--base` → `process.env.PUBLIC_APP_ORIGIN` or `http://localhost:3000`
- `--route` → `/api/x402/dance-tip?dancer=1&dance=rumba`
- `X402_TEST_PAYER_KEY` from env (required; fail with a clear error if missing)

### 2. Step 1 — fetch 402 and verify the signed offer

```
fetch(base + route, { method: 'GET' })  // no x-payment header
→ expect status 402
→ body = await res.json()
→ offers = extractOffersFromPaymentRequired(body)
→ decoded = decodeSignedOffers(offers)
→ for each decoded offer, await verifyOfferSignatureEIP712(d.signedOffer)
```

Print one line per offer: `OFFER <network> <kid> -> VERIFIED | FAILED`. Exit non-zero if any fails.

Pick the Base-mainnet offer for the next step. If no Base offer is advertised, exit with a clear `no_base_offer` error.

### 3. Step 2 — pay the selected offer

Use the existing payment client found in the codebase (or `@x402/fetch`) with the test payer key. The exact wiring depends on which client is in use — read its docstring and follow its pattern. Expect a `200` response.

Do **not** swallow payment errors. If the test wallet has insufficient balance, surface the actual error message and exit non-zero. **Do not retry**, **do not fall back to mocks**.

### 4. Step 3 — verify the signed receipt

```
signedReceipt = extractReceiptFromResponse(paidResponse)
→ await verifyReceiptSignatureEIP712(signedReceipt)
→ verifyReceiptMatchesOffer(signedReceipt, selectedOffer, [payerAddress])
```

Print `RECEIPT <kid> -> VERIFIED | FAILED`. Print the receipt's `payload` (resourceUrl, payer, network, issuedAt).

If `verifyReceiptMatchesOffer` fails, dump the offer payload and the receipt payload side by side and exit non-zero — the mismatch tells the operator which field drifted.

### 5. Exit code

- Exit `0` on full success.
- Exit `1` on any verification failure or payment error, with a clear final line: `verify-x402-receipts: FAILED (<reason>)`.

### 6. Add an npm script

In [package.json](../../package.json), add:

```json
"scripts": {
  ...
  "verify:x402-receipts": "node scripts/verify-x402-receipts.js"
}
```

## Definition of done

- [ ] `scripts/verify-x402-receipts.js` exists, is executable, and uses real payment + verification (no mocks).
- [ ] Against a running `npm run dev` instance (or a deployed `https://three.ws`), it prints `OFFER ... VERIFIED` for every advertised network, `RECEIPT ... VERIFIED`, and exits `0`.
- [ ] With `X402_RECEIPT_SIGNING_KEY` unset on the server, the script exits non-zero with `no_signed_offers_in_response` — confirming the absence test.
- [ ] With a tampered offer (manually flip a byte in the signature), the script exits non-zero with the verifier's error message.
- [ ] `npm run verify:x402-receipts` works as documented.
- [ ] `git diff` reviewed.

## Stop conditions

- If the codebase has no existing way to drive a real x402 payment from a script, **do not** invent one with mocked signatures. Either use `@x402/fetch` (real implementation), or surface that you need the operator to install a real client. The whole point of this script is to be real.
- If `verifyReceiptMatchesOffer` requires the payer address but the test client doesn't expose it, derive it deterministically from `X402_TEST_PAYER_KEY` via `privateKeyToAccount(...).address`. That's the real address, not a mock.
