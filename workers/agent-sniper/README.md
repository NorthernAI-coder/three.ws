# agent-sniper

Autonomous pump.fun sniper. A long-lived Node worker that snipes from the
**agent's own** Solana wallet, then manages each position to a stop-loss /
take-profit / trailing-stop / timeout exit. Two triggers arm a strategy:

- **`new_mint`** (default) — holds the PumpPortal new-mint feed open and scores
  each launch as it happens.
- **`first_claim`** — polls the on-chain pump.fun fee-claim stream and fires when
  a creator pulls their accrued creator/delegated rewards for the **first time
  ever** — an irreversible "the creator is live and taking real fees" signal.
  Buys the creator's coin after an owner-set delay.

It is deliberately **not** a Vercel cron: hourly ticks can't snipe a launch.

## Architecture

| File | Role |
|------|------|
| `index.js` | Entrypoint. Feed subscription, buy queue, position sweep, feed watchdog, graceful shutdown. |
| `config.js` | Validated env (`loadConfig`). Throws on missing `DATABASE_URL`/`JWT_SECRET`; refuses live mode without a real RPC. |
| `strategy-store.js` | Cached active-strategy list + `countOpenPositions` / `getDailySpend` / `getOpenPositions`. |
| `scorer.js` | Pure `scoreMint(mint, strategy)` entry filter (mc band, creator history, socials, SOL-quote). |
| `claim-scorer.js` | Pure `scoreClaim(claim, strategy)` entry filter for the first-claim trigger (claim-size band, mint resolvable). |
| `first-claim-watch.js` | `startFirstClaimWatch` — polls the fee-claim stream, scores first-ever claims, holds the owner-set delay, snipes via `executeBuy`. |
| `keys.js` | `loadAgentKeypair` — decrypts the agent secret via `recoverSolanaAgentKeypair`, TTL-cached, audited. |
| `trade-client.js` | Wraps `PumpTradeClient`; `signAndSend` assembles a v0 tx, signs with the agent keypair, broadcasts, confirms. |
| `executor.js` | `executeBuy` / `executeSell` — every guardrail, the idempotency lock, the only place that signs. Routes graduated coins through the AMM. |
| `positions.js` | `runPositionSweep` — re-quotes open positions (curve OR AMM) and triggers exits. |
| `amm-exit.js` | `quoteAmmSell` / `buildAmmSellInstructions` / `isGraduated` — post-graduation AMM pricing + sell build (shared with the user-driven path's pool resolution). |

State lives in two tables (migrations `…20260615020000_agent_sniper.sql` +
`…20260615030000_sniper_first_claim.sql`): `agent_sniper_strategies` (owner-armed
policy, incl. `trigger`, `buy_delay_ms`, and the `*_claim_lamports` filters) and
`agent_sniper_positions` (the sniper's own trade ledger, tagged with the
`entry_trigger` that opened it — *not* `pump_agent_trades`, whose `mint_id` FK
can't hold a stranger-launched mint).

## First-claim trigger

A `first_claim` strategy is armed exactly like a `new_mint` one (POST
`/api/sniper/strategy` with `trigger: "first_claim"`), plus claim-specific knobs:

| Field | Meaning |
|-------|---------|
| `buy_delay_ms` | Wait this long after the claim is observed before buying (0–600000). |
| `min_claim_lamports` | Only fire when the first claim pulled ≥ this — a floor that skips dust. |
| `max_claim_lamports` | Optional ceiling. |
| `first_claim_max_age_seconds` | Ignore claims older than this when first seen (overrides `SNIPER_CLAIM_MAX_AGE_S`). |

The poll loop reuses the SAME executor, idempotency lock, budget/concurrency
caps, and position lifecycle as the new-mint path — only the trigger differs.

## Guardrails

Enforced in `executeBuy`, short-circuiting before any transaction:

1. **Global kill** — `SNIPER_GLOBAL_KILL=1` halts new buys (positions still managed).
2. **Per-agent kill** — `kill_switch` column; killed agents drop out of the active set and any open position exits at market.
3. **Daily budget cap** — `daily_budget_lamports` vs today's committed spend.
4. **Max concurrent positions** — `max_concurrent_positions`.
5. **Mandatory stop-loss** — DB `CHECK (stop_loss_pct > 0)` + runtime filter.
6. **Price-impact circuit breaker** — `max_price_impact_pct` checked against a fresh `quoteForBuy`.
7. **Idempotency** — `INSERT … ON CONFLICT (agent_id, mint, network) DO NOTHING` claims the slot before the tx; one shot per mint per agent.

> **Single-worker assumption.** Budget/concurrency races are prevented by an
> in-process per-agent lock. Run exactly ONE instance. Scaling out requires an
> atomic DB spend reservation instead.

## Environment

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `DATABASE_URL` | ✅ | — | Neon Postgres. |
| `JWT_SECRET` | ✅ | — | Decrypts agent Solana secrets. |
| `SOLANA_RPC_URL` / `HELIUS_API_KEY` | live only | — | Public RPC 429s under the firehose; required for `live`. |
| `SNIPER_MODE` | | `simulate` | `simulate` = real quotes, no broadcast; `live` = real trades. |
| `SNIPER_NETWORK` | | `mainnet` | `mainnet`/`devnet`. |
| `SNIPER_GLOBAL_KILL` | | `0` | `1` halts new buys. |
| `SNIPER_POLL_MS` | | `5000` | Position re-quote cadence. |
| `SNIPER_MAX_GLOBAL_BUYS_PER_MIN` | | `10` | Platform-wide buy throttle backstop. |
| `SNIPER_CONFIRM_TIMEOUT_MS` | | `60000` | Per-trade confirmation wait. |
| `SNIPER_CLAIM_POLL_MS` | | `30000` | First-claim trigger: fee-claim poll cadence. |
| `SNIPER_CLAIM_LOOKBACK_S` | | `600` | First-claim trigger: window scanned each poll (must exceed the poll interval). |
| `SNIPER_CLAIM_MAX_AGE_S` | | `300` | First-claim trigger: default freshness gate (per-strategy override available). |

## Run locally

```bash
# from repo root, with env exported (DATABASE_URL, JWT_SECRET, HELIUS_API_KEY)
npm run db:migrate                      # once — creates the two tables
SNIPER_MODE=simulate node workers/agent-sniper/index.js
```

Arm a test agent (owned by you, wallet funded with a little SOL) by inserting a
strategy row, then watch it score → open → exit. Flip to `SNIPER_MODE=live`
with tiny caps to land one real trade. `Ctrl-C` drains in-flight buys and exits.

## Graduated-position exit

A position whose coin **graduates** off the bonding curve mid-hold is exited
automatically through the canonical pump AMM pool — it never parks. The
bonding-curve sell path detects graduation (the SDK's `CoinGraduatedError`), then
re-routes the same exit through `amm-exit.js` (`buildAmmSellInstructions`), which
reuses the platform's pool resolution (`getAmmPoolState`) and `PumpAmmSdk`
(`sellBaseInput`) — identical to the user-driven sell in `api/pump/[action].js`.
The slippage-derived min-out floor is embedded on-chain, so a thin post-graduation
pool can't sandwich the exit.

`runPositionSweep` re-quotes graduated positions off the AMM (not the dead curve),
so stop-loss / trailing / take-profit / timeout keep firing against the real
post-graduation price, and PnL is computed against the live AMM quote. A position
flagged `error='graduated:awaiting_amm_exit'` is re-quoted and exited on the next
sweep — no terminal park state.

To clear a backlog (or force the exit right after deploy instead of waiting for
the next poll), run the one-shot backfill — idempotent, honors `SNIPER_MODE`:

```bash
SNIPER_MODE=simulate node scripts/sniper-backfill-graduated.mjs
```
