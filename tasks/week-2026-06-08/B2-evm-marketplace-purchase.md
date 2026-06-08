# B2 — Implement EVM marketplace purchase confirmation (close the 501 dead-end)

**Track:** B — complete feature · **Priority:** P1 · **Effort:** 1–2 days · **Depends on:** none

## Context

The marketplace buy flow **dead-ends for any non-Solana chain**. Both purchase-confirm handlers
return `501 not_implemented` the moment the chain isn't Solana:

- `api/marketplace/purchase.js:259` — `chain '${pur.chain}' confirmation not yet supported`
- `api/marketplace/buy-asset.js:253` — same

So a buyer can begin an EVM (Base, etc.) purchase but can never confirm it. This violates the
"every state must be reachable / no dead paths" rule and the "no `not_implemented`" rule.

The Solana confirmation path in those same files is the reference implementation — mirror its
shape (verify the on-chain payment, mark the purchase paid, grant the entitlement, record the
receipt) for EVM.

## What to do

1. **Read both handlers fully** and the Solana confirm path they already implement. Identify the
   exact post-payment steps Solana does: signature/tx verification, amount/recipient/mint checks,
   idempotency, DB state transition (pending → paid), entitlement grant, receipt/audit write.
2. **Find the existing EVM verification primitives** — this repo already does EVM/x402 on Base.
   Search `api/_lib/` for EVM helpers (`rg -n "base|evm|viem|ethers|verifyTransaction|usdc" api/_lib`).
   x402 settlement on Base + EVM RPC reads almost certainly already exist (the x402 stack). Reuse
   them — do **not** add a new web3 dependency or re-implement RPC plumbing.
3. **Implement EVM confirmation** for the chain(s) the marketplace actually offers (confirm which:
   Base at minimum). For an EVM purchase, verify the on-chain transfer (correct token = USDC
   settlement, correct amount, correct recipient/treasury, sufficient confirmations), enforce
   idempotency (same tx can't grant twice), then run the **same** state-transition + entitlement +
   receipt steps as Solana.
4. **De-duplicate.** `purchase.js` and `buy-asset.js` carry a near-identical expire/confirm/501
   ladder. Extract the shared confirm logic into one helper in `api/_lib/` (e.g.
   `marketplace-confirm.js`) so the EVM path is implemented **once** and both endpoints call it.
   Don't fix the same gap twice.
5. **Error boundaries:** invalid / unconfirmed tx → clear 4xx with an actionable message; transient
   RPC failure → retriable 5xx; never a bare `501`.

## Acceptance criteria

- [ ] An EVM (Base) purchase can be confirmed end-to-end: on-chain payment verified, purchase
      marked paid, entitlement granted, receipt recorded.
- [ ] Replaying the same confirmation (same tx) is idempotent — no double-grant.
- [ ] Wrong token / wrong amount / wrong recipient / unconfirmed tx each return a clear,
      actionable 4xx (not 501, not a silent success).
- [ ] Shared confirm logic is extracted to one helper; both `purchase.js` and `buy-asset.js` use it.
- [ ] Solana confirmation is unchanged (no regression).
- [ ] No `not_implemented` / 501 remains in the purchase-confirm path for supported chains.

## Verification

1. `npx vitest run` for marketplace tests; add tests for the EVM confirm path (valid tx, replay,
   wrong-amount, unconfirmed) using the repo's existing EVM test helpers/fixtures (use $THREE or a
   clearly-synthetic placeholder mint — never a real third-party mint).
2. `npm run dev`; walk the marketplace buy flow for an EVM item if a testable path exists, and
   confirm the confirm step succeeds and the entitlement appears.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). No mocks, real chain verification. Settlement in USDC on Base is
the allowed coin-agnostic plumbing — do not surface any non-$THREE token symbol in UI copy.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/B2-evm-marketplace-purchase.md`.
3. Commit your code change **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "feat(marketplace): EVM purchase confirmation + shared confirm helper; close B2"`
4. Do **not** push — the human controls pushes.
