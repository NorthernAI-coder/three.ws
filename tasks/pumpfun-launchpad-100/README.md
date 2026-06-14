# Pump.fun Launchpad → 100% — Completion Plan

**Goal:** Take the three.ws pump.fun launchpad for 3D AI agents from ~88% complete to
genuinely production-complete: every path wired, every state designed, USDC fully
first-class, autonomous lanes finished, and the whole launch→trade→graduate→earn
loop proven end-to-end on devnet against real on-chain state.

This is not a rewrite. The launchpad is already large and mostly real:

- **Backend:** `api/pump/[action].js` (47 actions), `api/pump/*.js`, `api/_lib/pump*.js`,
  PumpPortal WS feed, Helius webhook, 3 crons, 12 Postgres tables. Launch / buy / sell /
  accept-payment / fee-sharing / buyback / distribute are all implemented and signed
  end-to-end (custodial + wallet).
- **Frontend:** launch modal (4 steps, vanity grind, share card), `/launches` feed,
  `/pump-live`, `/pump-dashboard`, `/pump-visualizer`, `/pumpfun`, Launchpad Studio,
  agent-profile token widget, buy/sell/governance/withdraw modals.
- **SDKs/skills:** forked `@three-ws/agent-payments`, `pumpfun-mcp`, five pump-fun skills,
  vendored program docs + IDLs, v2 trade-instruction audit (7 gaps found and fixed 2026-06-11).

## What is actually missing (verified, not speculative)

The 2026-06-11 v2 audit (`docs/pumpfun-program/AUDIT-2026-06-11.md`) closed the correctness
gaps but explicitly deferred **productization of USDC-paired coins**. That, plus a few
unfinished autonomous lanes and the absence of an end-to-end proof, is the real gap list:

| # | Gap | Evidence |
|---|-----|----------|
| 01 | `pump_agent_trades` is SOL-only (`sol_amount` lamports, no `quote_mint`/`quote_amount`); USDC trades record garbage | `api/_lib/migrations/2026-04-29-pump-trades.sql:17`; audit "remaining productization" |
| 02 | Buy/sell widget is SOL-only — no USDC denomination UI | `src/game/coin-buy.js` (0 USDC refs); audit |
| 03 | Custodial (agent-signed) trading has no USDC flag | audit "custodial USDC trading flag" |
| 04 | Alert rules live in browser `localStorage`, no server persistence / cross-device / real webhook delivery | `tasks/pump-dashboard-real-apis/12-alerts-server-persist.md` (OPEN) |
| 05 | `pumpfun-signals` cron is a skeleton — rule evaluation incomplete | backend inventory |
| 06 | `strategy-validate` is syntax-only; no semantic validation | backend inventory |
| 07 | No automated end-to-end launch→buy→sell proof on devnet | `tasks/devnet-smoke-trade.md` empty; memory note "awaits funded signer" |
| 08 | `PUMPFUN_BOT_URL` graduations feed not deployed/wired in prod | `tasks/wire-pumpfun-bot-url.md` empty; falls back to `pf:graduations` Redis |
| 09 | No browser E2E coverage of the launch flow; generic error copy; graduation visual transition untraced | frontend inventory "Gaps" |
| 10 | Launchpad-wide Definition-of-Done sweep (empty/error/loading states, a11y, dead paths) never run as one pass | CLAUDE.md DoD |

## Execution order

These are written to run **independently and in parallel** where possible (concurrent agents
share one worktree — stage explicit paths, never `git add -A`). Hard dependencies:

```
01 (trades schema + quote columns)  ──┬─→ 02 (USDC buy/sell UI)
                                      ├─→ 03 (custodial USDC)
                                      └─→ portfolio subtotals (folded into 01)

04 (alerts persistence) ── independent
05 (signals cron)       ── independent
06 (strategy-validate)  ── independent
08 (pumpfun bot url)    ── independent, unblocks richer graduation data
07 (devnet smoke)       ── run LAST; proves 01–03 + launch flow on-chain
09 (browser E2E)        ── run after 02 lands the USDC UI
10 (DoD sweep)          ── run LAST, after 01–09, as the final audit gate
```

**Recommended sequence:** 01 → (02, 03, 04, 05, 06, 08 in parallel) → 07 → 09 → 10.

## Task files

- [01-usdc-trade-recording.md](01-usdc-trade-recording.md) — quote-aware trade schema + portfolio subtotals
- [02-usdc-buy-sell-ui.md](02-usdc-buy-sell-ui.md) — USDC denomination in the trade widget
- [03-custodial-usdc-trading.md](03-custodial-usdc-trading.md) — agent-signed USDC buys/sells
- [04-alerts-server-persistence.md](04-alerts-server-persistence.md) — server-side alert rules + webhook delivery
- [05-pumpfun-signals-cron.md](05-pumpfun-signals-cron.md) — finish signal rule evaluation
- [06-strategy-validate-semantic.md](06-strategy-validate-semantic.md) — real strategy validation
- [07-devnet-smoke-trade.md](07-devnet-smoke-trade.md) — end-to-end launch→buy→sell proof
- [08-wire-pumpfun-bot-url.md](08-wire-pumpfun-bot-url.md) — deploy + wire the graduations feed
- [09-launch-flow-e2e.md](09-launch-flow-e2e.md) — Playwright coverage of the launch flow
- [10-definition-of-done-sweep.md](10-definition-of-done-sweep.md) — final launchpad DoD audit

## Global rules for every task

1. **No mocks, no fake data, no placeholders.** Real Solana RPC, real pump SDKs, real DB.
   `$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) or a clearly-synthetic
   `THREEsynthetic1111…` placeholder are the **only** mints allowed in code/tests/fixtures.
2. **End-to-end or not at all.** A column added must be written by every INSERT site and read
   by every consumer. A UI toggle must reach a signed, broadcast, confirmed transaction.
3. **Every state designed:** loading (skeleton), empty (tells user what to do), error
   (actionable), populated, overflow.
4. **Changelog:** any user-visible change appends to `data/changelog.json` (tags: feature /
   improvement / fix / sdk / infra / security), then `npm run build:pages`.
5. **Verify before done:** run `npm test`, exercise the surface in a real browser / against a
   real RPC, review `git diff` line-by-line. State explicitly what you verified.
6. **Watch the traps:** `npx vercel build` clobbers `api/*.js` (check `head -1` for `__defProp`);
   stage explicit paths; pull only from `threews`, never `threeD`.
