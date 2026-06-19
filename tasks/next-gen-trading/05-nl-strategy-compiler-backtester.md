# Task 05 — Natural-Language Strategy Compiler + Historical Backtester

> **Operating bar (applies to the whole task).** Senior engineer + product thinker building
> three.ws to beat the best in the world. Genuinely innovative, not a clone. No mocks, no
> fake/sample data, no placeholders, no TODO/stubs, no `setTimeout` fake-loading. Wire 100%
> end-to-end with REAL APIs and real data. Every state designed. Only coin is **$THREE**
> (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`); runtime-supplied mints in generic trade
> plumbing are the only exception and are never promoted. After it works, self-review and ship
> the 10× improvement. `data/changelog.json` entry for every user-visible change. Run the
> **completionist** subagent. Stage only changed paths (never `git add -A`); re-check `git status`.

## The invention

Sniper config today is a wall of numeric fields most users can't reason about. We let a user
**describe a strategy in plain English** — "snipe coins from creators who've graduated at least
two, market cap under $30k, organic wallet distribution, smart money buying, take profit at 3x,
stop loss 40%, max 0.3 SOL per trade" — an LLM compiles it to a **validated**
`agent_sniper_strategies` row, and then we **backtest it against our own real historical data**
(`pump_coin_intel` + `pump_coin_outcomes`) so the user sees an honest projected win-rate, ROI
distribution, and worst-drawdown *before risking a lamport*. Nobody else can backtest pump.fun
strategies because nobody else has captured the structural history. We do.

## Context (real, verified)

- Historical truth: `pump_coin_intel` (per-launch signals: bundle/organic/concentration/
  snipe_ratio/fresh_wallet_ratio, quality_score, category, narrative) joined to
  `pump_coin_outcomes` (graduated/pumped/flat/rugged, `ath_multiple`, `ath_market_cap_usd`).
- Strategy schema + scoring semantics to compile *to* and replay *with*:
  `api/_lib/migrations/20260615020000_agent_sniper.sql`, `workers/agent-sniper/scorer.js`
  (`scoreMint`, `scoreIntel`) and exit logic `workers/agent-sniper/positions.js#decideExit`
  (stop/trailing/take-profit/timeout). Reuse the *exact* gate + scoring functions so the
  backtest matches live behavior.
- LLM access: worker proxies for OpenAI/Anthropic already exist in the platform (per CLAUDE.md
  "Real APIs in use … OpenAI/Anthropic via worker proxies"). Use the platform's existing LLM
  proxy/util — do not add a new key path or call providers directly from the browser.
- Strategy CRUD endpoint: `api/sniper/strategy.js`. Wallet-hub snipe tab: `src/agent-wallet-hub/tabs/snipe.js`.

## Goal

`POST /api/sniper/compile` (NL → validated strategy JSON + rationale) and
`POST /api/sniper/backtest` (strategy → replay over historical intel/outcomes → metrics),
surfaced as a conversational strategy builder in the snipe UI that ends in a one-click "Arm this".

## What to build

1. **Compiler** — `api/_lib/strategy-compiler.js`: send the user's text + a strict JSON schema of
   the real strategy fields to the LLM (function-calling / structured output), then **validate
   hard** against allowed ranges (stop_loss mandatory > 0, budgets sane, slippage bounded). Return
   the compiled strategy, a plain-language summary of what it will do, and any clamped/assumed
   fields called out explicitly. Reject incoherent requests with a helpful message — never emit an
   unsafe config.
2. **Backtester** — `api/_lib/strategy-backtest.js`: load the historical universe (windowed,
   e.g. last 30/90 days, network-scoped) from `pump_coin_intel ⋈ pump_coin_outcomes`. For each
   historical launch, apply the **same** hard gates/score from `scorer.js` to decide if the
   strategy would have entered; simulate the exit using `decideExit` semantics against the
   recorded `ath_multiple` / outcome (entry slippage + price-impact modeled honestly from recorded
   structure). Produce: entries taken, win-rate, median + p90/p10 ROI, expected value per trade,
   max drawdown, exposure, and a sample of representative hits/misses with real mints. Be explicit
   about survivorship/labeling limits — show sample size and a confidence caveat.
3. **API** — `/api/sniper/compile` + `/api/sniper/backtest` (auth, rate-limited). Backtest must be
   pure read-only over real data; cache by strategy hash.
4. **UI — conversational strategy builder** in `src/agent-wallet-hub/tabs/snipe.js`: a chat-style
   input ("describe your strategy"), the compiled strategy rendered as editable chips (every field
   adjustable), a live backtest report (distribution chart, win-rate, EV, drawdown, example
   trades), and an "Arm this strategy" button that writes via `api/sniper/strategy.js`. Designed
   loading (real async, skeletons), empty (prompt examples), error (LLM/data failure with retry),
   and populated states. Accessible + responsive.
5. **Backtest-vs-live honesty** — store each backtest snapshot (`strategy_backtests` table:
   strategy hash, window, metrics jsonb, sample_size, ran_at) and, once a strategy is armed and
   trading, show projected-vs-realized side by side on the trader profile so the projection is
   accountable, not marketing.

## Constraints

- The backtest replays **real captured history** only — never synthesize launches or outcomes,
  never inflate win-rates. If the historical window is too thin, say "insufficient data" rather
  than show a flattering number. This honesty is the product.
- The compiler must never produce a strategy that bypasses spend guards or the firewall; clamp to
  the same limits enforced at runtime (`agent-trade-guards.js`).
- LLM calls go through the existing platform proxy with real keys; handle timeouts/failures at the
  boundary with a clear retry path. No browser-side provider keys.
- $THREE-only; example mints in copy must be $THREE or clearly synthetic.

## Success criteria

- A plain-English description compiles to a valid, range-checked strategy with a readable summary.
- Backtest returns honest metrics computed from real `pump_coin_intel`/`pump_coin_outcomes` using
  the same gates/exits as live, with sample size + caveats shown.
- "Arm this" persists the strategy; projected-vs-realized appears once it trades.
- Build/typecheck/test clean. Changelog entry (tags: feature, improvement). Completionist passes.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

```bash
git rm "tasks/next-gen-trading/05-nl-strategy-compiler-backtester.md"
```

A file that still exists is unfinished work; a file that is gone has shipped. Do not delete early.
