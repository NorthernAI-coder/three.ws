# A01 — $THREE buyback engine: scheduled, on-chain, audited, public proof

> Phase A · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
The headline promise on the $THREE token page is "50% of all platform revenue buys
$THREE on the open market and routes it to the treasury — on-chain, verifiable." Today
that is wired but not *proven*: the public stats endpoint already reports buyback runs,
but the execution path is opt-in and there is no scheduled job that actually runs buys,
logs them, and exposes a verifiable, on-chain receipt trail. A $1B token economy lives or
dies on this being true and auditable. Make it real, automatic, and provable.

## Where this lives (real files)
- `api/_lib/token/buyback.js` — market-buy engine (Jupiter swap), `buybackStats()` public summary, spend caps/slippage, signer load.
- `api/_lib/token/config.js` — split policies (treasury/rewards), commit bps, fail-closed wallet guards.
- `api/three-token/[action].js` — `GET /stats` returns `buyback` summary; `three_buyback_runs` table is referenced here.
- `api/cron/[name].js` — Vercel cron dispatcher with constant-time secret auth (add the new cron here or as its own file).
- `api/_lib/migrations/` — add a migration for the audit table if not present.
- `vercel.json` — cron schedule registration.

## Current state & gaps
- `buybackStats()` aggregates from `three_buyback_runs` but no scheduled job writes to it on a cadence.
- Execution is gated behind `isEnabled()` + signer presence; when off it's a silent no-op with no operator signal.
- No public, per-run verifiable trail (Solscan tx per buy) beyond what `buybackStats()` can show.
- "Revenue earned so far" is currently $0 — confirm the revenue source (`agent_revenue_events`) is the real, complete ledger and that the commitment math is correct.

## Build this
1. **Scheduled buyback cron** (`api/cron/three-buyback.js` or a `[name].js` branch): runs every 6–12h. Computes `committed = revenue_since_last_run × commit_bps`, fetches a Jupiter quote (USDC→$THREE), submits + confirms the swap on mainnet, routes bought $THREE to the treasury, and writes a row to `three_buyback_runs` (usdc_spent, three_bought, price, tx signature, slippage, status, ran_at). Register it in `vercel.json`.
2. **Idempotency & caps:** never double-spend the same revenue window (cursor/high-water mark in DB); enforce per-run and daily USD caps and max slippage; on quote/slippage failure, record a `skipped` run with reason — never a silent exit.
3. **Resilience:** use the existing Solana RPC failover (`api/_lib/solana/`); retry with backoff; alert ops (`api/_lib/alerts.js`) on hard failure; record partial fills correctly.
4. **Public proof endpoint:** ensure `GET /api/three-token/stats` (and/or a dedicated `GET /api/three-token/buybacks`) returns: total revenue, committed, deployed on-chain, $THREE bought, run count, and the last N runs each with a Solscan tx link. The token page already renders `recent_runs` — make sure the shape matches and links resolve.
5. **Dry-run safety:** when the signer/env is unset (dev/preview), the cron computes and logs a *plan* (no on-chain send) and records nothing destructive — exactly like a real run minus the transaction.

## Out of scope
- Changing the commitment percentage or token split policy (governance decision).
- The rewards/reflections distribution (that is **A02**).

## Definition of done
- [ ] Cron is registered, runs on schedule, and on a funded staging/preview signer executes a real buy you can open on Solscan.
- [ ] Every run (success, skipped, failed) is persisted with a reason; no silent exits.
- [ ] `buybackStats()` / the public endpoint reflects real runs with working Solscan links; the token page "Programmatic buybacks" panel shows them.
- [ ] Caps, slippage, and idempotency are enforced and unit-tested (`tests/`); RPC failover + alerting covered.
- [ ] Dry-run mode proven safe with the signer unset.
- [ ] Changelog entry; committed + pushed to both remotes.

## Verify
- Trigger the cron locally with the cron secret; confirm a row in `three_buyback_runs` and a `plan` in dry-run.
- `curl https://three.ws/api/three-token/stats` (or your preview) and confirm the `buyback` block is populated and links resolve.
- `npx vitest run` green, including new buyback tests.
