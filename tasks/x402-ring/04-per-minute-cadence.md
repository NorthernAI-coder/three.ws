# Task 04 — Per-Minute Ring Tick: Many Paid Hits Every Minute, Cap-Coherent

## Mission

The owner's requirement is explicit: **x402 endpoints being hit every minute,
many times** — tips, payments, services bought and sold, continuously. Today the
only driver is `/api/cron/x402-autonomous-loop` at `*/5 * * * *` with 300s
pipeline cooldowns, and the flagship `ring-settle` call is skipped every cycle
because its price ($1.00) exceeds the volume loop's per-run cap ($0.05). Build a
dedicated per-minute ring tick that produces steady, capped, fee-minimal paid
traffic across the catalog, and make the cap system coherent so nothing is ever
silently skipped.

## Context you must know

- Vercel per-minute crons are already in use: `/api/cron/x402-seed-cron` @
  `* * * * *` (`vercel.json:4869`). Crons array starts `vercel.json:4623`.
- Payment primitive: `payX402` (`api/_lib/x402/pay.js:141-`) — builds the USDC
  `TransferChecked` (`buildPaymentTx` :71-116), self-pay flag at :150, cap skip
  `cap_would_exceed` at :182-184. Logs to `x402_autonomous_log`.
- Volume loop: `api/_lib/x402/pipelines/volume-bootstrap-loop.js` —
  `VOLUME_ENDPOINTS` (:70-88, 12 entries), `VOLUME_BATCH_PER_RUN` (:52, default
  4), `VOLUME_PER_RUN_CAP_ATOMIC` (:59-62, default $0.05), metrics upsert
  `x402_volume_metrics` (:119-140).
- Autonomous loop: `api/cron/x402-autonomous-loop.js` — `wrapCron`, registry
  selection, `DAILY_CAP_ATOMIC` default $15
  (`api/_lib/x402/autonomous-registry.js:3778`), `MAX_PER_TICK` 12 (:3771),
  kill switch `X402_AUTONOMOUS_ENABLED==='false'` (:226). Registry entries
  `volume-bootstrap-loop` (:2647-2659) and `ring-rebalance` (:2670-2681), both
  cooldown 300.
- Rebalancer: `api/_lib/x402/pipelines/ring-rebalance.js` — treasury→payer
  sweep, `MIN_SWEEP_ATOMIC` $0.10 (:49), no-op without treasury secret
  (:71-72), cap-neutral (`amountAtomic:0`).
- Facilitator SOL floor pauses settlement below 0.02 SOL
  (`self-facilitator.js:383-389`) — your tick must treat that as back-pressure,
  not an error storm.
- Task 02 landed `validateRingConfig()` — call it, don't re-implement.

## Tasks

1. **New cron endpoint `api/cron/x402-ring-tick.js`** (follow `wrapCron` +
   `CRON_SECRET` auth conventions of `x402-autonomous-loop.js`):
   - Every minute, pay `X402_RING_TICK_CALLS` endpoints (default 3) drawn from
     the catalog: weighted rotation so cheap tips/services ($0.001–$0.01)
     dominate the count while one `ring-settle` at
     `X402_PRICE_RING_SETTLE` lands every `X402_RING_SETTLE_EVERY_N_TICKS`
     ticks (default 5) to carry volume cheaply (fewer/larger — docs cost model
     lines 19-48).
   - Reuse `payX402` and the volume loop's metrics/log recording; do not fork a
     second payment path. Extract shared helpers from
     `volume-bootstrap-loop.js` rather than duplicating.
   - Per-tick spend cap `X402_RING_TICK_CAP_ATOMIC` (default $0.25) and its own
     daily cap `X402_RING_DAILY_CAP_ATOMIC` (default $50), enforced from
     `x402_autonomous_log` sums — **the ring tick budget is separate from, and
     must not consume,** the autonomous loop's `DAILY_CAP_ATOMIC`.
   - Kill switches honored: global `X402_AUTONOMOUS_ENABLED=false` AND its own
     `X402_RING_TICK_ENABLED` (default **true** once envs are valid — gate on
     `validateRingConfig()` returning clean; if findings exist, log them and
     no-op).
   - Back-pressure: on `sponsor_sol_floor`, insufficient payer USDC, or RPC
     failure — skip the tick with a structured log row, alert (throttled, max
     1/hour) via `sendOpsAlert`, never retry-storm.
2. **Register the cron** in `vercel.json`: `* * * * *`, `maxDuration` ≤ 60.
3. **Fix the cap contradiction at the source.** In `payX402`/volume loop:
   when an endpoint's price exceeds the applicable per-run cap, the skip must
   be loud — one throttled warning naming endpoint, price, cap, and the env to
   change — and `validateRingConfig()` (task 02) must flag it. Additionally
   raise the documented defaults so stock config is coherent:
   `VOLUME_PER_RUN_CAP_ATOMIC` must accommodate the ring-settle price it
   rotates (document the pair in `.env.example`).
4. **Rebalance cadence.** The payer float now cycles faster; ensure
   `ring-rebalance` keeps up: lower its registry cooldown to 120s and make
   `MIN_SWEEP_ATOMIC` env-tunable (`X402_RING_MIN_SWEEP_ATOMIC`). Sweep stays
   treasury→payer only.
5. **Tests.** Pure-logic tests: rotation weighting (per-minute counts,
   ring-settle every Nth), cap enforcement (tick + daily), back-pressure no-op
   on floor breach, budget separation from the autonomous loop. Match existing
   x402 test style; no network.
6. **Docs + changelog.** New "Cadence" section in `docs/x402-ring-economy.md`
   with the throughput/fee math at defaults (3 calls/min ≈ 4,320 tx/day ≈
   ~0.0216 SOL/day at the 1-sig floor — show the real numbers for your final
   defaults). Changelog entry (tags: `feature`, `infra`).

## Files you own

`api/cron/x402-ring-tick.js` (new), `vercel.json` (crons array — add one entry
only), `api/_lib/x402/pipelines/volume-bootstrap-loop.js`,
`api/_lib/x402/pipelines/ring-rebalance.js`,
`api/_lib/x402/autonomous-registry.js` (cooldown only), `api/_lib/x402/pay.js`
(loud-skip only), `.env.example`, tests, `docs/x402-ring-economy.md`,
`data/changelog.json`.

## Constraints

- Only OUR endpoints get paid: the tick's catalog is hardcoded to internal
  paths; `X402_EXTERNAL_ENABLED` has no effect on it and it must never read
  external endpoint lists.
- Fees: self-pay 1-sig assumed (task 05 enforces); priority fee stays at the
  existing ~5 µlamport formula; do not add per-call ATA creates (ATAs exist
  after the first settlement).
- Never weaken existing caps or guards; you are adding a *separately budgeted*
  driver, not raising the autonomous loop's spend.
- Every skipped/failed tick leaves a structured, queryable log row.

## Acceptance criteria

- [ ] Local simulated run (env-complete, RPC live, funded wallets or devnet):
      10 consecutive ticks produce ≥ 3 paid calls each, with ring-settle landing
      on the configured cadence — show the `x402_autonomous_log` rows.
- [ ] Tick + daily caps enforced (test-proven); autonomous-loop budget untouched.
- [ ] Price-vs-cap contradiction impossible to hit silently (test + warning).
- [ ] Back-pressure path proven: below-floor → clean no-op + single alert.
- [ ] `vercel.json` cron entry present and valid JSON.
- [ ] `npm test` green; docs + changelog landed.
