# Task: Sniper arming UI + live positions / PnL dashboard

## Context

Every sniper API exists and reads real data, but there is no UI to arm a strategy
or watch it work:

- `POST /api/sniper/strategy` — arm/upsert a strategy (budget, filters, exits);
  `GET` lists strategies + live position summary (`api/sniper/strategy.js`).
- `GET /api/sniper/history` — closed trades with realized PnL (`history.js`).
- `GET /api/sniper/stream` — live SSE of buy/sell/position updates (`stream.js`).
- `GET /api/sniper/leaderboard` — realized-PnL ranking (`leaderboard.js`).
- `GET /api/sniper/trader` — agent's public trader profile/stats (`trader.js`).
- Schema: `api/_lib/migrations/20260615020000_agent_sniper.sql` (strategies +
  positions ledger with entry/exit PnL).
- The worker that consumes the armed strategy is deployed in task 05.

This task builds the **Snipe** tab of the wallet hub (shell from task 01): arm a
strategy on a funded agent wallet, then watch live positions and PnL — to the
`CLAUDE.md` UX bar.

## Goal

The owner can arm, edit, pause, and disarm a sniper strategy from the UI
(entry trigger, budget, per-trade size, filters, exit rules), then watch live
positions stream in with realized/unrealized PnL — backed entirely by the existing
APIs and the deployed worker.

## Files to Read First

- `api/sniper/strategy.js` — strategy GET/POST shape, validation, position summary
- `api/sniper/stream.js` — SSE event shape (buy/sell/update) for the live view
- `api/sniper/history.js`, `api/sniper/leaderboard.js`, `api/sniper/trader.js`
- `api/_lib/migrations/20260615020000_agent_sniper.sql` — strategy fields + exit
  knobs (stop-loss, trailing-stop, take-profit, timeout), entry triggers
  (`new_mint`, `first_claim`, `intel_confirmed`), `min_oracle_score`
- `workers/agent-sniper/scorer.js:21`, `claim-scorer.js`, `oracle-gate.js:33` — what
  each filter actually does, so the form labels/help match real behavior
- Task 01 hub shell (Snipe tab), task 02 deposit (link when budget > balance)
- `vercel.json` (~lines 1998-2027) — confirm the sniper routes are wired

## What to Build / Do

1. **Strategy arming form** in the hub Snipe tab:
   - Entry trigger selector (`new_mint` / `first_claim` / `intel_confirmed`) with
     plain-language help for each (drawn from the real scorer behavior).
   - Budget controls: total daily budget, per-trade size, max concurrent positions
     — shown against the agent's real wallet balance (warn / link to deposit if the
     budget exceeds funds).
   - Scoring filters that map to the real scorer knobs (market-cap bands, creator
     history, socials required, optional `min_oracle_score`).
   - Exit rules: stop-loss, trailing-stop, take-profit, timeout.
   - Simulate vs live toggle (honoring the worker's `SNIPER_MODE` gating from task
     05); arm in paper mode first by default.
   - Arm / Pause / Disarm actions via `POST /api/sniper/strategy`.
2. **Live positions + PnL dashboard**: subscribe to `GET /api/sniper/stream` (SSE)
   for real-time buy/sell/position updates; show open positions (entry, current
   quote, unrealized PnL, exit reason when it fires) and closed trades from
   `history.js` with realized PnL. Aggregate stats (win rate, realized PnL, best/
   worst). Reconnect the SSE on drop.
3. **Trader profile + leaderboard surfacing**: render the agent's `trader.js`
   profile and a link into `leaderboard.js` so a sniping agent has a public,
   shareable track record (ties into reputation surfaces).
4. **States**: not-armed (clear CTA explaining what arming does + funding
   prerequisite), armed-but-no-fills-yet (waiting), active (live positions), paused,
   error (strategy validation errors from the API surfaced inline; SSE-disconnected
   banner with auto-retry). Underfunded → link to the deposit panel (task 02).

## Constraints

- Drive everything off the real APIs and the deployed worker — no fabricated
  positions, no fake PnL, no simulated stream. The SSE view reflects real worker
  events; before the worker is live in an env, the empty/waiting state is honest.
- Validation errors from `POST /api/sniper/strategy` surface inline and actionable;
  never a raw error or silent no-op. Don't let a user arm a live strategy with a
  budget exceeding the wallet balance without a clear warning.
- Owner-only writes; a visitor may view the public trader profile/leaderboard but
  not arming controls.
- Mobile-responsive (320/768/1440), keyboard-operable, ARIA, focus rings, designed
  empty/loading/error states. SSE handled with backoff + visible reconnect state.

## Success Criteria

- `npm run dev`: arm a strategy in simulate on a funded agent, see it persist via
  `GET /api/sniper/strategy`; with the worker running (task 05), watch real
  scored-launch activity stream into the positions view.
- Edit / pause / disarm all work and reflect immediately.
- Closed trades show realized PnL from `history.js`; aggregate stats compute from
  real data; the trader profile + leaderboard render.
- Every state (not-armed, waiting, active, paused, validation-error,
  SSE-disconnected, underfunded) renders and looks premium.
- Zero console errors/warnings. `npm run typecheck` + `npm test` clean.
- Changelog entry (tag: feature). Run the **completionist** subagent on changed files.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/agent-wallet-trading/06-sniper-arming-ui.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
