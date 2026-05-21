# Prompt 02 — Wire offer signing into the 402 response path

You are wiring **offer signing** into the `402 Payment Required` flow. The signer module from [01-foundation.md](01-foundation.md) is already in place at [api/_lib/x402-offer-receipt.js](../../api/_lib/x402-offer-receipt.js). Locked-in decisions live in [00-plan.md](00-plan.md).

## Project rules (must follow)

From [CLAUDE.md](../../CLAUDE.md):

- **No fake data, no placeholders, no stubs.**
- **Errors handled at boundaries only.**

Additional rule for this task:

- **Do not modify `bazaarExtension()` or `buildBazaarSchema()`** in [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js). The bazaar crawler validator mirrors the `@x402/extensions/bazaar` shape exactly — any deviation breaks discovery. The new `offer-receipt` extension is a **sibling** to `bazaar`, not nested under it.

## Inputs

- Hook point: [api/_lib/x402-spec.js:610](../../api/_lib/x402-spec.js#L610) — the `build402Body` function.
- Signer surface (already built in prompt 01):
  ```js
  import { signOffersForAccepts } from './x402-offer-receipt.js';
  const signedOffers = await signOffersForAccepts({
    accepts: requirements,       // array of accept entries (the 'requirements')
    resourceUrl,                  // string
    validitySeconds: 60,          // matches maxTimeoutSeconds
  });
  // Returns [] when feature is disabled (env unset).
  ```
- Wire shape required by the spec — what the client's `extractOffersFromPaymentRequired` expects:
  ```json
  {
    "extensions": {
      "bazaar": { ... existing ... },
      "offer-receipt": {
        "signedOffers": [ { kid, signature, payload: { resourceUrl, offerType, network, amount, payTo, validUntil } }, ... ]
      }
    }
  }
  ```

## Task

### 1. Make `build402Body` async-friendly

`build402Body` is currently synchronous. The offer signer is async. The cleanest change:

- Convert `build402Body` to `async function build402Body(...)`.
- Convert `send402` to `async function send402(res, opts = {})` and `await build402Body(opts)`.
- Update **every** caller of `send402` to `await` it. Audit with:
  ```bash
  grep -rn "send402(" api/
  ```
  Every call site must be inside an `async` function and prefixed with `await`. There are calls in [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js) (already async) and possibly others — verify exhaustively.

### 2. Attach signed offers to the 402 body

Inside `build402Body`, after the existing fields are assembled, call `signOffersForAccepts` with the final `accepts` array and `resourceUrl`. Merge the result into `extensions`:

```js
const signedOffers = await signOffersForAccepts({
  accepts: Array.isArray(accepts) ? accepts : [accepts],
  resourceUrl,
  validitySeconds: 60,
});

return {
  x402Version: X402_VERSION,
  error,
  resource: { url: resourceUrl, description, mimeType },
  accepts: Array.isArray(accepts) ? accepts : [accepts],
  extensions: signedOffers.length
    ? { bazaar, 'offer-receipt': { signedOffers } }
    : { bazaar },
};
```

When the feature is disabled (env unset), `signedOffers` is `[]` and the `offer-receipt` key is omitted entirely. This keeps the 402 body byte-identical to current behaviour for the disabled case.

### 3. Mirror into the `PAYMENT-REQUIRED` header

The current code at [api/_lib/x402-spec.js:634](../../api/_lib/x402-spec.js#L634) base64-encodes the 402 body into the `PAYMENT-REQUIRED` header. After your changes that body now includes the signed offers, so the header automatically carries them — confirm this by inspection. **Do not** add a separate header.

### 4. Sanity test

Start the dev server and curl a paid endpoint without a payment header:

```bash
npm run dev &
sleep 3
curl -s -i http://localhost:3000/api/x402/dance-tip?dancer=1\&dance=rumba | tee /tmp/402.txt
```

With `X402_RECEIPT_SIGNING_KEY` set, the response body should include `extensions["offer-receipt"].signedOffers` with one entry per accept. With it unset, the body should be **byte-identical** to current behaviour (no `offer-receipt` key). Verify both modes.

Then verify a signed offer cryptographically:

```bash
node --input-type=module -e "
import { decodeSignedOffers, verifyOfferSignatureEIP712 } from '@x402/extensions/offer-receipt';
import fs from 'fs';
const raw = fs.readFileSync('/tmp/402.txt', 'utf8').split('\r\n\r\n')[1];
const body = JSON.parse(raw);
const offers = body.extensions['offer-receipt'].signedOffers;
const decoded = decodeSignedOffers(offers);
for (const d of decoded) {
  const ok = await verifyOfferSignatureEIP712(d.signedOffer);
  console.log(d.signedOffer.payload.network, '->', ok ? 'VERIFIED' : 'FAILED');
}
"
```

Every accept-entry network should print `VERIFIED`.

## Definition of done

- [ ] `build402Body` and `send402` are `async`; all call sites updated to `await`.
- [ ] 402 responses include `extensions["offer-receipt"].signedOffers` when env is set, and omit it cleanly when env is unset.
- [ ] Each signed offer verifies under `verifyOfferSignatureEIP712`.
- [ ] `bazaarExtension()` and `buildBazaarSchema()` are **unchanged**.
- [ ] No paid endpoint handler in `api/x402/*.js` was modified.
- [ ] `npm test` still passes.
- [ ] `git diff` reviewed.

## Stop conditions

- If you discover a `send402` caller in a non-async function that cannot trivially become async, surface the conflict instead of plumbing a `.then()` shim — async-to-callback bridging in this codebase has caused settlement-ordering bugs before.
- If the bazaar crawler validator schema test fails after the change, the extension shape leaked into `bazaar` — restore the sibling structure.
