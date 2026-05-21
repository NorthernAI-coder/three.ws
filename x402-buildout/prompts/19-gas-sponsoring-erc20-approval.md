# USE-19: ERC-20 Approval Gas Sponsoring (Universal)

## Goal
Enable gasless Permit2 onboarding for ANY ERC-20, including tokens that don't implement EIP-2612. Facilitator broadcasts the client's pre-signed `approve(Permit2, MaxUint256)` transaction in an atomic batch with settlement.

## Why
- USE-18 only works for EIP-2612 tokens. For everything else (legacy ERC-20s, exotic tokens), this is the universal fallback.
- Together with USE-18, it covers 100% of ERC-20s for gasless first-time onboarding.

## Reference
- Docs: [/tmp/x402-docs/docs/extensions/erc20-approval-gas-sponsoring.mdx](/tmp/x402-docs/docs/extensions/erc20-approval-gas-sponsoring.mdx)
- Spec: [/tmp/x402-docs/specs/extensions/erc20_gas_sponsoring.md](/tmp/x402-docs/specs/extensions/erc20_gas_sponsoring.md)

## Dependencies
- USE-00, USE-02
- USE-18 (typically advertised alongside)

## Files to modify
- Every Permit2-using paid endpoint that wants universal support: add `erc20ApprovalGasSponsoring` alongside `eip2612GasSponsoring`
- `.env.example` — no new vars

## Implementation

### Per-route declaration
```js
import { declareErc20ApprovalGasSponsoringExtension } from "@x402/extensions/erc20-approval-gas-sponsoring";
import { declareEip2612GasSponsoringExtension } from "@x402/extensions/eip2612-gas-sponsoring";

extensions: {
  ...declareEip2612GasSponsoringExtension(),
  ...declareErc20ApprovalGasSponsoringExtension(),
}
```

The client automatically picks: EIP-2612 if the token supports it, ERC-20 approval otherwise.

### Client side
`ExactEvmScheme` handles signing the raw approval transaction without broadcasting. Requires `signTransaction` and `getTransactionCount` capabilities on the signer — verify these are present in our `toClientEvmSigner` setup.

### Atomic batch
The facilitator executes:
1. (Optional) Transfer gas to client wallet if needed
2. Broadcast client's signed approval
3. Call `x402ExactPermit2Proxy.settle`

All three in a single atomic batch — no front-running window.

## Wiring checklist
- [ ] Both extensions declared on routes
- [ ] Test against a token that does NOT implement EIP-2612 (find one on Base Sepolia)
- [ ] Verify on-chain trace shows: gas transfer (if needed) + approve + settle in one batch

## Acceptance
- [ ] Fresh wallet with non-EIP-2612 ERC-20 + zero ETH successfully pays
- [ ] On-chain trace shows atomic batch: client's `approve` transaction immediately followed by `settle`
- [ ] No front-running possible (verified by tx ordering)
- [ ] EIP-2612 path still works for USDC (USE-18 not broken)
