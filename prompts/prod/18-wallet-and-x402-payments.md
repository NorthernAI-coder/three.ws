# 18 — Wallet & x402 payments

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 2 — Product surface completeness
**Owns:** `api/x402-*`, `api/x402/*`, `public/x402*.js`, `x402-buildout/`, `x402-modal-sdk/`, `x402-payment-modal/`, `agent-payments-sdk/`, wallet libs in `api/_lib/`.
**Depends on:** `06`, `07`, `08`. Pairs with `16`, `17`.

## Why this matters for $1B
Payments are the revenue spine. x402 makes the platform machine-payable by other
agents — a structural advantage. Wallets custody real funds. Both must be flawless;
a payment bug is unforgivable and a valuation risk.

## Mission
Production-grade wallet + x402 payments: discoverable paid endpoints, reliable
checkout, correct accounting, idempotency, and a beautiful pay UX on every device.

## Map
- Checkout: `api/x402-checkout.js` (recently hardened ATA probe against malformed RPC).
  Pay-by-name: `api/x402/pay-by-name.js` + SNS. Core client: `public/x402-pay-core.js`,
  `public/x402.js`. Modal SDKs: `x402-modal-sdk/`, `x402-payment-modal/`.
- Discovery indexing (CDP Bazaar / x402scan / 402index) is tracked in the memory note
  `x402-discovery-indexing` — keep endpoints indexable; reuse the verifier script.
- Default network is Solana (memory `solana-default-network`); Base/EVM secondary.

## Do this
1. **Checkout reliability:** confirm the full prepare → pay → verify → fulfill path
   is resilient (timeouts, retries, malformed-RPC defenses — generalize the
   ATA-probe hardening). Idempotency keys so a retry never double-charges or
   double-fulfills (prompt `07`).
2. **Accounting correctness:** server recomputes amounts; verify settlement on-chain
   before fulfilling; reconcile pending/confirmed/failed states; no fulfill-before-pay.
3. **Pay UX:** the modal SDK shows clear amount, network, recipient, and live status;
   QR + wallet-deeplink; designed loading/confirming/success/error/timeout states;
   phone-sized and accessible (prompts `09`, `11`, `12`).
4. **Pay-by-name:** `*.threews.sol` resolution works end-to-end; clear errors for
   unresolvable names.
5. **Wallet surface:** balances, history, send/withdraw (owner-only), spend limits —
   real custodial wallet, all backend invariants preserved. Fund/onramp path works
   (USDC). Build on the wallet skills already in the repo.
6. **Discoverability:** ensure paid endpoints publish correct x402 payment
   requirements and are indexed (run the verifier from the memory note); list them on
   a public "paid services" page so agents and humans can find them.
7. **SDK quality:** `agent-payments-sdk/` + modal SDKs build, are documented, and
   have a working example. Publish-ready (coordinate with prompt `24`).
8. Failure-path + idempotency tests; extend `tests/x402-checkout-prepare.test.js`.

## Must-not
- Do not fulfill before on-chain/payment confirmation.
- Do not trust client-supplied amounts/recipients; recompute/verify server-side.
- Do not retry payments without idempotency keys.
- Do not reference any coin other than `$THREE`; arbitrary user-supplied mints in
  generic plumbing are the allowed runtime exception.

## Acceptance
- [ ] Checkout resilient + idempotent end-to-end; no double-charge/fulfill under retry.
- [ ] Settlement verified on-chain before fulfillment; states reconciled.
- [ ] Pay modal: clear, accessible, mobile-ready, all states designed.
- [ ] Pay-by-name resolves; wallet balances/history/withdraw/limits/onramp work owner-only.
- [ ] Paid endpoints publish correct x402 requirements and are indexed (verifier passes).
- [ ] Payment SDKs build, documented, with a working example.
- [ ] Failure + idempotency tests green.
