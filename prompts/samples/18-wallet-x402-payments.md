# 18 — Wallet & x402 payments

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Payments are the platform's bloodstream: every marketplace buy, paid skill call, agent
delegation, and creator payout flows through the custodial agent wallet and the x402
protocol. If a payment double-settles, an idempotency key collides, a custodial secret
is mishandled, or a verify/settle silently fails, the platform loses money and trust —
and trust is the only currency a payments business actually has. Stripe is the bar:
correct to the cent, reconcilable, never leaks internal state, every failure recoverable.

## Mission

Make the agent wallet and the x402 paid-endpoint stack — custody, verify, settle,
idempotency, USDC on Solana and Base, send/fund/trade/pay, Solana Pay, and reconciliation
— provably correct, resilient, and beautifully stated in every state, end to end.

## Map (trust but verify — files move)

- **Custody** — [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js)
  (`generateSolanaAgentWallet`, `getOrCreateAgentSolanaWallet`, `getOrCreateAgentEvmWallet`,
  `recoverAgentKey`, `delegatedSpend`, `triggerSkillPayment`, `getAgentBalance`,
  `canAfford`), [api/_lib/secret-box.js](../../api/_lib/secret-box.js) (`encryptSecret`/
  `decryptSecret`, `v2:` envelope), [api/_lib/solana-wallet.js](../../api/_lib/solana-wallet.js),
  [api/_lib/avatar-wallet.js](../../api/_lib/avatar-wallet.js). Custody design doc:
  [docs/internal/AGENT-WALLET-CUSTODY.md](../../docs/internal/AGENT-WALLET-CUSTODY.md) — **read it first.**
- **x402 protocol core** — [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js)
  (version 2, network constants for Base/Arbitrum/BSC/Solana, permit2 variants),
  [api/_lib/x402-paid-endpoint.js](../../api/_lib/x402-paid-endpoint.js) (`paidEndpoint(spec)`
  wrapper), [api/_lib/x402/payment-identifier-server.js](../../api/_lib/x402/payment-identifier-server.js)
  (idempotency), [api/_lib/x402-errors.js](../../api/_lib/x402-errors.js),
  [api/_lib/x402-solana-confirm.js](../../api/_lib/x402-solana-confirm.js),
  [api/_lib/evm-payment-verify.js](../../api/_lib/evm-payment-verify.js),
  [api/_lib/x402-spending-cap.js](../../api/_lib/x402-spending-cap.js),
  [api/_lib/x402-spending-ledger.js](../../api/_lib/x402-spending-ledger.js),
  [api/_lib/x402-builder-code.js](../../api/_lib/x402-builder-code.js),
  [api/_lib/x402-prices.js](../../api/_lib/x402-prices.js).
- **Paid endpoints** — [api/x402/](../../api/x402) (e.g. `forge.js`, `skill-call.js`,
  `skill-marketplace.js`, `pay-by-name.js`, `my-receipts.js`, `did.js`,
  `agent-reputation.js`), [api/x402-pay.js](../../api/x402-pay.js),
  [api/payments/solana/[action].js](../../api/payments/solana/[action].js),
  [api/webhooks/solana-pay.js](../../api/webhooks/solana-pay.js) (Solana Pay).
- **Wallet UI** — [pages/agent-wallet.html](../../pages/agent-wallet.html) (route
  `/agents/:id/wallet`), [src/agent-wallet.js](../../src/agent-wallet.js),
  [src/agent-wallet-hub/](../../src/agent-wallet-hub) (`index.js`, `registry.js`,
  `tabs/` → `balance.js`, `deposit.js`, `withdraw.js`, `give.js`, `pay.js`, `trade.js`,
  `snipe.js`, `vanity.js`), [src/agent-x402-pay.js](../../src/agent-x402-pay.js),
  [src/payment-modal.js](../../src/payment-modal.js), [src/forge-pay.js](../../src/forge-pay.js),
  [src/shared/add-funds.js](../../src/shared/add-funds.js),
  [src/shared/payment-receipt.js](../../src/shared/payment-receipt.js).
- **The /pay page** — [public/pay/index.html](../../public/pay/index.html) (route `/pay`).
- **Skills (real, end-user)** — `authenticate-wallet`, `fund`, `send-usdc`, `trade`,
  `pay-for-service` (USDC on Base/Polygon/Solana, send/fund/trade/x402 pay).
- **SDKs** — [solana-agent-sdk/](../../solana-agent-sdk), [agent-payments-sdk/](../../agent-payments-sdk).
- **Tests** — [tests/api/x402-paid-endpoint-replay.test.js](../../tests/api/x402-paid-endpoint-replay.test.js),
  [tests/api/x402-payment-identifier.test.js](../../tests/api/x402-payment-identifier.test.js),
  [tests/api/x402-spec.test.js](../../tests/api/x402-spec.test.js),
  [tests/api/x402-security-fixes.test.js](../../tests/api/x402-security-fixes.test.js),
  [tests/api/x402-pay-routing.test.js](../../tests/api/x402-pay-routing.test.js),
  [tests/api/x402-gas-sponsoring.test.js](../../tests/api/x402-gas-sponsoring.test.js),
  [tests/agent-custody-guards.test.js](../../tests/agent-custody-guards.test.js),
  [tests/agent-wallet-pay-tab.test.js](../../tests/agent-wallet-pay-tab.test.js)
  (and the `agent-wallet-*-tab` family), [tests/api/solana-wallet-balance.test.js](../../tests/api/solana-wallet-balance.test.js).

