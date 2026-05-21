# Prompt 01 — Foundation: deps, env, signer module

You are landing the **foundation** for the x402 Signed Offers & Receipts feature. See [00-plan.md](00-plan.md) for the locked-in decisions — do not re-litigate them.

## Project rules (must follow)

From [CLAUDE.md](../../CLAUDE.md):

- **No mocks. No fake data. No placeholders.** Real APIs, real keys.
- **No `// TODO`, no stub functions, no commented-out code.** If you write it, finish it.
- **No `throw new Error("not implemented")`.**
- Errors handled at boundaries (network, user input). Internal code trusts itself.

## Inputs

- Locked decisions in [00-plan.md](00-plan.md):
  - Signing format: **EIP-712** (`did:pkh:eip155:1:${address}#key-1`).
  - Env var: `X402_RECEIPT_SIGNING_KEY` (hex private key, `0x`-prefixed, 32 bytes).
  - Module path: `api/_lib/x402-offer-receipt.js`.
  - When env is unset, exports a **no-op issuer** that returns `null` for sign calls. This is the rollback toggle.
- Existing env loader: [api/_lib/env.js](../../api/_lib/env.js). Add the new field there using whatever pattern the existing `X402_PAY_TO_*` fields use.

## Task

### 1. Install dependencies

```bash
npm install @x402/extensions @x402/core viem
```

`viem` may already be in [package.json](../../package.json). If so, ensure the installed version is `>=2.0.0` (required by `@x402/extensions`). Do not downgrade other packages.

### 2. Add the env var

- In [api/_lib/env.js](../../api/_lib/env.js), add `X402_RECEIPT_SIGNING_KEY` next to the existing `X402_PAY_TO_*` fields. Do not assert it as required — the no-op fallback depends on the field being optional.
- In [.env.example](../../.env.example), add a documented block. The placeholder value must clearly be a placeholder (e.g. `0xREPLACE_WITH_DEDICATED_SIGNING_KEY_HEX_64_CHARS`) and the comment must say "dedicated signing key, NOT a wallet that holds funds" and "rotate by changing the value and bumping `#key-1` → `#key-2` in code if needed."

### 3. Create the signer module

Create [api/_lib/x402-offer-receipt.js](../../api/_lib/x402-offer-receipt.js) exporting:

```js
// One singleton issuer per process. Resolves to the EIP-712 issuer when
// X402_RECEIPT_SIGNING_KEY is set, otherwise to a no-op that returns null.
// The no-op is the feature flag — unset the env var in Vercel to roll back
// without redeploying code.
export const issuer;             // { kid, signerAddress, sign } | null

// Sign one offer per accept entry on a 402 response. Returns the array of
// signed offers in the wire shape consumed by extractOffersFromPaymentRequired
// on the client side. Returns [] when the issuer is null (feature disabled).
export async function signOffersForAccepts({ accepts, resourceUrl, validitySeconds });

// Sign one receipt for a settled 200 response. Returns the signed receipt
// in the wire shape consumed by extractReceiptFromResponse on the client
// side. Returns null when the issuer is null (feature disabled) or when
// the inputs are insufficient.
export async function signReceipt({ resourceUrl, payer, network, txHash, includeTxHash });
```

Implementation requirements:

- Import `createEIP712OfferReceiptIssuer` from `@x402/extensions/offer-receipt` and `privateKeyToAccount` from `viem/accounts`.
- `kid` is exactly `did:pkh:eip155:1:${signerAddress}#key-1`. Lowercase the address per CAIP-10.
- `validitySeconds` defaults to `60` if omitted (matches `maxTimeoutSeconds`).
- `includeTxHash` defaults to `false`.
- `validUntil` is `Math.floor(Date.now() / 1000) + validitySeconds`.
- The `offerType` field on each signed offer comes from the accept's `scheme` field (so BSC's `'direct'` flows through unchanged).
- If `X402_RECEIPT_SIGNING_KEY` is malformed (wrong length, not hex), throw at module-load time with a clear `x402_receipt_signing_key_invalid` error. Don't fail silently — a malformed key means the operator intended to enable signing but configured it wrong.
- If `signReceipt` is called with `payer == null` or `network == null`, return `null` and do not throw. That's a normal condition for endpoints whose settlement skipped the facilitator (e.g. BSC `direct`); we want to keep the response shape clean.

### 4. Smoke check

After writing the module:

```bash
node --input-type=module -e "import { issuer, signOffersForAccepts, signReceipt } from './api/_lib/x402-offer-receipt.js'; console.log('issuer:', issuer ? issuer.signerAddress : 'no-op'); console.log('offers (no-op safe):', await signOffersForAccepts({ accepts: [], resourceUrl: 'https://example.com/x' })); console.log('receipt (no-op safe):', await signReceipt({ resourceUrl: 'https://example.com/x', payer: null, network: null }));"
```

With `X402_RECEIPT_SIGNING_KEY` unset, this should print `issuer: no-op`, `offers: []`, `receipt: null`. With a real key set, `issuer` should print the recovered address.

## Definition of done

- [ ] `@x402/extensions`, `@x402/core`, and `viem` (>=2) are in `package.json` `dependencies` and `npm install` succeeds.
- [ ] `api/_lib/env.js` exposes `X402_RECEIPT_SIGNING_KEY`.
- [ ] `.env.example` documents the new var with a clear placeholder and the rotation guidance.
- [ ] `api/_lib/x402-offer-receipt.js` exists and exports `issuer`, `signOffersForAccepts`, `signReceipt`.
- [ ] The smoke check above works in both modes (env set, env unset).
- [ ] `npm test` still passes.
- [ ] `git diff` reviewed by you. No `TODO`, no stubs, no commented-out code.

## Stop conditions

- If `@x402/extensions` does not expose `createEIP712OfferReceiptIssuer` at the documented path, surface this **before** writing anything else — the spec or package layout may have changed since the planning doc was written.
- If `viem` cannot be upgraded to `>=2` without breaking other packages, surface this with the conflict before proceeding.
