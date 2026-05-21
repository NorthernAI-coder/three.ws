# USE-17: Offer & Receipt — Signed cryptographic proofs

## Goal
Sign every 402 offer (EIP-712) and every 200 receipt (after payment) so buyers receive cryptographic proof of the interaction. Support both EIP-712 (did:pkh) and JWS (did:web) formats. Host `did.json` for verifiers.

## Why
- Verifiable "I paid this server, this much, for this resource" is the foundation of reputation systems, attestation pipelines, and dispute resolution.
- Ecosystem partners build reputation scores on top of these artifacts.

## Reference
- Docs: [/tmp/x402-docs/docs/extensions/offer-receipt.mdx](/tmp/x402-docs/docs/extensions/offer-receipt.mdx)
- Spec: [/tmp/x402-docs/specs/extensions/extension-offer-and-receipt.md](/tmp/x402-docs/specs/extensions/extension-offer-and-receipt.md)

## Dependencies
- USE-00, USE-02

## Files to create
- `api/_lib/x402/offer-receipt-issuer.js` — constructs the EIP-712 or JWS issuer using a DEDICATED signing key
- `api/_lib/x402/offer-receipt-server.js` — registers `createOfferReceiptExtension` on the resource server
- `api/x402/did.js` — serves `/.well-known/did.json` for `did:web` JWS verification
- `api/_lib/x402/receipt-storage.js` — durable log of issued receipts (for our own records)

## Files to modify
- `vercel.json` — route `/.well-known/did.json` → `/api/x402/did`
- Every paid endpoint that benefits from receipts: declare `offer-receipt` extension
- `.env.example` — `OFFER_RECEIPT_SIGNING_PRIVATE_KEY` (DEDICATED key, NOT the payment-receiving key), `OFFER_RECEIPT_FORMAT` (`eip712` or `jws`), `SERVER_DOMAIN`

## Implementation

### Key separation (CRITICAL)
The signing key MUST NOT be the wallet receiving payments. Use a dedicated EOA. If signing format is JWS, use a managed KMS in production (Vercel doesn't have KMS — use Google KMS, AWS KMS, or HashiCorp Vault).

### EIP-712 issuer
```js
import { privateKeyToAccount } from "viem/accounts";
import { createEIP712OfferReceiptIssuer } from "@x402/extensions/offer-receipt";

const signingAccount = privateKeyToAccount(process.env.OFFER_RECEIPT_SIGNING_PRIVATE_KEY);
const kid = `did:pkh:eip155:1:${signingAccount.address}#key-1`;
const issuer = createEIP712OfferReceiptIssuer(kid, signingAccount.signTypedData.bind(signingAccount));
```

### JWS issuer (alternative)
For Solana-native infra (Ed25519) or enterprise KMS:
```js
const issuer = createJWSOfferReceiptIssuer(kid, jwsSigner);
```

### Register
```js
resourceServer.registerExtension(createOfferReceiptExtension(issuer));
```

### Per-route
```js
extensions: { ...declareOfferReceiptExtension({ includeTxHash: false, offerValiditySeconds: 300 }) }
```

`includeTxHash: false` by default for privacy. Set `true` per route if needed (e.g., for receipts that feed reputation systems).

### `did.json`
For JWS, serve a real DID document containing the public key. Even for EIP-712 it's good practice to list the signing address as a `verificationMethod` for stronger binding.

### Receipt storage
Write every issued receipt to durable storage (Redis with long TTL or a database). Buyers can request a copy of their own receipts later via `/api/x402/my-receipts?address=0x...&since=<timestamp>` (signed by the buyer's wallet for auth).

## Wiring checklist
- [ ] Signing key is dedicated, NOT the payment-receiving key
- [ ] `did.json` served at `/.well-known/did.json` (rewrite in `vercel.json`)
- [ ] Every relevant paid endpoint declares the extension
- [ ] Buyer can extract + verify offers from 402 and receipts from 200 (verify functions imported from SDK)
- [ ] Receipt log durable

## Acceptance
- [ ] Buyer pays endpoint; receipt extracted from `PAYMENT-RESPONSE` header
- [ ] `verifyReceiptSignatureEIP712(receipt)` returns valid for signature
- [ ] `verifyReceiptMatchesOffer(receipt, offer, [buyerAddress])` passes
- [ ] `/.well-known/did.json` returns valid W3C DID document
- [ ] If using JWS: receipt verifies against the public key from `did.json`
- [ ] Receipt log queryable: `/api/x402/my-receipts?address=0x...&signature=...` returns buyer's receipts
