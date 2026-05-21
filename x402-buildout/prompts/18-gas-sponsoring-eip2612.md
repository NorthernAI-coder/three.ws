# USE-18: EIP-2612 Gas Sponsoring

## Goal
Enable gasless Permit2 onboarding for tokens implementing EIP-2612 (USDC, DAI, many modern ERC-20s). Client signs an off-chain permit; facilitator submits it atomically with settlement.

## Why
- New buyers without ETH/POL/MATIC for gas can't complete a Permit2 approval. This blocks first-time use.
- EIP-2612 sponsoring removes the friction entirely for compatible tokens.

## Reference
- Docs: [/tmp/x402-docs/docs/extensions/eip2612-gas-sponsoring.mdx](/tmp/x402-docs/docs/extensions/eip2612-gas-sponsoring.mdx)
- Spec: [/tmp/x402-docs/specs/extensions/eip2612_gas_sponsoring.md](/tmp/x402-docs/specs/extensions/eip2612_gas_sponsoring.md)

## Dependencies
- USE-00, USE-02

## Files to modify
- Every Permit2-using paid endpoint (not EIP-3009 default): add `eip2612GasSponsoring` to its extensions
- `api/_lib/x402/sdk.js` — ensure facilitator client supports the extension (it does by default in `@x402/extensions`)
- `.env.example` — no new vars (handled by facilitator)

## Files to create
- `api/x402/permit2-paid-demo.js` — demo endpoint that uses Permit2 + EIP-2612 sponsoring (so we have something to test against)

## Implementation

### Per-route declaration
```js
import { declareEip2612GasSponsoringExtension } from "@x402/extensions/eip2612-gas-sponsoring";

const route = {
  accepts: [{
    scheme: "exact",
    network: "eip155:84532",
    price: "$0.01",
    payTo: getEvmAddress(),
    extra: { assetTransferMethod: "permit2" } // force Permit2
  }],
  extensions: { ...declareEip2612GasSponsoringExtension() },
};
```

### Client side
`ExactEvmScheme` handles this automatically when the server advertises the extension AND the token supports EIP-2612. No buyer-side wiring beyond `USE-06`.

### Token selection
Use a token that actually implements EIP-2612 on Base Sepolia. USDC on Base does. Verify by reading `name()` and `version()` from the token contract — both must be EIP-712 domain params.

### Verification
Sponsored settlement calls `x402ExactPermit2Proxy.settleWithPermit`. The Proxy is at the canonical `0x402085c248EeA27D92E8b30b2C58ed07f9E20001` across all EVM chains.

## Wiring checklist
- [ ] Demo endpoint uses Permit2 + EIP-2612 sponsoring extension
- [ ] First-time buyer (no Permit2 allowance) completes the flow without holding gas
- [ ] Facilitator submits `settleWithPermit` atomically — verified by reading the tx and confirming both permit + transfer landed

## Acceptance
- [ ] Fresh wallet on Base Sepolia with USDC but ZERO ETH successfully pays through the endpoint
- [ ] Transaction trace shows EIP-2612 permit + Permit2 transfer in a single tx
- [ ] No "insufficient gas" error
- [ ] Subsequent calls reuse Permit2 allowance — no permit signature needed
