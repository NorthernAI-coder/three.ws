# Trading Frontier — Chain Backlog Index

Single source of truth for the self-extending chain. **Read this before inventing ideas; append to
it after authoring new prompts.** One line per prompt. Dedup is mandatory — if a line already
covers your idea, it is not new. Remove a line only when its prompt has shipped and been deleted.

Format: `- <slug> — <one-line hook> — proposed by <task>`

## Generation 0 (seeds — live in `tasks/trading-frontier/`)

- 02-programmable-orders-engine — limit/stop/DCA/TWAP/conditional triggers executed by a worker — seed
- 03-portfolio-intelligence-command — unified cross-wallet PnL attribution + risk dashboard — seed
- 04-graduation-predictor — calibrated ML probability a launch graduates, surfaced everywhere — seed
- 05-multichain-agent-treasury — cross-chain agent wallet + bridging across ERC-8004 chains — seed
- 06-creator-reputation-registry — track creators across launches, verified-creator + rug history — seed
- 07-universal-wallet-mirror — mirror any external on-chain wallet's trades from the agent wallet — seed
- 08-realtime-alert-automation — programmable alerts → push/Telegram/in-app + auto-actions — seed
- 09-amm-migration-sniper — snipe the graduation→AMM moment + new-pool/LP-add detection — seed

## Generation 1+ (chained — live in `tasks/trading-frontier/next/`)

<!-- Agents append new prompt lines here. Confirm no duplicate above before adding. -->

- liquidity-exit-router — split a large sell across bonding curve + AMM and micro-slices to minimize realized slippage — proposed by task 02
- profit-taking-ladder — one action arms a ladder of limit-sell rungs at rising targets that scale out of a position — proposed by task 02
- oco-bracket-orders — bracket a holding with a take-profit and a stop-loss that automatically cancel each other — proposed by task 02
- curve-depth-heatmap — live depth/slippage curve for any mint + the optimal trade size before you click — proposed by task 02
- watchlist-wallet-triggers — add a 'a watched wallet net-bought/sold this coin' signal to conditional orders + a watchlist — proposed by task 02
- volatility-adaptive-stops — size trailing/stop distances from each coin's realized volatility so stops fit the chart — proposed by task 02
- auto-compound-vault — auto-route a % of every realized profit back into $THREE or your winners — proposed by task 02
- paper-trading-sandbox — run any order/strategy in paper mode against live prices and watch hypothetical P&L — proposed by task 02
- order-health-monitor — surface exactly why each order isn't firing and fix it in one click; auto re-arm policies — proposed by task 02
- triggered-order-sequences — chain orders by dependency: when one fills, auto-arm the next (entry→bracket, DCA→trail) — proposed by task 02


- liquidity-aggregation-router — best-path execution across pump.fun curve, PumpSwap AMM, and Jupiter (single or split) — proposed by task 01
- dynamic-position-sizing — regime + conviction-weighted automatic trade sizing (vol-target / fractional-Kelly) shared by copilot, orders, snipe — proposed by task 01
- post-graduation-liquidity-monitor — track AMM pool depth + LP concentration after graduation, alert on LP-whale pulls — proposed by task 01
- portfolio-hedging-correlation — real-time cross-position correlation matrix + auto-hedge suggestions + correlation-aware exposure caps — proposed by task 01
- verifiable-onchain-backtest-attestation — publish replayable strategy backtests as Solana + ERC-8004 attestations anyone can verify — proposed by task 01
- narrative-drift-sentinel — detect creator/narrative pivots + sentiment decay and red-flag launches whose story changed — proposed by task 01
- gas-fee-forecaster-batcher — real-time Solana priority-fee forecasting + small-order auto-batching for land-rate and fee savings — proposed by task 01
- agent-skill-reputation-leaderboard — multi-dimensional agent reputation beyond PnL (calibration, Sharpe/drawdown, loss-cutting speed, graduation accuracy) — proposed by task 01
- creator-series-cross-chain-mint — mint sequel chapters of a creator narrative + a cross-chain creator directory with optional brand licensing — proposed by task 01
- rug-loss-protection-vault — $THREE-denominated mutual pool that auto-compensates verified rug losses on firewall-cleared trades, settled via x402 — proposed by task 01
- networth-history-recorder — scheduled net-worth snapshotter → real equity curve, true net-worth drawdown, windowed returns — proposed by task 03
- exit-liquidity-radar — depth-aware true liquidatable net worth (sell-simulated vs paper value) per holding — proposed by task 03
- fleet-treasury-console — owner-scoped roll-up of net worth/PnL/exposure/risk across ALL of a user's agents — proposed by task 03
- dust-sweeper-rent-reclaimer — detect dead/dust SPL accounts + guarded batch closeAccount to reclaim SOL rent — proposed by task 03
- counterfactual-replay — "held vs sold" held-to-now value on closed positions + a timing-edge score — proposed by task 03
- token-approval-security-scanner — audit + one-click revoke of the agent wallet's own SPL delegate approvals/authorities — proposed by task 03
- mev-sandwich-forensics — post-trade detection + SOL-cost quantification of sandwich/front-run extraction against the agent's swaps — proposed by task 03
- trading-discipline-coach — behavioral pattern engine (disposition effect, revenge/overtrading) + number-backed nudges — proposed by task 03
- proof-of-holdings-card — opt-in chain-verifiable live net-worth snapshot, share page + OG image + optional on-chain anchor — proposed by task 03
- drawdown-circuit-breaker — book-level auto-freeze of all trade paths when net-worth/PnL drawdown crosses a threshold — proposed by task 03
