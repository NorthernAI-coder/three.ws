# agent-sniper

Autonomous pump.fun sniper. A long-lived Node worker that holds the PumpPortal
new-mint feed open, scores each launch against every armed agent strategy, and
snipes from the **agent's own** Solana wallet — then manages each position to a
stop-loss / take-profit / trailing-stop / timeout exit.

It is deliberately **not** a Vercel cron: hourly ticks can't snipe a launch.

## Architecture

| File | Role |
|------|------|
| `index.js` | Entrypoint. Feed subscription, buy queue, position sweep, feed watchdog, graceful shutdown. |
| `config.js` | Validated env (`loadConfig`). Throws on missing `DATABASE_URL`/`JWT_SECRET`; refuses live mode without a real RPC. |
| `strategy-store.js` | Cached active-strategy list + `countOpenPositions` / `getDailySpend` / `getOpenPositions`. |
| `scorer.js` | Pure `scoreMint(mint, strategy)` entry filter (mc band, creator history, socials, SOL-quote). |
| `keys.js` | `loadAgentKeypair` — decrypts the agent secret via `recoverSolanaAgentKeypair`, TTL-cached, audited. |
| `trade-client.js` | Wraps `PumpTradeClient`; `signAndSend` assembles a v0 tx, signs with the agent keypair, broadcasts, confirms. |
| `executor.js` | `executeBuy` / `executeSell` — every guardrail, the idempotency lock, the only place that signs. |
| `positions.js` | `runPositionSweep` — re-quotes open positions and triggers exits. |

State lives in two tables (migration `api/_lib/migrations/20260615020000_agent_sniper.sql`):
`agent_sniper_strategies` (owner-armed policy) and `agent_sniper_positions` (the
sniper's own trade ledger — *not* `pump_agent_trades`, whose `mint_id` FK can't
hold a stranger-launched mint).

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

## Run locally

```bash
# from repo root, with env exported (DATABASE_URL, JWT_SECRET, HELIUS_API_KEY)
npm run db:migrate                      # once — creates the two tables
SNIPER_MODE=simulate node workers/agent-sniper/index.js
```

Arm a test agent (owned by you, wallet funded with a little SOL) by inserting a
strategy row, then watch it score → open → exit. Flip to `SNIPER_MODE=live`
with tiny caps to land one real trade. `Ctrl-C` drains in-flight buys and exits.

## Known gap (fast-follow)

Bonding-curve exits only. A position that **graduates** mid-hold can't be sold on
the curve — it's flagged `exit_reason='graduated'` and parked for the AMM-exit
follow-up (via `buildPumpSwapInnerIx`). Short `max_hold_seconds` / take-profit
keep most positions exiting before graduation in the meantime.
