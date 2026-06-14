# Task 03 — Custodial (agent-signed) USDC trading

**Priority:** MEDIUM. **Depends on:** Task 01. **Type:** backend.

## Goal

Let an agent's **custodial** wallet (server-signed, via the recovered encrypted keypair) buy and
sell USDC-paired coins, not just SOL. The wallet-signed path is handled by Task 02; this is the
autonomous/server path used by strategies, buyback, and the `launch-agent` family. The v2 audit
flagged a "custodial USDC trading flag" as deferred.

## Why this matters

Autonomous lanes (buyback, strategy-run, distribute) currently assume SOL. On a USDC-paired
agent coin they would build a SOL trade against a USDC curve — wrong asset, failed or mispriced
transaction. The autonomous economy must work for both quote assets or it silently breaks for
every USDC coin an agent launches.

## Context — read first

- `api/_lib/agent-pumpfun.js` — `loadAgentForSigning`, recovers encrypted Solana keypair.
- `api/pump/[action].js` — `launch-agent`, `collect-creator-fee-agent`,
  `distribute-creator-fees-agent`, `strategy-*`, server-signed trade paths.
- `api/_lib/pump-swap-ix.js`, `api/_lib/pump-quote.js`, `api/_lib/pump-trade-args.js`.
- `api/cron/pump-agent-stats.js` and the buyback/distribute cron paths
  (`pump_buyback_runs`, `pump_distribute_runs`).
- Task 01's quote columns — record custodial USDC trades correctly too.

## Scope

1. **Resolve the coin's quote asset server-side** before building any custodial trade; thread the
   quote mint through the instruction builder exactly as the wallet path does.
2. **Custodial USDC buy/sell** — server signs a `buy_v2`/`sell_v2` against the correct quote ATA;
   create the agent's quote ATA idempotently if missing.
3. **Buyback / distribute** lanes respect the quote asset (a USDC coin buys back with USDC, etc.).
   If a lane genuinely can't operate in a given quote, it must fail loudly with a clear reason
   and record the error in `pump_buyback_runs`/`pump_distribute_runs` — never silently no-op.
4. **Record** custodial trades with the Task 01 quote columns.

## Definition of done

- [ ] A custodial buy and sell on a USDC-paired coin succeed on devnet (coordinate with Task 07).
- [ ] Buyback/distribute lanes operate in the coin's quote asset, or fail with a recorded reason.
- [ ] SOL custodial paths unchanged (no regression).
- [ ] `npm test` passes; add a unit test covering quote-asset resolution in the custodial builder.
- [ ] Changelog entry (tag: `feature`): "Agents can autonomously trade USDC-paired coins."

## Out of scope

The user-wallet UI (Task 02).
