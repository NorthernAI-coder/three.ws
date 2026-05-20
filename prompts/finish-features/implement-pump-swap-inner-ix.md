# Task: Implement the pump-swap inner instruction in the buyback cron

## Repo context

Working tree: `/workspaces/three.ws`. The buyback cron at
`api/cron/[name].js` (around line 1178) currently runs only the
**burn** path of the Pump.fun buyback program. The **full-swap** path
is stubbed:

```js
const params = {
  globalBuybackAuthority: payerPk,
  currencyMint: currency,
  swapProgramToInvoke: PUMP_PROGRAM_ID || payerPk, // sentinel for skip-swap
  swapInstructionData: Buffer.alloc(0),             // empty = skip swap, just burn
  remainingAccounts: [],
};

if (fullSwap) {
  // TODO(Phase 3.1): build pump-swap inner ix here. Skipping for safety;
  // keepers should supply this off-chain until tested on devnet.
}

let ix;
try {
  ix = await offline.buybackTrigger(params);
  // ...
}
```

`fullSwap` is a configured boolean per buyback mint. When true, the
cron is supposed to build a real pump-swap inner instruction
(buy-on-curve → burn), populate `swapInstructionData` + `remaining-
Accounts`, then let `offline.buybackTrigger(params)` wrap them into the
outer buyback CPI. Today it does nothing in the `fullSwap` branch,
which means buybacks configured for full-swap silently fall back to
burn-only.

## Rails (CLAUDE.md — non-negotiable)

- No mocks. The implementation must build a **real** pump-swap ix
  against the on-chain program, not a placeholder buffer.
- No fake data. Account lists are derived from real on-chain state
  (PDA derivations against the actual program).
- Done = the `TODO(Phase 3.1)` comment is gone, an end-to-end devnet
  run completes a full-swap buyback successfully, `npm test` green.
- Push to both remotes only when the user says push.
- **No on-chain operations against mainnet without explicit user
  approval.** Devnet only for testing.

## Subagent delegation

This task is big and research-heavy. Spawn subagents in parallel for
the research phase, then implement sequentially.

### Subagent A (Explore)

> In `/workspaces/three.ws`, find every reference to pump-swap and
> the buyback program. Return:
>
> 1. The exact import path and exported surface of `@pump-fun/agent-
>    payments-sdk`. Quote the `buybackTrigger` signature and the
>    expected shapes of `swapInstructionData` and `remainingAccounts`.
> 2. Every existing builder for a pump-swap or pump-fun program ix
>    in the repo (likely under `solana-agent-sdk/`, `sdk/`, or
>    `agent-payments-sdk/`). Quote the function names and signatures.
> 3. Any existing devnet test or script that exercises a full-swap
>    buyback. Even partial / disabled tests count — quote the path.
> 4. The `PUMP_PROGRAM_ID` value (mainnet vs devnet) and any other
>    program-ID constants used by the swap path.

### Subagent B (Explore)

> In `/workspaces/three.ws`, find the schema for the `pump_buyback_
> mints` table (or whatever the buyback config table is named).
> Return:
>
> 1. The column list, especially anything indicating `fullSwap`,
>    pool/curve identity, slippage tolerance, max-buy-amount, and
>    devnet-vs-mainnet flag.
> 2. Every place where `fullSwap` is read or written, including the
>    admin UI that toggles it.

### Subagent C (Plan)

> Given the pump-swap program's published ix surface (research it
> via the SDK source under `agent-payments-sdk/` and any pump-fun
> docs), produce a step-by-step plan for building a buy-on-curve
> inner ix that fits into `offline.buybackTrigger`'s
> `swapInstructionData` + `remainingAccounts` slots. Specifically:
>
> 1. Which pump-swap ix (buy? exact-out buy?) we should use.
> 2. The full account list for that ix (in order, with PDA seeds).
> 3. The data layout (discriminator + args).
> 4. How slippage / min-amount-out is encoded.
> 5. What we need to fetch on-chain before building it (curve PDA
>    state for current price, etc.).

Wait for all three subagents to return before starting Step 1.

## What to implement

### Step 1 — build the inner-ix helper

In `api/cron/[name].js` (or a small new module imported from there,
e.g. `api/_lib/pump-swap-ix.js`), implement:

