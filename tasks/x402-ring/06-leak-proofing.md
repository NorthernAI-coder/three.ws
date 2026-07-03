# Task 06 — Leak-Proofing: Runtime Invariants + On-Chain Leak Scanner

## Mission

The owner's invariant: **no SOL or USDC leaves the controlled-wallet set —
ever.** Not to other users, not to charities, not to external facilitators or
fees beyond the network's own. Today the guards are good but passive (env flags
that could be flipped or forgotten) and nothing watches the chain for money
actually leaving. Make the invariant active: asserted at runtime, monitored on
chain, and alarmed within minutes of any violation.

## Context you must know

- Existing guards (do not weaken, build on them):
  - `payToAllowlist()` (`api/_lib/x402/self-facilitator.js:103-112`) + enforcement
    in `validateRingTransaction` (:160-162, `pay_to_not_allowlisted`).
  - Anti-drain instruction gate (:175-254): only `{ComputeBudget, ATA-create for
    our recipient, exactly one TransferChecked to the expected receiver ATA}`;
    System instructions forbidden (:181-184); address-table lookups rejected (:144).
  - Rebalancer only moves treasury→payer, treasury pubkey must equal
    `X402_PAY_TO_SOLANA` (`ring-rebalance.js:81-87`).
  - `X402_EXTERNAL_ENABLED !== 'false'` gates external spending
    (`autonomous-registry.js:3784`); `X402_CHARITY_AUDIT_BPS=0` keeps splits at
    zero (docs/x402-ring-economy.md:128, setup script :85).
  - SOL floor hard-stop (`self-facilitator.js:383-389`).
- The controlled-wallet universe: the three ring wallets (env +
  `x402_ring_wallets`), plus platform signers in `api/_lib/solana-signers.js`,
  plus the USDC mint's ATAs thereof.
- Precedent for on-chain breach detection: `api/cron/economy-reconcile.js`
  (lines 118-234) — pulls `getSignaturesForAddress`, flags unrecorded outbound
  above a fee floor, writes `payment_reconciliation` verdicts, CRITICAL
  `sendOpsAlert`. **Mirror this pattern; do not invent a new one.**
- Task 03's `scripts/x402-ring-verify.mjs` resolves the wallet set.

## Tasks

1. **Runtime invariant assertions.** In the ring tick (task 04) and the
   autonomous loop entry point, assert before any spend:
   `X402_EXTERNAL_ENABLED === 'false'`, `X402_CHARITY_AUDIT_BPS` parses to 0,
   facilitator resolves to self (task 02's `validateRingConfig()` clean). Any
   violation → spend path no-ops + single throttled CRITICAL alert naming the
   flipped flag. The ring must fail CLOSED.
2. **Allowlist unification.** Build `ringAllowedAddresses()` in a new
   `api/_lib/x402/ring-allowlist.js`: the three role wallets + their USDC ATAs
   + `SOLANA_SIGNERS` pubkeys + explicit extras from
   `X402_SELF_FACILITATOR_PAYTO_ALLOWLIST`. Use it everywhere an allowlist is
   consulted (facilitator payTo check may keep its narrower set — receiving is
   stricter than membership; document the distinction in the module docstring).
3. **On-chain leak scanner — `api/cron/x402-ring-leak-scan.js`** (cron every 10
   min, `CRON_SECRET` auth, read-only on chain):
   - For each ring wallet: `getSignaturesForAddress` (limit 100 since last
     scan cursor, cursor persisted in DB), parse each tx, and classify every
     SOL/USDC debit: `internal` (counterparty ∈ `ringAllowedAddresses()`),
     `network_fee` (tx fee paid by our wallet), or `LEAK` (anything else —
     including token transfers of non-USDC mints, System transfers to unknown
     addresses, and approvals/delegations).
   - Any `LEAK` → CRITICAL `sendOpsAlert` with signature, counterparty,
     amount, and the recommendation to rotate the affected secret; verdict row
     in `payment_reconciliation` (source `x402_ring_onchain`), mirroring
     `economy-reconcile.js:191`'s shape.
   - Also flag `delegation` risk: any SPL `Approve` on a ring ATA is a leak
     vector even before funds move — alert on sight.
4. **Register the cron** in `vercel.json` (`*/10 * * * *`).
5. **Fee-leak line item.** The scanner sums per-day `network_fee` debits and
   cross-checks against task 05's fee audit — a >20% mismatch means something
   is paying fees outside the ring's accounting → WARN alert.
6. **Tests.** Pure-logic classification tests: internal transfer, fee-only,
   USDC to unknown address (LEAK), non-USDC token out (LEAK), SPL Approve
   (alert), cursor resumption. Fixture txs as JSON parsed-transaction shapes —
   synthetic addresses only.
7. **Docs + changelog.** New "Leak-proofing" section in
   `docs/x402-ring-economy.md`: the invariant, the assertion points, the
   scanner, and the response runbook (rotate key, drain to treasury, re-verify).
   Changelog entry (tags: `security`).

## Files you own

`api/_lib/x402/ring-allowlist.js` (new), `api/cron/x402-ring-leak-scan.js`
(new), `vercel.json` (one cron entry), invariant assertions in
`api/cron/x402-ring-tick.js` + `api/cron/x402-autonomous-loop.js` (assertion
block only), migration for the scan cursor table, tests,
`docs/x402-ring-economy.md`, `data/changelog.json`.

## Constraints

- Scanner is strictly read-only on chain; it never moves funds, never rotates
  keys itself.
- False-negative is worse than false-positive here: when classification is
  ambiguous, classify as LEAK and alert.
- Do not modify `validateRingTransaction` semantics; extend around it.
- Keep RPC usage bounded: batched `getParsedTransactions`, cursor-based, ≤ 100
  sigs per wallet per run.

## Acceptance criteria

- [ ] Flipping any guard env in a local run makes the spend path no-op with a
      single CRITICAL alert (show logs for all three flags).
- [ ] Scanner classifies the six fixture cases correctly (tests green).
- [ ] A real scan over the live ring wallets completes, writes its cursor, and
      reports zero leaks (or real findings) — paste the run output.
- [ ] `payment_reconciliation` receives verdicts with source `x402_ring_onchain`.
- [ ] `npm test` green; docs + changelog landed.
