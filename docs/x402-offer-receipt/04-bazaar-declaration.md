# Prompt 04 — Declare extension support in bazaar discovery

The signing wiring from prompts [02](02-offer-signing.md) and [03](03-receipt-signing.md) is live. Bazaar crawlers (e.g. agentic.market) won't know your endpoints sign offers and receipts unless you advertise capability in the discovery envelope. This prompt adds that declaration.

## Project rules (must follow)

From [CLAUDE.md](../../CLAUDE.md):

- **No fake data, no placeholders, no stubs.**

Additional rule for this task:

- **Do not modify `bazaarExtension()` or `buildBazaarSchema()` in [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js).** Their schemas mirror `@x402/extensions/bazaar` exactly; deviating breaks the crawler. The offer-receipt capability declaration is part of the **402 body's top-level `extensions`**, not part of `bazaar`.

## Background

Two different things live under `extensions`:

| Key | What it is | Per-request? |
|---|---|---|
| `bazaar` | Discovery metadata for crawlers — input/output schemas, descriptions. | Static per endpoint. |
| `offer-receipt` | The signed offers themselves (on 402) or the signed receipt (on 200). | **Dynamic** — generated per request. |

The plan in [00-plan.md](00-plan.md) decided they are **siblings** at the top level of `extensions`, not nested. Prompt 02 already emits the dynamic `offer-receipt` payload on 402 responses. What's missing is the **capability declaration** that a crawler reads at discovery time to know "this endpoint signs offers and receipts."

Per the x402 docs, that declaration comes from `declareOfferReceiptExtension({ includeTxHash, offerValiditySeconds })`. It returns an object describing the extension that gets merged into the discovery envelope.

## Inputs

- Helper exported by the package:
  ```js
  import { declareOfferReceiptExtension } from '@x402/extensions/offer-receipt';
  const declaration = declareOfferReceiptExtension({
    includeTxHash: false,
    offerValiditySeconds: 60,
  });
  // Returns something like:
  // { 'offer-receipt': { signer: { kid, format: 'eip712' }, includeTxHash: false, offerValiditySeconds: 60 } }
  ```
- The current 402 body shape after prompt 02:
  ```js
  extensions: { bazaar, 'offer-receipt': { signedOffers } }   // signing enabled
  extensions: { bazaar }                                       // signing disabled
  ```
- After this prompt, the shape becomes:
  ```js
  extensions: {
    bazaar,
    'offer-receipt': {
      signer: { kid, format: 'eip712' },
      includeTxHash: false,
      offerValiditySeconds: 60,
      signedOffers: [ ... ]
    }
  }
  ```

The **declaration fields** (`signer`, `includeTxHash`, `offerValiditySeconds`) are static and identical across all 9 endpoints. The **dynamic field** (`signedOffers`) is generated per request.

## Task

### 1. Export a declaration helper from the signer module

In [api/_lib/x402-offer-receipt.js](../../api/_lib/x402-offer-receipt.js), add an export:

```js
// Static capability declaration for crawlers. Returns null when the feature
// is disabled, so callers can skip merging it.
export function offerReceiptDeclaration() {
  if (!issuer) return null;
  return declareOfferReceiptExtension({
    includeTxHash: false,
    offerValiditySeconds: 60,
  });
}
```

`declareOfferReceiptExtension` returns the **whole** `{ 'offer-receipt': { ... } }` object. Be sure to merge correctly so you end up with one `'offer-receipt'` key (not two) in the final `extensions` object.

### 2. Merge the declaration into the 402 body

Update [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js) `build402Body`. Take the declaration produced by `offerReceiptDeclaration()` and merge it with the per-request `signedOffers`:

```js
import { signOffersForAccepts, offerReceiptDeclaration } from './x402-offer-receipt.js';

// ...inside build402Body, after computing signedOffers...
const declaration = offerReceiptDeclaration();
const extensions = { bazaar };
if (declaration && signedOffers.length) {
  extensions['offer-receipt'] = { ...declaration['offer-receipt'], signedOffers };
} else if (declaration) {
  extensions['offer-receipt'] = declaration['offer-receipt'];
}
return { x402Version: X402_VERSION, error, resource: {...}, accepts: [...], extensions };
```

The `signedOffers` array shadows nothing in the declaration (declaration has no `signedOffers` key), so this is a clean merge.

### 3. Confirm `bazaar` is untouched

```bash
git diff api/_lib/x402-spec.js | grep -E 'bazaar(Extension|Schema)' | head
```

This grep should return only context lines — no `+` or `-` lines touching `bazaarExtension` or `buildBazaarSchema` function bodies.

### 4. Sanity test

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000/api/x402/dance-tip?dancer=1\&dance=rumba | jq '.extensions["offer-receipt"]'
```

With `X402_RECEIPT_SIGNING_KEY` set, the output should show **both** the static declaration fields (`signer`, `includeTxHash`, `offerValiditySeconds`) **and** the dynamic `signedOffers` array. With the env unset, the `offer-receipt` key should be absent entirely.

## Definition of done

- [ ] `offerReceiptDeclaration()` is exported from `api/_lib/x402-offer-receipt.js`.
- [ ] `build402Body` merges declaration + `signedOffers` into a single `extensions["offer-receipt"]` object.
- [ ] `bazaarExtension()` and `buildBazaarSchema()` source is unchanged.
- [ ] 402 responses with env set show declaration + signed offers together.
- [ ] 402 responses with env unset show no `offer-receipt` key.
- [ ] `npm test` still passes.
- [ ] `git diff` reviewed.

## Stop conditions

- If `declareOfferReceiptExtension` is not exported from `@x402/extensions/offer-receipt` at the documented path, surface it. Do not hand-roll the declaration shape — it must match what crawlers parse.
