# USE-05: Seller — `batch-settlement` scheme on EVM (channel-based micropayments)

## Goal
Stand up the `batch-settlement` scheme: client funds a channel once, signs offchain cumulative vouchers per request, server claims many channels in one tx and settles separately. Use Redis-backed channel storage so the server is multi-instance safe (Vercel serverless).

## Why
- For high-volume paid traffic (per-call API, streaming, repeated tool calls) — gas of `exact`/`upto` per request becomes prohibitive.
- Vercel functions are stateless and multi-instance; in-memory channel storage will lose state between invocations.

## Reference
- Scheme overview: [/tmp/x402-docs/docs/schemes/batch-settlement.mdx](/tmp/x402-docs/docs/schemes/batch-settlement.mdx)
- Spec: [/tmp/x402-docs/specs/schemes/batch-settlement/scheme_batch_settlement.md](/tmp/x402-docs/specs/schemes/batch-settlement/scheme_batch_settlement.md)
- EVM impl (long): [/tmp/x402-docs/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md](/tmp/x402-docs/specs/schemes/batch-settlement/scheme_batch_settlement_evm.md)
- Reference Redis example: [examples/typescript/fullstack/next-batch-settlement-redis](https://github.com/x402-foundation/x402/tree/main/examples/typescript/fullstack/next-batch-settlement-redis)

## Dependencies
- USE-00, USE-01, USE-02

## Files to create
- `api/x402/batch-stream.js` — paid endpoint advertising `batch-settlement`
- `api/_lib/x402/batch/redis-channel-storage.js` — implements `ChannelStorage` interface backed by Vercel KV / Upstash Redis
- `api/_lib/x402/batch/channel-manager.js` — server-side periodic claim + settle + refund runner
- `api/x402-batch/claim.js` — cron-callable route to trigger `claim`
- `api/x402-batch/settle.js` — cron-callable route to trigger `settle`
- `api/x402-batch/refund.js` — cron-callable route to trigger refund of idle channels

## Files to modify
- `api/_lib/x402/sdk.js` — register `BatchSettlementEvmScheme` with our facilitator
- `vercel.json` — routes for `/api/x402-batch/{claim,settle,refund}` AND a Vercel cron config to fire them on a schedule
- `.env.example` — `REDIS_URL` (or `KV_URL` / `UPSTASH_REDIS_REST_URL`), `BATCH_RECEIVER_AUTHORIZER_PRIVATE_KEY`, `BATCH_WITHDRAW_DELAY_SECONDS`
- `package.json` — `ioredis` or `@upstash/redis`

## Implementation

### Channel storage shape
The `ChannelStorage` interface needs (per spec):
- `getChannel(channelId)`
- `saveChannel(channelId, state)` — atomic write with optimistic concurrency
- `listChannelsByReceiver(receiver, token)` — for batch claim
- `deleteChannel(channelId)` — after full refund

Use Redis hashes keyed by `channel:<channelId>` + a secondary index `receiver:<addr>:<token>` (Redis Set of channelIds). Use Lua / `MULTI` for atomic voucher updates.

### Receiver authorizer
- Generate a dedicated `receiverAuthorizerSigner` key (NOT the payment-receiving address).
- This signs claim and refund authorizations via EIP-712.
- Store private key in env, surface address via `extra.receiverAuthorizer` in `PaymentRequirements`.

### Withdraw delay
- Default to 900 seconds (15 minutes — minimum per spec).
- Configurable via `BATCH_WITHDRAW_DELAY_SECONDS`.

### Channel manager (cron-driven)
Vercel cron config:
```json
"crons": [
  { "path": "/api/x402-batch/claim", "schedule": "* * * * *" },
  { "path": "/api/x402-batch/settle", "schedule": "*/5 * * * *" },
  { "path": "/api/x402-batch/refund", "schedule": "0 */1 * * *" }
]
```
(Adjust based on volume. Claim every minute is safe. Settle less often saves gas.)

### Paid endpoint
- `accepts[].scheme: "batch-settlement"` with per-request max price
- `accepts[].extra.receiverAuthorizer`, `accepts[].extra.withdrawDelay`, `accepts[].extra.assetTransferMethod` ("eip3009" default)
- `setSettlementOverrides()` in handler to charge actual usage per request

### Auth on cron routes
Vercel crons hit cron routes with the standard `Authorization: Bearer ${CRON_SECRET}` header. Validate this.

## Wiring checklist
- [ ] `REDIS_URL` provisioned (or Vercel KV linked)
- [ ] `receiverAuthorizer` address printed at startup for verification
- [ ] Channel manager idempotent — replay-safe; multiple cron firings don't double-claim
- [ ] Cron routes return 401 if `Authorization` header missing in production
- [ ] Endpoint advertises `extra.withdrawDelay` between 900 and 2592000 (spec bounds)
- [ ] UI in `public/x402.js` shows channel state (balance, charged, claimed)

## Acceptance
- [ ] Buyer opens channel with first paid request (deposit + voucher in single payload)
- [ ] Subsequent requests use voucher-only payload (no on-chain tx per request)
- [ ] Cron-triggered claim consolidates multiple channels into one onchain tx
- [ ] Settle moves claimed funds to receiver; transaction visible on Basescan
- [ ] Cooperative refund returns idle balance to payer
- [ ] Server restart preserves channel state via Redis (verified by killing dev server and reading state)
- [ ] Corrective 402 on cumulative-amount mismatch — buyer recovers automatically
