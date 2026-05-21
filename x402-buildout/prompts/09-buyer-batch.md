# USE-09: Buyer — `batch-settlement` client with persistent channel state

## Goal
Register `BatchSettlementEvmScheme` on the buyer client with file-backed (Node) or IndexedDB-backed (browser) channel storage. Survive process restarts. Auto-recover via corrective 402.

## Why
- Long-lived agent processes (USE-29, USE-30, USE-40) make many small paid calls. Without batch-settlement they'd burn gas on every request.
- Per-process in-memory channel state is lost when the process dies; clients must persist state OR rely on corrective 402 recovery.

## Reference
- Scheme docs: [/tmp/x402-docs/docs/schemes/batch-settlement.mdx](/tmp/x402-docs/docs/schemes/batch-settlement.mdx)
- EVM spec: [/tmp/x402-docs/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md](/tmp/x402-docs/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md)
- Client example: [examples/typescript/clients/batch-settlement](https://github.com/x402-foundation/x402/tree/main/examples/typescript/clients/batch-settlement)

## Dependencies
- USE-00, USE-06, USE-07
- USE-05 (so a `batch-settlement` endpoint exists to test against)

## Files to create
- `api/_lib/x402/buyer-batch.js` — registers `BatchSettlementEvmScheme` with `FileClientChannelStorage`
- `public/x402-buyer-batch.js` — browser variant with IndexedDB storage
- `scripts/x402-batch-refund.mjs` — CLI to issue cooperative refunds for idle channels

## Files to modify
- `api/_lib/x402/buyer-fetch.js` — accept `{ withBatch: true }` option that adds batch scheme
- `.env.example` — `EVM_VOUCHER_SIGNER_PRIVATE_KEY` (optional, for smart-wallet payers)

## Implementation

### Node-side storage
```js
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/client";
import { FileClientChannelStorage } from "@x402/evm/batch-settlement/client/file-storage";
import { toClientEvmSigner } from "@x402/evm";

const batchScheme = new BatchSettlementEvmScheme(toClientEvmSigner(signer, publicClient), {
  depositPolicy: { depositMultiplier: 5 },
  storage: new FileClientChannelStorage({ directory: process.env.X402_CHANNEL_STORAGE_DIR || "./.x402-channels" }),
});
client.register("eip155:*", batchScheme);
```

### Browser storage
Use IndexedDB via `idb` package. Channels are keyed by `channelId`. Store voucher signatures + cumulative amounts. Provide an `inspectChannels()` helper for the UI to render channel state.

### Voucher signer delegation
For browser flows with smart wallets (Coinbase Smart Wallet, etc.) — pass an EOA `voucherSigner` so vouchers are verified by ECDSA recovery instead of EIP-1271 RPC checks. This is faster and avoids per-voucher RPC calls.

### Cooperative refund CLI
`node scripts/x402-batch-refund.mjs <resourceUrl> [--amount=<atomicUnits>]` — calls `batchScheme.refund(url, { amount })`. Returns the refund tx hash on success.

### Deposit strategy
Cap deposits at a sane max (e.g., $5 default) so a bug in the multiplier doesn't drain the wallet:
```js
depositStrategy: ({ depositAmount }) => {
  const max = BigInt(process.env.X402_MAX_DEPOSIT_ATOMIC || "5000000");
  const amt = BigInt(depositAmount);
  return amt > max ? max : undefined;
}
```

## Wiring checklist
- [ ] Node clients persist `.x402-channels/*.json` across restarts
- [ ] Browser clients persist channel state to IndexedDB
- [ ] Both `BatchSettlementEvmScheme` and `ExactEvmScheme` registered — the SDK picks per server response
- [ ] Deposit cap prevents runaway deposits
- [ ] Refund CLI usable for ops

## Acceptance
- [ ] First request to a `batch-settlement` endpoint opens a channel (deposit + voucher in one payload, on-chain tx visible)
- [ ] Subsequent requests use voucher-only payloads (no on-chain tx, server returns `transaction: ""`)
- [ ] Killing the process and restarting picks up where we left off (verified by reading `.x402-channels/`)
- [ ] Corrective 402 (server's channel state differs from client's) triggers client recovery and the next request succeeds
- [ ] `scripts/x402-batch-refund.mjs` returns idle funds to the buyer wallet
