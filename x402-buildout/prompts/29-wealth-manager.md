# USE-29: Wealth-Manager Trading Bot

## Goal
Algorithmic agent that fetches market data, runs strategies, and executes trades — paying per-fetch and per-trade via x402. Reports performance in real-time ("yesterday I earned X%").

## Why (from PROJECT-IDEAS.md)
> Executes algorithmic trades and reports performance. Payment moments: Per-data fetch and per-trade fee.

## Reference
- PROJECT-IDEAS.md
- Pump.fun feed (existing in this repo)
- `agent-payments-sdk/` (existing)

## Dependencies
- USE-00..09 (sellers + buyers complete)
- USE-22 (spending caps — CRITICAL for autonomous trading)
- USE-24 (audit log — required for performance reporting)

## Files to create
- `agents/wealth-manager/` — new workspace
- `agents/wealth-manager/package.json`
- `agents/wealth-manager/src/index.js` — entry: schedule market fetches, run strategy loop
- `agents/wealth-manager/src/data-sources.js` — paid sources: Messari (wrapped via x402), Pump.fun (existing), CoinGecko, our own paid analytics
- `agents/wealth-manager/src/strategies/momentum.js` — basic momentum
- `agents/wealth-manager/src/strategies/mean-reversion.js`
- `agents/wealth-manager/src/executor.js` — places real trades on a DEX (Jupiter for Solana, Uniswap for EVM)
- `agents/wealth-manager/src/perf-report.js` — daily performance summary, paid endpoint exposing it
- `api/agents/wealth-manager-report.js` — public paid endpoint to read the bot's performance

## Files to modify
- Root `package.json` — add workspace
- `.env.example` — `WEALTH_MANAGER_STRATEGY`, `WEALTH_MANAGER_MAX_POSITION_USD`, `WEALTH_MANAGER_DEX` (jupiter|uniswap), `JUPITER_API_URL`, `UNISWAP_RPC_URL`

## Implementation

### Strategy loop
Cron every N minutes (Vercel cron or Node interval):
1. Fetch market data from paid sources (auto-pay via buyer client + batch-settlement)
2. Run strategy → produce buy/sell signals
3. For each signal, check position limits, execute trade on DEX
4. Record trade + price in audit log
5. After each trade, refresh portfolio value

### Trade execution (real, not paper)
- Jupiter for Solana swaps
- Uniswap V3 for Base swaps
- Sign + send via the agent's wallet (NOT the user's main wallet — dedicated trading wallet)

### Spending caps (CRITICAL)
- Per-call cap on data fetches
- Per-trade cap on execution
- Per-day total budget
- Auto-pause on suspicious activity (e.g., 10 losses in a row, sudden balance drop)

### Performance reporting endpoint
`/api/agents/wealth-manager-report` — paid `$0.01` endpoint returning:
- Daily / weekly / monthly P&L
- Win rate
- Sharpe ratio
- Open positions
- Strategy code hash (so callers can verify which version is running)

### Safety
- Trading wallet is a dedicated low-balance wallet, NOT the user's primary
- Kill switch: env var `WEALTH_MANAGER_PAUSED=true` halts all trades immediately
- Alerts on Slack/Discord (via webhook) for every trade

## Wiring checklist
- [ ] Trading wallet dedicated, balance limited
- [ ] Strategy backtested before live
- [ ] All trade execution + data fetches paid via x402 (no free leeching)
- [ ] Performance endpoint paid via x402
- [ ] Kill switch operational
- [ ] Slack/Discord webhook firing
- [ ] All trades recorded in audit log

## Acceptance
- [ ] Bot runs for 24h on testnet without crashing
- [ ] Bot makes at least one trade
- [ ] Performance endpoint returns real numbers (not placeholders)
- [ ] Daily Slack/Discord summary delivered
- [ ] Kill switch tested: setting env var halts within one loop cycle
- [ ] Audit log shows every data fetch + trade