## Do this

1. **Read the custody doc first** ([docs/internal/AGENT-WALLET-CUSTODY.md](../../docs/internal/AGENT-WALLET-CUSTODY.md)),
   then exercise the wallet in a real browser (`npm run dev`): open `/agents/:id/wallet`,
   walk every tab — balance, deposit, withdraw, give, pay, trade — and the `/pay` page.
   Watch the Network tab: every settlement is a real on-chain/x402 transaction with a
   real signature, never a fake toast.
2. **Custody safety:** confirm secrets are only ever stored encrypted (`secret-box.js`
   `v2:` envelope) and decrypted in-memory at the moment of signing, never logged,
   returned to the client, or persisted in plaintext. Verify `recoverAgentKey` audit
   hooks fire. The custody guard tests must pass and cover the decrypt path.
3. **Idempotency is bulletproof:** using `payment-identifier-server.js`, a replayed
   payment payload or a double-clicked "pay" must settle exactly once and return the
   original receipt — never double-charge, never error opaquely. Verify with the replay
   and payment-identifier tests; add cover for any uncovered race (concurrent identical
   requests).
4. **Verify + settle on both chains:** confirm USDC payments verify and settle correctly
   on **Solana** (`x402-solana-confirm.js`, the `solana:5eykt4...` mainnet constant) and
   **Base** (`evm-payment-verify.js`, `eip155:8453`), including Solana Pay
   (`api/webhooks/solana-pay.js`, `api/payments/solana/`). Spending caps
   (`x402-spending-cap.js`) and the ledger (`x402-spending-ledger.js`) are enforced
   before settlement.
5. **send / fund / trade / pay all complete for real:** sending USDC, funding (on-ramp/
   add-funds), trading, and paying an x402 endpoint each produce a confirmed transaction,
   a real receipt (`payment-receipt.js`), and an updated balance. Insufficient funds
   routes to a real add-funds path, not a dead error.
6. **Every state is designed:** wallet loading skeleton, zero-balance empty state with a
   clear fund CTA, pending-tx state with real status (not a fake spinner), confirmed
   state with explorer link + receipt, and an error state that says what failed and how
   to recover. Reconciliation: a tx that confirms on-chain but whose callback was lost
   is reconciled (poll/webhook) so the UI and ledger never drift.
7. **No provider internals leak:** RPC errors, gas/fee failures, throttling (429), and
   declined payments are masked to neutral, actionable copy via `x402-errors.js`; raw
   detail stays in server logs. Use the existing **cockatiel** resilience helper for
   RPC retries/circuit-breaking — a single flaky RPC must not strand a payment.
8. **Reliability + reconciliation pass:** confirm a retried RPC, a dropped webhook, and a
   timed-out confirm all converge to a single correct ledger state with a re-fetchable
   receipt (`api/x402/my-receipts.js`). No money is lost or double-counted under failure.
9. **Accessibility + microinteractions:** wallet tabs are keyboard-navigable with focus
   management, amounts use accessible inputs with validation, every action has
   hover/active/focus/disabled states, and the layout holds at 320 / 768 / 1440.
10. **Run the tests and ship the changelog:** `npx vitest run tests/api/x402-*.test.js
    tests/agent-custody-guards.test.js tests/agent-wallet-*-tab.test.js
    tests/api/solana-wallet-balance.test.js`. Add a `data/changelog.json` entry for any
    user-visible change, then `npm run build:pages`.

## Must-not

- Never log, return to the client, or persist a wallet secret in plaintext; decrypt only
  in-memory at signing time.
- Never double-settle: a replayed or double-clicked payment must settle exactly once and
  return the original receipt.
- Never leak a provider's billing page, RPC internals, gas error, or raw stack trace to a
  user — mask via `x402-errors.js`; keep detail in server logs.
- Do not reference, list, or recommend any coin other than `$THREE` (CA
  `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); the only payment token here is USDC and
  generic runtime-supplied mints.
- Do not weaken or bypass spending caps, the spending ledger, or the idempotency layer to
  "make it work."
- No mocks of the RPC/x402 stack, no fake receipts, no fake balances, no TODOs.

## Acceptance (all true before claiming done)

- [ ] Every wallet tab (balance/deposit/withdraw/give/pay/trade) and the `/pay` page
      complete real settlements with real signatures in a real browser; no console
      errors/warnings.
- [ ] Wallet secrets are encrypted at rest (`v2:` envelope), decrypted only in-memory at
      signing, never logged or returned; custody guard tests pass.
- [ ] A replayed/double-clicked payment settles exactly once and returns the original
      receipt; replay + payment-identifier tests pass.
- [ ] USDC verify/settle works on both Solana and Base (and via Solana Pay); spending
      caps and ledger are enforced pre-settlement.
- [ ] send/fund/trade/pay each produce a confirmed tx, a real receipt, and an updated
      balance; insufficient funds routes to a real fund path.
- [ ] Loading/empty(zero-balance)/pending/confirmed/error states are all designed;
      dropped webhooks and timed-out confirms reconcile to a single correct ledger state.
- [ ] No provider internals leak on any failure (verified by tests); RPC failures use
      cockatiel retry/circuit-breaking.
- [ ] `npx vitest run tests/api/x402-*.test.js tests/agent-custody-guards.test.js tests/agent-wallet-*-tab.test.js tests/api/solana-wallet-balance.test.js` passes.
- [ ] Changelog updated and `npm run build:pages` is clean.
