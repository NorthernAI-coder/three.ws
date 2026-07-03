# Task 01 — Live-State Audit of the x402 Ring (READ-ONLY)

## Mission

Produce a definitive, evidence-backed snapshot of why the closed-loop x402 ring
economy is producing zero volume **in the deployed environment right now**, and
write it to `tasks/x402-ring/STATUS.md`. You change nothing: no code edits, no
env writes, no funds moved. Every claim in your report must carry the command
you ran and its real output.

## Context you must know

- Design doc: `docs/x402-ring-economy.md`. The loop: payer wallet pays
  `/api/x402/ring-settle` (and the wider paid catalog) in USDC → self-hosted
  facilitator `/api/x402-facilitator` verifies + settles → treasury receives →
  `ring-rebalance` sweeps treasury→payer so the float recirculates. Sponsor (or
  self-pay) covers SOL fees.
- Static root-cause hypotheses already found by code reading (verify each against
  the LIVE deployment — env, chain, DB):
  1. `X402_FACILITATOR_URL_SOLANA` defaults to `https://facilitator.payai.network`
     (`api/_lib/env.js:742-748`); `facilitatorFor()` (`api/_lib/x402-spec.js:242-248`)
     routes purely off it.
  2. `X402_SELF_FACILITATOR_ENABLED` defaults false → facilitator 503
     (`api/_lib/x402/self-facilitator.js:62-63`, `api/x402-facilitator/[action].js:89-96`).
  3. `ring-settle` default price 1_000_000 atomic ($1.00, `api/x402/ring-settle.js:36`)
     vs `VOLUME_PER_RUN_CAP_ATOMIC` default 50_000 ($0.05,
     `volume-bootstrap-loop.js:59-62`) → `cap_would_exceed` skip (`pay.js:182-184`).
  4. `ring-rebalance` no-ops without `X402_TREASURY_SECRET_BASE58`
     (`ring-rebalance.js:71-72`).
  5. Solana accept dropped when `X402_FEE_PAYER_SOLANA` unset
     (`api/_lib/x402-paid-endpoint.js:175-179`).
  6. Only driver is `/api/cron/x402-autonomous-loop` @ `*/5 * * * *`
     (`vercel.json:4872-4875`); `X402_AUTONOMOUS_ENABLED='false'` would kill it
     (`x402-autonomous-loop.js:226`).

## Tasks

1. **Env truth table.** `vercel env ls` (production). For every var below record
   SET / NOT SET (never print secret values — names and presence only):
   `X402_SELF_FACILITATOR_ENABLED`, `X402_FACILITATOR_URL_SOLANA`,
   `X402_PAY_TO_SOLANA`, `X402_TREASURY_SECRET_BASE58`, `X402_FEE_PAYER_SOLANA`,
   `X402_FEE_PAYER_SECRET_BASE58`, `X402_SEED_SOLANA_SECRET_BASE58`,
   `X402_AGENT_SOLANA_SECRET_BASE58`, `X402_RING_SELF_PAY`,
   `X402_PRICE_RING_SETTLE`, `X402_VOLUME_PER_RUN_CAP_ATOMIC`,
   `X402_AUTONOMOUS_DAILY_CAP_ATOMIC`, `X402_AUTONOMOUS_ENABLED`,
   `X402_EXTERNAL_ENABLED`, `X402_CHARITY_AUDIT_BPS`,
   `X402_SPONSOR_SOL_FLOOR_LAMPORTS`, `X402_SELF_FACILITATOR_PAYTO_ALLOWLIST`,
   `SOLANA_RPC_URL` / `HELIUS_API_KEY`, `DATABASE_URL`.
2. **Live probes** (production, with `curl -sS`, record status + body):
   - `GET https://three.ws/api/x402-facilitator/supported` — 503 = facilitator off.
   - `GET https://three.ws/api/x402-ring?period=7d` — volume, tx count, balances.
   - `GET https://three.ws/api/x402/ring-settle` unauthenticated — inspect the 402
     challenge: does an `exact/solana` accept exist? What `payTo`, what facilitator?
   - `GET https://three.ws/api/x402-status` — which facilitators probe healthy.
   - One cheap catalog endpoint (e.g. `GET https://three.ws/api/x402/dance-tip`)
     — same 402-challenge inspection.
3. **Database evidence.** Against production `DATABASE_URL` (read-only queries):
   - Do tables `x402_self_facilitator_log`, `x402_ring_ledger`, `x402_ring_wallets`
     exist (was the migration `api/_lib/migrations/2026-07-01-x402-ring-economy.sql`
     ever applied)? Row counts + most recent `created_at` of each.
   - `x402_autonomous_log`: last 50 rows — when did outbound paid calls last
     succeed? Group by `status`/`detail` to surface `cap_would_exceed`,
     `no_payable_accept`, facilitator errors. **This tells us when and how "it was
     working" stopped.**
   - `x402_volume_metrics`: per-endpoint last-paid timestamps.
4. **Wallet state on chain.** From env pubkeys (and `x402_ring_wallets` if
   populated): SOL balance, USDC ATA + balance, and the last 20 signatures for
   payer, treasury, sponsor. Note the last real settlement signature and date.
5. **Chronology.** Correlate 3+4: identify the exact date/mechanism the loop
   stopped (cap exceeded? float drained? env removed? facilitator flipped 503?).
6. **Write `tasks/x402-ring/STATUS.md`:** env truth table, probe outputs, DB
   evidence, chain evidence, the confirmed failure chain in one paragraph, and a
   checklist of which of tasks 02–11 each finding maps to. Mark each static
   hypothesis CONFIRMED / REFUTED / PARTIAL with evidence.

## Constraints

- READ-ONLY: no env writes, no code changes, no funds moved, no DB writes.
- Never print secret values, only presence. Redact any base58 secret that leaks
  into command output.

## Acceptance criteria

- [ ] `STATUS.md` exists with all six sections and real command output.
- [ ] Every hypothesis marked CONFIRMED/REFUTED/PARTIAL with evidence.
- [ ] The stop-date and stop-mechanism of the previously-working loop identified
      (or explicitly proven undeterminable, with what evidence is missing).
- [ ] Zero mutations performed (state this and show `git status` is clean apart
      from STATUS.md).
