# 27 · x402 Payments — End-to-End Robustness

## Mission
Payments are sacred. Every x402 paid flow (paying for a service, charging for an endpoint) must be
correct, idempotent, observable, and bulletproof — no double-charges, no silent failures, no lost money.

## Context
- x402 endpoints under `api/x402/*` (checkout, service, pay-by-name, fact-check, tutor, etc.);
  helpers in `api/_lib/*`; client flows in `src/forge-pay.js` and skill/marketplace purchases.
- Settlement currency is USDC. Recent fix: USDC checkout survives a malformed RPC reply.
- Discovery/indexing context lives in the team memory (CDP Bazaar / x402scan / 402index) + a verifier.

## Tasks
1. **Map every paid flow:** list each x402 endpoint + each client call site; document price, currency
   (USDC), and what's delivered on success.
2. **Idempotency + no double-charge:** ensure retries/network blips can't charge twice; payment intents
   keyed; settlement verified before delivering the good; failed delivery after charge has a refund/retry path.
3. **Resilience:** adopt the resilience helper (cockatiel per team memory) for RPC/settlement calls;
   handle malformed RPC replies (precedent), timeouts, congestion — with clear user messaging.
4. **Receipts + records:** every payment recorded with a verifiable reference; user sees a receipt;
   server logs enough to reconcile.
5. **Discovery:** confirm our paid endpoints are correctly described and indexable (run the verifier);
   `402` responses return correct PaymentRequired payloads (v2 transport) for MCP + HTTP.
6. **Tests:** unit tests for amount math + currency + recovery paths; an E2E that pays a real endpoint
   on a test path; never reference any non-$THREE token in any fixture.

## Acceptance
- Every paid flow verified end-to-end with real USDC settlement; provably no double-charge under retry.
- Malformed-RPC / timeout / congestion handled with clear UX; receipts + reconciliation records exist.
- Discovery verifier passes; `402` payloads correct; tests green; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks of payment logic; settle in USDC. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference another token, even in fixtures. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles (`__defProp`/`createRequire`) — recover with `git restore -- api/ public/`. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/27-x402-payments.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
