# Task 03 — Autonomous Treasury: teach the wallet to act

> Read [00-README-orchestration.md](./00-README-orchestration.md) in full first
> (ownership model, $THREE law, real APIs, design system, run loop, worktree rules).

## Mission (one line)

Let an owner **teach their agent's wallet a strategy** — and have the agent **execute
it autonomously** within real, audited, owner-set guardrails: DCA, take-profit
ladders, tip-back, reflexive snipes, treasury rules.

## Why this is gamechanging

Today a wallet waits for you. Here the wallet is owned by an *agent* — it should be
able to act for you. An owner who sets "DCA 0.1 SOL into $THREE every day, take 25%
profit at 2x, auto-tip-back anyone who tips me over 0.5 SOL" and walks away has
something no consumer wallet offers: a programmable, embodied, on-chain autonomous
treasurer with a kill switch and a full audit trail. This is the feature pro traders
and launchers *switch platforms for*. The screenshot moment: a clean strategy card
showing "Agent executed 7 actions while you were away — +X SOL, all within limits."

## Non-negotiable safety framing

This handles real money with the agent's custodial key. It must be **defense-in-depth**:
- Strategies are **owner-only** to create/edit/arm — re-authorized server-side every time.
- Every autonomous action runs through the **existing spend & trade guards**
  (`api/_lib/agent-trade-guards.js`): `per_tx_usd`, `daily_usd`, `per_trade_sol`,
  `daily_budget_sol`, `max_price_impact_pct`, `max_slippage_bps`, allowlist, and the
  `frozen` / `kill_switch` master stop. A strategy can never exceed the owner's limits.
- Every action is written to the **custody ledger** (`agent_custody_events`) with a
  real signature and is visible in the trail. Idempotency keys prevent double-spends.
- A **kill switch** halts all strategies instantly and is always one click away.
- No strategy may reference or buy any token but $THREE except via the generic,
  user-supplied-mint runtime path. Never hardcode another mint as a target.

## What you are building

1. **Strategy model + API** — a real, persisted strategy definition per agent (store
   in `agent_identities.meta.strategies` or a dedicated table; choose what fits the
   codebase and migrate properly). Owner CRUD endpoints under
   `api/agents/:id/...` that re-check ownership. Supported primitives, each fully
   implemented (no stubs):
   - **DCA** into $THREE (amount, cadence, source asset, budget cap).
   - **Take-profit / stop ladders** on a held position (trigger by price/PnL).
   - **Tip-back** (auto-return a % to anyone who tips over a threshold).
   - **Reflexive snipe** (buy new launches matching owner-set criteria) — reuse the
     sniper executor and its guards; this is the autonomous policy on top.
   - **Treasury rules** (e.g. keep N SOL liquid, sweep excess to a withdraw allowlist
     address on a schedule).
2. **Execution engine** — a real worker/cron (see `workers/` and the existing
   sniper executor) that evaluates armed strategies against **real market data**
   (pump.fun feed, holdings, RPC prices), executes via the real trade/withdraw/tip
   paths, enforces guards, records custody events, and is idempotent and crash-safe.
3. **Owner control UI** — a strategy surface in the wallet hub: build/arm/disarm
   strategies, see live status, the next scheduled action, the full action history
   (from the real custody trail), spend-vs-limit meters, and the kill switch.

## Real data & APIs

- Market data: pump.fun feed + `/api/pump/*`, holdings + RPC prices via `/api/solana-rpc`.
- Execution: existing owner trade (`/solana/trade`), withdraw (`/solana/withdraw`),
  tip-record, x402; guards in `api/_lib/agent-trade-guards.js`; limits via
  `/solana/limits`. History from `/solana/custody`.
- $THREE CA from `00-README` for DCA/affinity. Never another hardcoded mint.

## UX spec

- **States**: no strategies (empty state that *teaches* with concrete examples and a
  one-tap "DCA into $THREE" starter), draft, armed, paused, executing, error
  (actionable — e.g. "blocked by daily limit, raise it or wait"), killed.
- **Owner-only**: the entire surface is owner-gated; visitors/logged-out never see
  strategy controls or the action trail (they may see a tasteful, opt-in public
  "this agent is autonomously active" badge with **no** amounts — owner choice).
- **Trust UI**: always show the guardrails in context (this strategy can spend at most
  X/day, capped by your limits), a clear next-action preview, and the kill switch
  pinned. Simulate/dry-run before arming where possible.
- **Microinteractions/a11y/responsive/perf** per README; the action history paginates
  from the real ledger; no fake numbers ever.

## Edge cases

RPC/price failure (skip safely, log, retry — never act on stale/garbage data) ·
insufficient funds · limit hit mid-run · frozen/kill mid-run (must stop) · overlapping
strategies competing for budget · worker restart mid-action (idempotency) · clock/cron
drift · a strategy that would violate the allowlist · owner lowers limits below an
armed strategy's needs (pause + notify).

## Definition of done

Meets the README DoD, plus: at least DCA-into-$THREE and a take-profit ladder run
**for real** on a funded test agent (devnet acceptable where mainnet is unsafe to
demo, but the code path is the real one), every action appears in the real custody
trail with a signature, all guards demonstrably block over-limit actions, the kill
switch halts instantly, and no non-owner can see or touch any of it.

## Then: improve, then delete this file

Push it: a strategy "backtest from the agent's own real history," shareable
(amount-free) strategy templates, or notifying the owner via the existing notifier
when an action lands. Update `data/changelog.json`. **Then delete this prompt file.**
</content>
