# A3 — Payment Correctness

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** A1
(traces on money paths) and A2 (the idempotency helper + error envelope you'll reuse).

## Why this matters for $1B
This is **the** trust foundation. A platform that loses funds once is worth zero forever — no
feature, no growth, no polish recovers from "it took my money and gave me nothing." `00b-the-bar.md`
§1 states it plainly: "No money is ever lost or double-spent. Payment, mint, send, and trade paths
are idempotent, retry-safe, and confirm on-chain before claiming success. A failed transaction
surfaces a clear 'this did not go through, your funds are safe' state." Every dollar that flows
through three.ws flows through the paths you audit here.

## Current state (read before you write)
- **x402 checkout:** `api/x402-checkout.js` already builds Solana/EVM payment transactions, uses
  `createAssociatedTokenAccountIdempotentInstruction` (idempotent ATA), and has retry/confirm
  logic ("confirm and prompts a clean retry, never a double charge"). `api/_lib/x402-solana-confirm.js`,
  `_lib/x402-spending-ledger.js`, `_lib/x402-spending-cap.js`, `_lib/evm-payment-verify.js`,
  `_lib/x402-errors.js` (the `X402Error` type) are the supporting cast.
- **Agent-wallet custody/sends:** `api/_lib/agent-wallet.js`, `_lib/agent-spend-policy.js`,
  `_lib/solana-transfer.js`, `_lib/evm-transfer.js`, `src/agent-wallet/ownership.js`. Existing
  guard tests: `tests/agent-custody-guards.test.js`.
- **Billing / subscriptions:** `api/_lib/subscription-billing.js`, `_lib/subscription-checkout.js`,
  `_lib/subscription-pricing.js`. Existing: `tests/billing.test.js`.
- **Mint / launch:** `api/pump-launch.js`, `_lib/pump-platform-fee.js`, `_lib/onchain-deploy.js`,
  `_lib/payout.js`, `_lib/royalty.js`, `_lib/fee.js`.
- **The gap:** correctness is strong in places (x402 checkout) and unproven elsewhere. There is no
  single audit guaranteeing **every** money path: (a) is idempotent under retry, (b) confirms
  on-chain before reporting success, (c) has a designed failed/refund state, (d) cannot
  double-spend. Verify each path's current behavior by reading it — do not assume.

## Your mission
### 1. Enumerate every money path, then audit each against four invariants
Build the inventory (x402 checkout + paid-endpoint settlement, agent-wallet sends, USDC
transfers, subscription billing, mint/launch fees, payouts/royalties, copy-trade execution, any
`*-spending-*` ledger write). For each, verify and fix: **(a) Idempotency** — a retried request
with the same idempotency key (A2's helper) never moves funds twice; **(b) Confirm-before-success**
— success is reported only after on-chain confirmation (reuse `x402-solana-confirm.js` /
`evm-payment-verify.js` patterns), never on broadcast; **(c) Failed/refund state**; **(d)
No double-spend** under concurrent requests (Redis lock / atomic ledger write).

### 2. "Your funds are safe" failure state — everywhere money moves
Every money path's failure must produce the exact reassurance pattern from the bar: a clear,
designed state that says *this did not go through, your funds are safe*, with a real retry. No
ambiguous "error" toast on a payment, no spinner that spins after a broadcast, no silent
swallow. Wire this in both the API envelope (A2 shape) and the UI surfaces that call these paths
(Forge high-quality unlock, x402 checkout, agent send, billing). Distinguish "broadcast failed
(funds untouched)" from "broadcast succeeded, confirmation pending" — they need different copy.

### 3. On-chain confirmation gate on every send/mint
No path reports success on a signature alone. Each must poll/confirm to the right commitment
('confirmed'/'finalized' as appropriate) within a budget, then verify the on-chain effect (token
received, ATA funded, fee paid) before flipping state to success. On timeout, return a "pending —
we'll confirm" state, never a false success. Record the signature so a later reconciliation can
resolve pending → success/failed.

### 4. Atomic ledgers and concurrency safety
The spending ledger and any balance/cap accounting must be atomic — concurrent requests on the
same wallet cannot both pass a cap check and both spend. Use Redis atomic ops / a per-wallet lock.
Reconcile pending entries (a sweep that confirms or fails stuck signatures) so the ledger never
drifts from chain truth.

### 5. Reconciliation + alerting on money anomalies
Wire money-path failures and anomalies (a confirm timeout, a ledger mismatch, a refund) into A1's
telemetry with `recordPaymentMetric(...)` and a tighter ops-alert threshold. A stuck or failed
payment must page. Add a reconciliation routine (endpoint or worker) that resolves pending
signatures and flags drift.

### 6. Prove it with tests
Extend `tests/agent-custody-guards.test.js` and `tests/billing.test.js` and add money-path specs:
double-submit returns one effect; broadcast-then-confirm-fail yields the "funds safe" state;
concurrent cap checks can't both pass; a pending signature reconciles correctly. These feed A5's
gate — make them offline-safe so `scripts/test-gate.mjs` can include them.

## Definition of done
Clears `00b-the-bar.md` §1 money clause for **every** path in the inventory: idempotent,
retry-safe, confirm-on-chain-before-success, no double-spend, and a designed "your funds are safe"
failure state in both API and UI. Atomic ledger; reconciliation resolves pending. Money anomalies
page via A1. New tests cover double-submit, confirm-failure, and concurrency, and run in the gate.
Inherits the global definition of done in `00-README-orchestration.md`. Where you cannot exercise a
live mainnet path locally, verify the logic and tests and say so — never claim a live settlement you
didn't observe.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs — **and no real third-party mints in tests/fixtures**;
use `$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) or a clearly-synthetic placeholder.
`$THREE` is the only coin. Stage explicit paths only (never `git add -A`); re-check `git diff
--staged` before commit (watch the `npx vercel build` trap that bundles `api/*.js` — check `head -1`
for `__defProp`). **You own the money paths**: `api/x402-checkout.js`, `_lib/agent-wallet.js`,
`_lib/x402-*`, `_lib/subscription-billing.js`, `src/agent-wallet/`, money-path tests. Reuse A2's
idempotency helper and A1's payment metrics; don't fork them. Extend the strong existing logic; don't
rewrite working confirm code.

## When finished
Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. the pending-signature
reconciliation sweep, or a per-wallet daily-spend safety ceiling). Append a `data/changelog.json`
entry (tag: `security` or `fix`) — "your funds are safe" guarantees are exactly what holders want to
read. Then delete this prompt file
(`prompts/production-campaign/A-reliability/A3-payment-correctness.md`) and report the money-path
inventory, which invariants each path already met vs. you fixed, and any path needing live-mainnet
verification you couldn't do locally.
