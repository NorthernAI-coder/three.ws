# USE-20: Builder-Code — ERC-8021 On-chain attribution

## Goal
Append ERC-8021 Schema 2 CBOR-encoded attribution data to settlement calldata, so every x402 settlement transaction permanently records: app code, service codes, wallet code. Enables on-chain analytics, builder royalty programs, and provenance tracking.

## Why
- Coinbase and other ecosystem partners are paying out builder rewards based on attributed volume.
- Lets us prove our app's economic activity on-chain without external indexing.

## Reference
- Spec: [/tmp/x402-docs/specs/extensions/builder_code.md](/tmp/x402-docs/specs/extensions/builder_code.md)
- ERC-8021: https://eips.ethereum.org/EIPS/eip-8021

## Dependencies
- USE-00, USE-02 (EVM only — Solana not applicable)

## Files to create
- `api/_lib/x402/builder-code.js` — declares the app code, helpers to add service codes

## Files to modify
- Every EVM paid endpoint: declare `builder-code` extension
- Buyer client: echo server's `a` (app code) in `PAYMENT-SIGNATURE` (client side has limited responsibility — server populates `w`)
- `.env.example` — `X402_BUILDER_CODE_APP` (matches `^[a-z0-9_]{1,32}$`)

## Implementation

### Per-route
```js
import { declareBuilderCodeExtension, BUILDER_CODE } from "@x402/extensions/builder-code";

extensions: { [BUILDER_CODE]: declareBuilderCodeExtension({ a: process.env.X402_BUILDER_CODE_APP }) }
```

### Service codes (per-call)
For routes that route to multiple internal services, append service codes:
```js
const services = ["pose-studio", "openai-proxy"]; // per request
const ext = { [BUILDER_CODE]: { a: appCode, s: services } };
```

### Client behavior
Buyer SDK echoes `a` automatically. Tampering = rejection. The wallet code (`w`) is set by the wallet client (Coinbase Wallet etc.) — outside our control unless we set it for our own demo client.

### Wallet code
For our own buyer client, set `w: "3d-agent"` so we attribute our own usage too.

### On-chain verification
After settlement, parse the tx calldata and confirm:
- Last bytes are the schema marker (per ERC-8021)
- Decoding the CBOR suffix yields `{ a, s?, w? }`
- Values match what we declared

## Wiring checklist
- [ ] App code chosen, documented in `.env.example`
- [ ] Every EVM paid endpoint declares the extension
- [ ] Service codes added where multi-service
- [ ] Buyer client sets wallet code `w`
- [ ] Settlement calldata contains ERC-8021 CBOR suffix

## Acceptance
- [ ] Pay an endpoint; pull the on-chain tx by hash
- [ ] Tx calldata last bytes = ERC-8021 schema marker
- [ ] CBOR suffix decodes to `{ a: "3d_agent", s: [...], w: "3d-agent" }`
- [ ] Client that tampers with `a` (sends wrong value) is rejected with a clear error
