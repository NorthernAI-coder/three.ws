# A02 — $THREE reflections/rewards: complete on-chain distribution + receipts

> Phase A · Depends on: A04 (snapshot freshness) ideally first · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
"Every paid action reflects $THREE back to holders pro-rata — deflation-free yield, no
burn" is a core reason to hold. The pro-rata math exists and a distribution cron exists,
but it computes a *plan* and does not reliably execute the on-chain transfers or record
receipts. Holders need to see real SOL/$THREE land in their wallets with a verifiable tx.
Finish the execution path and make every distribution auditable.

## Where this lives (real files)
- `api/cron/rewards-distribute.js` — reflections loop; currently produces a payout plan, dust-floor filtering, DRY-run when distributor key unset.
- `api/_lib/token/rewards.js` — pure pro-rata math (pool → per-holder amounts).
- `api/_lib/coin/three-holders.js`, `api/_lib/coin/payouts.js`, `api/_lib/coin/treasury.js` — holder balances + payout helpers.
- `api/_lib/token/config.js` — `REVENUE_SHARE_POOL_PCT`, rewards wallet guards.
- `api/_lib/migrations/` — add `three_rewards_distributions` if absent.

## Current state & gaps
- The execute branch loads the distributor key but does not complete batched on-chain transfers + confirmation.
- No durable `three_rewards_distributions` record (cycle, holder count, total paid, per-batch tx signatures, status).
- No public read for "last reflection, amount, when, tx" to back the holder-rewards claim.
- Risk of fan-out DDoS if transfers are sent serially per holder without batching.

## Build this
1. **Complete execution:** in `rewards-distribute.js`, when the distributor secret is set, build batched SPL transfers to holder ATAs (chunked, with compute-budget priority fees), submit, confirm, and handle partial/failed batches with retry. Use the existing RPC failover.
2. **Receipts:** write a `three_rewards_distributions` row per cycle (snapshot age used, eligible holders, total_pool_usd, total_paid, asset, batch tx signatures[], status, started_at/finished_at). Make it idempotent per cycle so a re-run resumes rather than double-pays.
3. **Eligibility & dust:** enforce the min-payout dust floor and the holder min-USD floor already in code; exclude the treasury/LP/AMM pool wallets from payouts (the AMM vault is a top "holder" — never reflect to it).
4. **Public proof:** add `GET /api/three-token/reflections` (or extend `/stats`) returning last cycle + recent cycles with Solscan links and 7d/30d totals. Wire it into the token page and the holder leaderboard.
5. **Dry-run parity:** with the secret unset, log a full plan and persist nothing destructive.

## Out of scope
- The buyback engine (**A01**).
- Changing the pool percentage (governance).

## Definition of done
- [ ] On a funded preview distributor, a cycle executes real batched transfers you can verify on Solscan, with a `three_rewards_distributions` receipt.
- [ ] AMM/treasury wallets excluded; dust floors enforced; idempotent re-run resumes safely.
- [ ] Public reflections endpoint populated and surfaced on the token page + holder leaderboard.
- [ ] Unit tests for pro-rata math, exclusion, batching, idempotency; `npx vitest run` green.
- [ ] Changelog entry; committed + pushed to both remotes.

## Verify
- Run the cron in dry-run; confirm the plan and zero writes.
- Run against a funded preview wallet with 2–3 test holders; confirm transfers land + receipt row.
- `curl …/api/three-token/reflections` returns real, link-resolving data.
