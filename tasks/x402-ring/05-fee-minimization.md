# Task 05 — Lowest Fees Always: Self-Pay Everywhere, Fee Audit, Rent Reclaim

## Mission

The owner's rule is "the lowest fees ALWAYS". Enforce the fee floor across the
entire ring: 1-signature self-pay settlement as the operative mode, priority
fees pinned at the floor, ATA rent reclaimed, and a continuous fee audit that
measures the real SOL burned per dollar of volume and alarms when it drifts
above budget.

## Context you must know

- Two fee levers (docs/x402-ring-economy.md:19-48): fewer/larger payments
  (`X402_PRICE_RING_SETTLE`), and self-pay 1-sig = 5,000 lamports vs sponsor
  2-sig = 10,000 (`X402_RING_SELF_PAY`, default **false** — `pay.js:150`;
  `buildPaymentTx` picks feePayer at :78).
- Priority fee already ~floor: `ComputeUnitPrice = 5 + (nonce%997)` µlamports,
  `ComputeUnitLimit 60_000` (`pay.js:94-96`; rebalance `ring-rebalance.js:134-135`).
- Facilitator guards cap CU price/limit and priority lamports
  (`self-facilitator.js:51-60`): `MAX_CU_LIMIT` 300k, `MAX_CU_PRICE` 100k
  µlamports, `MAX_PRIORITY_LAMPORTS` 20k.
- ATA rent = 2,039,280 lamports per new ATA, one-time, **reclaimable by closing
  the ATA** (`self-facilitator.js:59-60,288,448`; `pay.js:98-102`;
  `ring-rebalance.js:137-141`).
- Real fee is read back from chain: `getParsedTransaction().meta.fee`
  (`self-facilitator.js:441-450`) → logged in `x402_self_facilitator_log`.
- `/api/x402-ring` (`api/x402-ring.js`) already reports SOL burned per period.
- In self-pay the facilitator broadcasts without co-signing; the SOL floor
  guard then watches the **payer** (docs:37-43).

## Tasks

1. **Self-pay as the operative default for the ring.** Flip the effective
   default of `X402_RING_SELF_PAY` to true for ring-internal payments (explicit
   `false` still honored). Verify the whole path works with zero sponsor
   involvement: `buildPaymentTx` 1-sig, facilitator validation of a
   self-paid tx (`validateRingTransaction` self-pay branch :270-275),
   broadcast, fee logging. The payer's SOL balance becomes the watched floor —
   confirm task 03's monitor covers it.
2. **Fee-floor regression guard.** Add a pure function
   `expectedFeeLamports({selfPay, priorityMicrolamports, cuLimit})` and assert
   in tests that the ring's builders never produce a tx whose worst-case fee
   exceeds `X402_RING_MAX_FEE_PER_TX_LAMPORTS` (default 10_000). Wire the same
   ceiling as a runtime check in `payX402` — refuse to send a ring payment
   whose priority config would exceed it (structured skip, not throw).
3. **Fee audit rollup.** Nightly pipeline (register in the autonomous registry
   following the existing entry shape, cooldown 86400): sum real fees from
   `x402_self_facilitator_log` + `x402_autonomous_log` for the day, compute
   lamports-per-settlement and SOL-per-$100-volume, upsert into
   `x402_volume_metrics` (or a small `x402_fee_audit` table if metrics doesn't
   fit — reuse the migration pattern in `api/_lib/migrations/`), and
   `sendOpsAlert` if lamports-per-settlement > 1.5× the 1-sig floor or daily
   burn > `X402_RING_DAILY_FEE_BUDGET_LAMPORTS` (default 0.05 SOL).
4. **ATA rent reclaim.** Extend the fee audit pipeline: enumerate token
   accounts owned by ring wallets; any USDC ATA with zero balance that is not
   one of the three active role ATAs → close it (owner-signed
   `closeAccount`, rent returns to the owner wallet). Idempotent, logged,
   capped at 5 closes/run. NEVER close an active role ATA or any account with
   a balance.
5. **Expose the number.** Add `fees.lamports_per_settlement` and
   `fees.sol_per_100_usd` to `/api/x402-ring` so the dashboard (task 10) and
   the acceptance run (task 11) can read the real efficiency.
6. **Docs + changelog.** Update the cost-model section of
   `docs/x402-ring-economy.md` with measured (not theoretical) numbers from
   your verification run; changelog entry (tags: `improvement`, `infra`).

## Files you own

`api/_lib/x402/pay.js` (fee ceiling + self-pay default), fee-audit pipeline
(new file under `api/_lib/x402/pipelines/`), `api/_lib/x402/autonomous-registry.js`
(one new entry), `api/x402-ring.js` (fees block), migration if needed, tests,
`docs/x402-ring-economy.md`, `data/changelog.json`.

## Constraints

- Never raise a facilitator guard ceiling (`MAX_CU_*`, `MAX_PRIORITY_LAMPORTS`).
- Rent reclaim must be provably safe: test the "never closes active/funded
  ATA" invariant with unit tests before any live run.
- No new dependency; use existing `@solana/spl-token` helpers already in the tree.
- Sponsor mode must keep working (it's the fallback for gasless buyers) — you
  are changing the ring's default, not deleting the mode.

## Acceptance criteria

- [ ] A live (or devnet) self-paid settlement lands with `meta.fee` ≤ 5,100
      lamports — paste the signature and logged fee.
- [ ] Fee ceiling enforced in code + tests; audit pipeline registered and runs
      (show one real run's output row).
- [ ] Rent-reclaim closes only zero-balance non-role ATAs (tests + dry-run log).
- [ ] `/api/x402-ring` exposes the two fee-efficiency metrics.
- [ ] `npm test` green; docs show measured numbers; changelog added.
