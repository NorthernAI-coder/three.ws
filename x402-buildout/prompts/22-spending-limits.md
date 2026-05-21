# USE-22: Spending Limits — Client lifecycle hook

## Goal
Enforce per-call and per-session spending caps on every buyer client via `onBeforePaymentCreation`. Critical for autonomous agents (USE-29..40) to prevent runaway spending.

## Why
- Without caps, a bug in agent logic could drain the wallet.
- Operators want a hard ceiling per call AND a daily / session budget.

## Reference
- Lifecycle hooks: [/tmp/x402-docs/docs/advanced-concepts/lifecycle-hooks.mdx](/tmp/x402-docs/docs/advanced-concepts/lifecycle-hooks.mdx)

## Dependencies
- USE-00, USE-06, USE-07

## Files to create
- `api/_lib/x402/spending-cap.js` — `installSpendingCap(client, { maxPerCall, maxPerHour, maxPerDay })`
- `api/_lib/x402/spending-ledger.js` — durable ledger of every payment attempt (Redis) for windowed sums

## Files to modify
- `api/_lib/x402/buyer-fetch.js` — accept `{ caps: { ... } }` option that installs the hook
- `api/_lib/x402/buyer-axios.js` — same
- `public/x402-buyer.js` — same, with browser-local storage for ledger
- `.env.example` — `X402_MAX_PER_CALL_ATOMIC`, `X402_MAX_PER_HOUR_ATOMIC`, `X402_MAX_PER_DAY_ATOMIC`

## Implementation

### Hook
```js
client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
  const amount = BigInt(selectedRequirements.amount);

  if (amount > BigInt(caps.maxPerCall)) {
    return { abort: true, reason: `Payment ${amount} exceeds per-call cap ${caps.maxPerCall}` };
  }

  const recent = await spendingLedger.windowedSum(buyerAddress, "1h");
  if (recent + amount > BigInt(caps.maxPerHour)) {
    return { abort: true, reason: `Hourly cap exceeded` };
  }

  const daily = await spendingLedger.windowedSum(buyerAddress, "24h");
  if (daily + amount > BigInt(caps.maxPerDay)) {
    return { abort: true, reason: `Daily cap exceeded` };
  }
});

client.onAfterPaymentCreation(async ({ selectedRequirements }) => {
  await spendingLedger.record({
    address: buyerAddress,
    amount: selectedRequirements.amount,
    network: selectedRequirements.network,
    timestamp: Date.now(),
  });
});
```

### Multi-network caps
Convert amounts to USD for cross-network aggregation. Pull a price feed (we already have Pump.fun feed infrastructure; use a stablecoin → USD oracle for non-USDC tokens).

### Asynchronous reconciliation
Recording happens after successful payment, but the cap check happens before. For strict caps, this means brief races between concurrent calls. If strictness matters, use Redis `INCRBY` with rollback on payment failure.

### Browser caps
Browser-side ledger uses `localStorage` keyed by wallet address. Persists across reloads. Resets at midnight UTC for daily caps.

## Wiring checklist
- [ ] Caps installable on every buyer client (server + browser)
- [ ] Ledger durable in Redis (server) and localStorage (browser)
- [ ] Hourly + daily sliding windows correctly bounded
- [ ] Multi-network amounts normalized to USD for aggregation

## Acceptance
- [ ] Setting `maxPerCall: "1000"` (USDC = $0.001) blocks any call requiring more
- [ ] After paying $0.10 in an hour, an 11th cent purchase is blocked if `maxPerHour: "100000"`
- [ ] Daily reset works at the configured boundary
- [ ] Aborted payments don't record in the ledger
- [ ] Browser and server caps both work
