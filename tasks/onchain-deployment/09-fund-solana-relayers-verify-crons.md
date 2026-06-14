# Task: Fund Solana Relayers + Verify Buyback/Distribution Crons + Devnet Smoke

## Context

The pump.fun agent-payments machinery is fully built but several on-chain execution
paths are **conditionally wired and currently unfunded/unverified**:

- Buyback + distribution crons require `PUMP_CRON_RELAYER_SECRET_KEY_B64` — a funded
  Solana keypair — to pay tx fees and swap gas (`api/pump/[action].js` distribute /
  buyback handlers, `pump_distribute_runs` / `pump_buyback_runs` audit tables).
- The devnet smoke trade for `pump buy-prep` "awaits a funded signer" (per ops memory).
- SNS subdomain minting needs `THREEWS_SOL_PARENT_SECRET_BASE58`; returns 503 when unset.
- Agent authority keypairs and the collection authority need SOL for fees.

Without funded signers + a verification pass, these flows are "deployed" but not
provably working — exactly the gap this plan closes.

## Goal

Every Solana execution signer the platform relies on is funded and verified, the
buyback/distribution crons demonstrably run a real on-chain tx on devnet, and the
pump buy-prep devnet smoke trade passes.

## Files to Read First

- `api/pump/[action].js` — buyback (`buyback-*`), distribute (`distribute-creator-fees-*`),
  `launch-agent`, `buy-prep`/`buy-confirm` handlers
- `api/cron/pump-agent-stats.js` and any pump distribute/buyback cron entry
- `api/_lib/pump.js` — RPC selection, signer loading, network handling
- `api/_lib/migrations/2026-04-30-pump-fun.sql` — `pump_distribute_runs`, `pump_buyback_runs`
- `vercel.json` — cron schedule registrations
- Ops memory: `tasks/` may hold a prior `devnet-smoke-trade.md`; reconcile with it

## What to Build / Do

1. **Inventory every Solana signer env var** the platform reads (relayer, parent SNS
   secret, agent authority, collection authority) and document each: var name,
   purpose, required SOL balance, network. Put this in
   `tasks/onchain-deployment/SOLANA-SIGNERS.md`.

2. **Fund the devnet signers** (airdrop) and at least the relayer on mainnet to a
   documented minimum. Report exact balances; flag anything the user must fund that
   requires real SOL.

3. **Devnet smoke trade**: run `buy-prep` → `buy-confirm` for a synthetic mint (or
   `$THREE` on a devnet fork — never a real third-party mint) with the funded signer.
   Capture the confirmed signature. Make it a re-runnable `scripts/` script.

4. **Verify the distribution cron**: trigger `distribute-creator-fees` against a test
   agent mint on devnet, confirm a row lands in `pump_distribute_runs` with before/after
   balances and a real signature.

5. **Verify the buyback cron**: trigger a buyback on devnet, confirm `pump_buyback_runs`
   logs a real swap attempt + signature.

6. **Verify SNS minting** end-to-end: with `THREEWS_SOL_PARENT_SECRET_BASE58` set,
   mint a synthetic test subdomain on `threews.sol`, confirm the URL record + the
   `user_subdomains` row, then note cleanup.

7. **Add a low-balance alert**: if any relayer drops below its documented minimum, fire
   a Telegram ops alert (reuse the existing observability/alerts pipeline) so signers
   never silently run dry.

## Constraints

- Never commit any secret key. Document env var NAMES only.
- Use synthetic mints or `$THREE` on devnet — never a real third-party token.
- Devnet first for every flow; only fund mainnet relayers to the documented minimum.
- Crons must write their audit rows — a run with no audit row is a failure, not a pass.
- Mind the Redis quota incident: don't add high-frequency polling that burns the
  Upstash quota; reuse existing crons.

## Success Criteria

- `tasks/onchain-deployment/SOLANA-SIGNERS.md` lists every signer, its purpose, env
  var, network, and funded balance.
- A confirmed devnet `buy` signature exists (re-runnable script).
- `pump_distribute_runs` and `pump_buyback_runs` each gain a real row from a verified
  devnet run.
- A synthetic SNS subdomain mints + resolves end-to-end.
- Low-balance alerting fires when a relayer is under-funded.
- No secrets committed.
