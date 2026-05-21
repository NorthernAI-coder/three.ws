# USE-16: Sign-In-With-X — Returning customer auth (CAIP-122)

## Goal
Implement SIWX on paid endpoints so a buyer who has previously paid can sign a wallet challenge to re-access the resource without paying again. Also enable auth-only routes (no payment, just wallet ownership).

## Why
- Most paid resources are stateful (subscriptions, premium articles, dataset access). Re-paying every visit is bad UX.
- The same machinery (CAIP-122 challenge + sign + verify) enables wallet-gated free routes too.

## Reference
- Docs: [/tmp/x402-docs/docs/extensions/sign-in-with-x.mdx](/tmp/x402-docs/docs/extensions/sign-in-with-x.mdx)
- Spec: [/tmp/x402-docs/specs/extensions/sign-in-with-x.md](/tmp/x402-docs/specs/extensions/sign-in-with-x.md)
- CAIP-122: https://chainagnostic.org/CAIPs/caip-122

## Dependencies
- USE-00, USE-02, USE-06
- USE-05 / Redis (for paid-history + nonce storage)

## Files to create
- `api/_lib/x402/siwx-storage.js` — implements `SIWxStorage`: `hasPaid()`, `recordPayment()`, `hasUsedNonce()`, `recordNonce()` backed by Redis
- `api/_lib/x402/siwx-server.js` — wraps `createSIWxResourceServerExtension`
- `api/_lib/x402/siwx-client.js` — wraps `createSIWxClientExtension`
- `api/x402/siwx-content.js` — example route demonstrating SIWX (re-access without repay)
- `api/x402/profile.js` — auth-only route (`accepts: []`) — wallet signature required, no payment

## Files to modify
- Every paid endpoint that benefits from re-access: declare `sign-in-with-x` extension
- `public/x402.js` — client browses signs SIWX challenge when offered
- `.env.example` — `SIWX_NONCE_TTL_SECONDS` (default 300)

## Implementation

### Server registration
```js
import { createSIWxResourceServerExtension } from "@x402/extensions/sign-in-with-x";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

const verifyChain = isProd ? base : baseSepolia;
const publicClient = createPublicClient({ chain: verifyChain, transport: http() });

resourceServer.registerExtension(
  createSIWxResourceServerExtension({
    storage: redisSiwxStorage,
    verifyOptions: { evmVerifier: publicClient.verifyMessage }, // EIP-1271 / EIP-6492 smart wallet support
  })
);
```

### Per-route declaration
For repayable + reaccessible routes:
```js
extensions: declareSIWxExtension({
  statement: "Sign in to re-access content you've previously paid for",
})
```

For auth-only routes:
```js
{ accepts: [], extensions: declareSIWxExtension({ network: NETWORK, statement: "Sign in to view your profile" }) }
```

### Smart wallet support
Enable EIP-1271 + EIP-6492 via `publicClient.verifyMessage`. This makes Coinbase Smart Wallet, Safe, Argent etc. work.

### Client
```js
import { createSIWxClientExtension } from "@x402/extensions/sign-in-with-x";
client.registerExtension(createSIWxClientExtension({ signers: [evmSigner, svmSigner] }));
```

### Nonce replay protection
Implement both `hasUsedNonce` and `recordNonce` in storage. If only one is implemented, the SDK throws — both or neither.

## Wiring checklist
- [ ] Storage persists paid addresses per resource
- [ ] Smart wallet verification enabled (EIP-1271/EIP-6492)
- [ ] Auth-only route works without `accepts`
- [ ] Multi-chain `supportedChains` declared on routes that accept both EVM and Solana
- [ ] Nonce replay protection on (both storage methods implemented)

## Acceptance
- [ ] Buyer pays for `/api/x402/siwx-content` — receives access; storage records payment
- [ ] Second access via SIWX header (no payment) — returns 200
- [ ] Different wallet without payment history — denied (server returns 402)
- [ ] `/api/x402/profile` accepts SIWX-only access (no payment ever required)
- [ ] Reusing the same nonce twice returns an error (replay rejected)
- [ ] Smart wallet (Coinbase Smart Wallet) successfully signs and verifies