```js
async function buildPumpSwapInnerIx({
  mint,             // base58 string
  currency,         // PublicKey of quote currency (USDC etc.)
  amountIn,         // BigInt or BN — quote-currency in
  minAmountOut,     // BigInt or BN — base-token out floor (slippage guard)
  cluster,          // 'devnet' | 'mainnet-beta'
}) {
  // Returns: { data: Buffer, accounts: AccountMeta[] }
}
```

The function:

1. Derives the curve PDA for `mint` against the pump-swap program.
2. Fetches its current state (read-only RPC call) to confirm the curve
   exists and is in a state that accepts buys.
3. Builds the buy-on-curve ix data buffer (discriminator + `amount_in`
   + `min_amount_out` in the wire layout produced by Subagent C).
4. Builds the `AccountMeta[]` list in program order: payer, curve PDA,
   base mint, base vault, quote mint, quote vault, fee recipient,
   program id, token program, system program, rent — adapt to the
   actual list Subagent C returns.
5. Returns the raw `data` + `accounts` — **not** a `TransactionInstruction`
   wrapper, because `buybackTrigger` consumes them via
   `swapInstructionData` + `remainingAccounts` independently.

### Step 2 — call it from the buyback cron

Replace the empty `if (fullSwap) { ... }` block with:

```js
if (fullSwap) {
  const inner = await buildPumpSwapInnerIx({
    mint: m.mint,
    currency,
    amountIn: m.buy_amount_lamports, // or whatever column holds it
    minAmountOut: m.min_out_lamports,
    cluster: m.network,
  });
  params.swapProgramToInvoke = PUMP_SWAP_PROGRAM_ID; // not PUMP_PROGRAM_ID
  params.swapInstructionData = inner.data;
  params.remainingAccounts = inner.accounts;
}
```

`PUMP_SWAP_PROGRAM_ID` is exported by `@pump-fun/agent-payments-sdk`
(confirm via Subagent A). Use the real export — do not hard-code the
base58 string.

Delete the `TODO(Phase 3.1)` comment.

### Step 3 — slippage / amount columns

If the buyback-config table is missing `buy_amount` / `min_out_lamports`
columns (Subagent B will tell you), add a migration that introduces
them. The cron should read them per mint, not hard-code values.

### Step 4 — unit test the builder

`tests/pump-swap-ix.test.js`. Without hitting the chain, assert:

1. `buildPumpSwapInnerIx` produces a `data` buffer whose first bytes
   are the documented discriminator.
2. `min_amount_out` is encoded in the documented offset and is exactly
   the value passed in (little-endian, 8-byte).
3. `accounts` length matches the program's expected list length, and
   key accounts (curve PDA, mints) appear at the right index.

For the curve-state fetch, stub the RPC client at the boundary (the
`Connection` instance), not the builder. Provide a fake account-info
return value shaped like a real curve account.

### Step 5 — devnet end-to-end run

```bash
SOLANA_CLUSTER=devnet npm run dev
# or whatever script invokes the buyback cron locally
```

Configure a devnet test mint with `full_swap = true`, a tiny
`buy_amount`, and a high slippage tolerance. Trigger the cron path
(there should be an admin endpoint or a script under `scripts/` —
check existing `scripts/` for a buyback runner).

Watch:

- The transaction succeeds on devnet.
- `pump_buyback_runs` row records `status = 'success'`.
- A Solana explorer link to the tx shows the inner pump-swap ix
  executed before the outer burn.

If it fails, debug — do not paper over with a try/catch and a TODO.

### Step 6 — keep the burn-only path working

Run the existing burn-only path (a mint with `full_swap = false`) on
devnet too. Confirm it still works — your changes must not regress it.

## Definition of done

- The `TODO(Phase 3.1)` comment is gone.
- `buildPumpSwapInnerIx` exists, is tested, and is called from the
  cron when `fullSwap` is true.
- A real devnet full-swap buyback run is recorded as success.
- A real devnet burn-only buyback run still works.
- `npm test` is green.
- The summary includes the devnet tx signatures for both runs so a
  reviewer can verify on the explorer.

## Constraints

- Devnet only for testing. Do not run against mainnet.
- Do not hard-code program IDs as base58 strings — import them from
  `@pump-fun/agent-payments-sdk`.
- Do not catch the inner-ix builder's errors and silently fall back
  to burn-only. If `fullSwap` is configured and the inner ix fails,
  record `status = 'failed'` and surface the error.
- Do not raise the outer cron timeout to mask a slow RPC. Investigate
  the slow RPC.
