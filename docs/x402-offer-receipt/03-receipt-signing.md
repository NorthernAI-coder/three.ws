# Prompt 03 — Wire receipt signing into the 200 response path

You are wiring **receipt signing** into the post-settlement `200` flow. Prompts [01](01-foundation.md) and [02](02-offer-signing.md) are complete: the signer module exists and offer signing on `402` works end-to-end. Locked-in decisions live in [00-plan.md](00-plan.md).

## Project rules (must follow)

From [CLAUDE.md](../../CLAUDE.md):

- **No fake data, no placeholders, no stubs.**
- **Errors handled at boundaries only.**

Additional rules for this task:

- **Receipts are signed only AFTER `settlePayment` succeeds.** A receipt signed before settle would attest to delivery for a payment that may not have cleared. The wiring must enforce this ordering — there is no acceptable shortcut.
- **A failed receipt sign must not fail the response.** The user paid and the work ran; we deliver the result regardless. Log the error and continue with an unsigned response.

## Inputs

- Receipt-signing hook point: [api/_lib/x402-paid-endpoint.js:199](../../api/_lib/x402-paid-endpoint.js#L199), where `x-payment-response` is set from `encodePaymentResponseHeader(settled)`.
- All inputs the receipt needs are already in scope at that point:
  - `resourceUrl` — defined at line 143.
  - `verified.payer` — from the `verifyPayment` step.
  - `verified.requirement.network` — the accept entry that matched.
  - `settled.txHash` (optional) — from `settlePayment` return value. Field name is whatever `settlePayment` actually returns; verify in [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js).
- Signer surface (already built in prompt 01):
  ```js
  import { signReceipt } from './x402-offer-receipt.js';
  const signedReceipt = await signReceipt({
    resourceUrl,
    payer: verified.payer,
    network: verified.requirement.network,
    txHash: settled.txHash,
    includeTxHash: false,         // privacy-preserving default
  });
  // Returns null when feature is disabled or inputs insufficient.
  ```
- Wire shape required — what the client's `extractReceiptFromResponse` expects on `x-payment-response`:
  ```json
  {
    ... existing settle response ...,
    "extensions": {
      "offer-receipt": {
        "signedReceipt": { kid, signature, payload: { resourceUrl, payer, network, issuedAt, txHash? } }
      }
    }
  }
  ```

## Task

### 1. Locate `encodePaymentResponseHeader`

It's at [api/_lib/x402-spec.js:436](../../api/_lib/x402-spec.js#L436). Read its current shape — it takes a `settleResult` object and returns a base64-JSON string.

You have two integration options. Pick **Option A** unless you find a concrete reason to prefer B.

**Option A (recommended): attach the receipt at the call site.**

In [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js), after the existing `settled = await settlePayment(...)` block (around line 197), sign the receipt and merge it into the envelope before encoding. Change `encodePaymentResponseHeader` to accept an envelope rather than a raw `settleResult`, or add a sibling helper. Keep the change tight — do not refactor unrelated code.

**Option B: thread the signer through `encodePaymentResponseHeader`.**

Make `encodePaymentResponseHeader` async and take `{ settleResult, signedReceipt }`. Update all callers. This is fine but slightly more churn.

### 2. Implement the wiring (Option A example shape)

```js
let settled;
try {
  settled = await settlePayment({ ... });
} catch (err) {
  return error(res, err.status || 502, err.code || 'settle_failed', err.message);
}

let signedReceipt = null;
try {
  signedReceipt = await signReceipt({
    resourceUrl,
    payer: verified.payer,
    network: verified.requirement.network,
    txHash: settled.txHash,
    includeTxHash: false,
  });
} catch (err) {
  // Sign failures must not break the response. Log and proceed unsigned.
  console.error('x402_receipt_sign_failed', err);
}

const headerEnvelope = signedReceipt
  ? { ...settled, extensions: { 'offer-receipt': { signedReceipt } } }
  : settled;

res.setHeader('x-payment-response', encodePaymentResponseHeader(headerEnvelope));
```

Verify that `encodePaymentResponseHeader` is shape-agnostic enough to accept this. If it currently does field-by-field re-encoding, generalize it minimally — do not refactor beyond what's needed.

### 3. Confirm `verified.payer` and `verified.requirement.network` are populated

These come from `verifyPayment` at [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js). Trace the code path and confirm both fields are present on the returned object. If `verifyPayment` does not currently expose `payer`, fix that in the shared lib — but only the minimum needed.

For BSC `direct` flows, `verified.payer` may be `null` (the contract emits an event, no signed payload). That's expected — `signReceipt` returns `null` when payer is null, which means BSC responses ship without a receipt. Document this in a one-line comment at the call site.

### 4. Sanity test

```bash
npm run dev &
sleep 3
# Hit any paid endpoint with a valid x-payment header from a test client.
# (Use the existing test/example client in the repo — find it with: grep -rln "x-payment" --include="*.js" .)
```

After the call returns 200, decode `x-payment-response`:

```bash
node --input-type=module -e "
import { verifyReceiptSignatureEIP712 } from '@x402/extensions/offer-receipt';
const headerB64 = process.argv[2];
const envelope = JSON.parse(Buffer.from(headerB64, 'base64').toString('utf8'));
const sr = envelope.extensions?.['offer-receipt']?.signedReceipt;
if (!sr) { console.error('no signed receipt'); process.exit(1); }
const ok = await verifyReceiptSignatureEIP712(sr);
console.log(ok ? 'VERIFIED' : 'FAILED', JSON.stringify(sr.payload, null, 2));
" "<paste-the-header-value-here>"
```

Expected: `VERIFIED` and a payload containing `resourceUrl`, `payer`, `network`, `issuedAt`. No `txHash` (because `includeTxHash: false`).

## Definition of done

- [ ] After successful settlement, `x-payment-response` decodes to an envelope containing `extensions["offer-receipt"].signedReceipt`.
- [ ] The signed receipt verifies under `verifyReceiptSignatureEIP712`.
- [ ] Receipt payload includes `resourceUrl`, `payer`, `network`, `issuedAt`. No `txHash` unless `includeTxHash: true` (it's not).
- [ ] Receipts are signed **only** after `settlePayment` resolves — never before.
- [ ] A receipt-sign failure logs `x402_receipt_sign_failed` and returns the 200 anyway.
- [ ] BSC `direct` 200 responses ship without a receipt (graceful null), no error thrown.
- [ ] When `X402_RECEIPT_SIGNING_KEY` is unset, response is byte-identical to current behaviour.
- [ ] No paid endpoint handler in `api/x402/*.js` was modified.
- [ ] `npm test` still passes.
- [ ] `git diff` reviewed.

## Stop conditions

- If `verifyPayment` does not return the payer address for the EVM `exact` scheme, do not invent one — fix the upstream verifier first or surface the gap.
- If `settlePayment` does not return a `txHash` field, that's fine (we default `includeTxHash: false`). Do not add fake tx hashes.
