# P22 · Harden the EVM x402 Lanes for Scale

> **Workstream:** Monetization (revenue engine) · **Priority:** P0 · **Effort:** L · **Depends on:** none

## Before you start
1. Read `CLAUDE.md` (rules that override defaults) and `STRUCTURE.md` (surface map). Note the $THREE-only rule and the two coin-agnostic exceptions.
2. three.ws monorepo: vanilla JS + Vite frontend, Vercel functions in `api/`, tests via `vitest` + Playwright (`npm test`), dev server `npm run dev`.
3. **$THREE is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`.

## Context
The EVM x402 rail spans three networks and three signature methods, but only the Base EIP-3009 path is exercised:

- `api/_lib/x402-spec.js` — the verify/settle core. CAIP-2 networks: `NETWORK_BASE_MAINNET` (`eip155:8453`), `NETWORK_BASE_SEPOLIA` (`eip155:84532`), `NETWORK_ARBITRUM_MAINNET` (`eip155:42161`), gathered in `CDP_EVM_NETWORKS`. `paymentRequirements()` emits an EIP-3009 accept first, then `permit2VariantOf()` appends a Permit2 sibling — but ONLY when CDP creds are present (`env.CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`); without them no Permit2 sibling is advertised (we can't settle it). `verifyPayment()` does defense-in-depth: decodes the signed amount (`decodeSignedAmount`) and recipient (`decodeSignedRecipient`) from both EIP-3009 (`authorization.value`/`.to`) and Permit2 (`permitted.amount`/witness) payloads, rejecting under-payment / wrong payTo BEFORE calling the facilitator, then cross-checks the facilitator's echoed `network`/`asset`. `settlePayment()` sends `/settle` with an `idempotencyKey` from `buildIdempotencyKey()` and cross-checks echoed `network`/`payer`. `facilitatorFor(network)` returns `{direct:true}` for BSC (`x402-bsc-direct.js`), `{url, cdp:true}` for CDP networks (requires creds), else throws.
- `public/x402.js` + `public/x402-pay-core.js` — the drop-in buyer modal. `EVM_NETWORKS` lists Base, Base Sepolia, Arbitrum (42161), Optimism (10). The modal signs EIP-3009 `transferWithAuthorization` typed data locally (`buildEip3009TypedData`, `isEip3009Accept`) — it deliberately picks the EIP-3009 entry over the Permit2 sibling, since signing against Permit2 builds a payload the facilitator rejects. EIP-2612 sponsorship + Permit2 are SDK-client paths (the facilitator's `x402ExactPermit2Proxy` submits the approval atomically so the payer never broadcasts an approve tx).
- `api/x402-checkout.js` — Solana-only tx builder (`prepare`/`encode`); EVM clients sign typed data locally and don't use it. `tests/x402-checkout-prepare.test.js` covers the Solana prepare path.
- Existing tests: `tests/evm-payment-verify.test.js` (verify path), `x402-giving.test.js`, `x402-vanity-sealed-envelope.test.js`.

## Problem / opportunity
Base EIP-3009 is proven; the rest is wired but untested at scale: the Permit2/EIP-2612 sponsorship path only emits when CDP creds exist and has no test asserting a sponsored settlement; Arbitrum is in `CDP_EVM_NETWORKS` and the modal's `EVM_NETWORKS` but there's no Arbitrum verify/settle test or receipt check; under load there's no validation that idempotency holds across concurrent settles or that the facilitator echo cross-checks catch a wrong-network reply. A silent failure on these lanes means lost revenue or, worse, an under-paid settlement slipping through.

## Mission
Validate and harden every EVM lane end-to-end — EIP-3009 + Permit2/EIP-2612 sponsorship, on Base and Arbitrum — proving sponsorship works, gas is sponsor-paid, settlement is idempotent under concurrency, receipts encode correctly, and the supported-network matrix is documented and accurate.

## Scope
**In scope:** test + harden `verifyPayment`/`settlePayment` for EIP-3009 and Permit2/EIP-2612 across Base + Arbitrum; concurrency/idempotency tests; receipt-header encoding tests; a supported-networks doc; fixing any gap found (e.g. a network advertised in the modal but unsettleable).
**Out of scope:** Solana lane changes, BSC direct scheme internals (already separate), adding brand-new chains beyond what `CDP_EVM_NETWORKS` already declares.

## Implementation guide
1. **Network matrix audit.** Cross-check `EVM_NETWORKS` in `public/x402.js`/`x402-pay-core.js` against `CDP_EVM_NETWORKS` + `facilitatorFor` in `api/_lib/x402-spec.js`. Optimism (`eip155:10`) is in the modal list but NOT in `CDP_EVM_NETWORKS` — confirm whether `facilitatorFor('eip155:10')` can settle; if it throws, either add it to the settle set or remove it from the modal so the UI never advertises an unsettleable lane (a dead path = a failed checkout). Resolve the mismatch, don't paper over it.
2. **Permit2/EIP-2612 sponsorship test.** Add `tests/x402-permit2-sponsorship.test.js`: assert `paymentRequirements()` appends a `permit2VariantOf` sibling WHEN CDP creds are set and omits it when absent (the existing gate). For a Permit2 payload, assert `decodeSignedAmount`/`decodeSignedRecipient` read `permitted.amount` + witness recipient correctly and that under-payment / wrong-payTo are rejected pre-facilitator. Mock the facilitator HTTP boundary only (network I/O) — never mock the signature decode/verify logic.
3. **Arbitrum end-to-end.** Add Arbitrum (`eip155:42161`) cases to `tests/evm-payment-verify.test.js`: a valid EIP-3009 authorization verifies; a wrong-`asset` or wrong-`network` facilitator echo trips `facilitator_bad_response` (502); a payment for chain A presented as chain B is rejected. Confirm the USDC EIP-3009 domain (`buildEip3009TypedData`) uses Arbitrum's correct contract/version.
4. **Idempotency under concurrency.** Test that two concurrent `settlePayment` calls for the same `paymentPayload` produce the same `buildIdempotencyKey` and the facilitator is sent the idempotency header so a retry/double-submit settles once. On the app side, the settled payment must still land exactly once in `token_payments` (UNIQUE(nonce)/UNIQUE(tx_signature) per `api/_lib/token/payments.js`) — assert a replay resolves to `already_settled`, never a double-credit.
5. **Receipt encoding.** Test `encodePaymentResponseHeader(settleResult, extensions)` produces a well-formed `X-PAYMENT-RESPONSE` with `transaction`/`network`/`payer` and the Offer-&-Receipt extension envelope when configured. Assert the explorer URL resolves per network (`explorerUrl` in `public/x402.js`: basescan / arbiscan).
6. **Gas/sponsorship behavior.** Document and assert that on the Permit2/EIP-2612 path the facilitator (`x402ExactPermit2Proxy`) pays gas and the buyer never broadcasts an approve tx — surface a clear modal message for wallets lacking sponsorship support (the modal already falls back to EIP-3009). No fake gas estimates.
7. **Docs.** Write/update a supported-networks section (e.g. `specs/` or `docs/`): the matrix of network × method × settle-path (EIP-3009 everywhere; Permit2/2612 sponsorship where CDP creds + proxy exist), required env (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `X402_CDP_FACILITATOR_URL`), and the precise reason a sibling is or isn't advertised.

## Definition of done
- [ ] Network matrix is consistent across client + server; no lane advertised that can't settle.
- [ ] Permit2/EIP-2612 sponsorship verified by test (emit gate, payload decode, under-pay/wrong-payTo rejection).
- [ ] Arbitrum EIP-3009 verify/settle + facilitator echo cross-checks tested.
- [ ] Money paths covered by tests (verify, settle, split, idempotency); `npm test` passes — including concurrent-settle idempotency and a `token_payments` replay resolving to `already_settled`.
- [ ] User-visible change → entry in `data/changelog.json`, then `npm run build:pages`.
- [ ] `git diff` self-reviewed; revenue math validated; supported-networks doc accurate.

## Verification
- `vitest run tests/evm-payment-verify.test.js tests/x402-permit2-sponsorship.test.js` — all green, including Arbitrum + Permit2 cases.
- `npm run dev`, open the drop-in modal on a paid endpoint with MetaMask on Base and on Arbitrum: confirm the EIP-3009 sign flow, then the `X-PAYMENT` header builds and the resource unlocks; check network tab for a real `/verify`+`/settle` round-trip and an `X-PAYMENT-RESPONSE` with the right explorer link.
- With CDP creds set, confirm the 402 challenge advertises a Permit2 sibling; with creds unset, confirm it does not.

## Guardrails
- No mocks/fake data. Real on-chain verification + settlement (mock only the facilitator HTTP boundary in unit tests, never the decode/verify logic). Idempotent (no double-charge / double-payout).
- $THREE only in copy; never hardcode a non-$THREE mint. USDC is the payment-rail asset, not a coin to promote.
- Stage explicit paths; re-check `git status` before commit. Push only when asked, to BOTH remotes (`threeD`, `threews`).
- Watch the `npx vercel build` trap: never commit bundled `api/*.js` (and never commit a bundled `api/x402-checkout.js` / `public/x402*.js`).
