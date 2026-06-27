# 04 · Creator Rewards & Reinvest

## Mission
Close the money loop. Launching is only half the game — the revenue is in **pump.fun
creator rewards**. Each launching agent must claim its accrued fees on a schedule, route a
configurable share into **$THREE buyback-and-burn**, and reinvest the rest to fund the next
wave of launches. This is what turns "we deploy a lot" into "we make a lot."

## Context
- Per-launch coin records: `agent_launched_coins` (per-agent launcher) and `launcher_runs`
  (global engine) — both carry the `mint` and the launching `agent_id`.
- An auto-claimer already exists for the per-agent path: `workers/agent-sniper/auto-claimer.js`.
- Claim plumbing: `api/_lib/pump-claims.js`; the pump action surface in `api/pump/[action].js`.
- `launcher_config.buyback_bps` (0–10000) = the share of fees routed to $THREE buyback.
- Per-agent config also has `auto_claim_enabled`, `auto_claim_threshold_sol`,
  `auto_claim_reinvest_pct`.

## The loop (per launching agent, on a cadence)
1. **Detect claimable** — query accrued creator rewards for each of the agent's live mints.
2. **Threshold** — only claim once accrued ≥ `auto_claim_threshold_sol` (avoid dust + fees).
3. **Claim** — the agent signs its own claim (same identity that created the coin).
4. **Split** — route `buyback_bps` into $THREE buyback-and-burn (real swap, real burn);
   keep the remainder.
5. **Reinvest** — return `reinvest_pct` of the kept SOL to the launcher master so it funds
   the next launches; the rest accrues to the agent's wallet as earnings.
6. **Record** — log the claim, the buyback signature, and the reinvest transfer so the
   console shows realized revenue, not just launch counts.

## Tasks
1. **Global-engine claimer** — extend/clone the auto-claimer to walk `launcher_runs` mints for
   the global scope (not just `agent_launched_coins`), honouring `buyback_bps`.
2. **$THREE buyback wiring** — execute the buyback through the platform's real trade/burn path
   (never a mock); record the burn tx. $THREE only — never any other mint.
3. **Reinvest transfer** — agent → master top-up so the launcher is self-funding at steady
   state; expose `reinvest_pct` in config.
4. **Revenue accounting** — a rollup of claimed SOL, $THREE bought/burned, and net agent
   earnings per day, surfaced in the admin console (prompt 05).
5. **Safety** — claims/buybacks are real money; reuse the spend-cap/firewall guards and the
   same circuit-breaker discipline as the launch engine.

## Acceptance
- Live mints with accrued rewards above threshold get claimed automatically by the owning agent.
- `buyback_bps` of claimed fees is provably swapped into $THREE and burned (real signatures).
- Reinvest tops the master back up; the loop is self-sustaining under steady launching.
- The console shows realized revenue (claimed SOL, $THREE burned, net earnings), all from real
  on-chain data — no estimates presented as fact.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. Real APIs only. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — buyback-and-burn is $THREE and nothing else. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
