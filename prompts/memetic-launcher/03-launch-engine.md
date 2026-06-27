# 03 · Launch Engine

## Mission
Fire launches **autonomously on a cadence**, exactly like the tips circulation engine —
pick a coin, pick an agent, fund it, let the agent sign its own pump.fun create, record
everything, advance the rotation. Bounded by hard caps and a circuit breaker. Never throws.

## Context
- Engine: `api/_lib/launcher-engine.js` → `runLauncherTick()`. Mirrors `runCirculationTick()`.
- Cron: `api/cron/launcher-tick.js` (CRON_SECRET-gated), scheduled `* * * * *` in `vercel.json`.
- Schema (migration `20260629060000_coin_launcher.sql`, also self-ensured in the engine):
  - `launcher_config` — one `global` row + one per `user`; the master switches + economics.
  - `launcher_queue` — the agent rotation (oldest-launched first, weighted).
  - `launcher_runs` — append-only audit; every attempt, status, cost, mint.
- Funding: `api/_lib/launcher-funding.js` (`masterBalanceSol`, `dailySpentSol`, `fundAgentForLaunch`).
- The mint itself reuses the real human path: `POST /api/pump?action=build-metadata` then
  `?action=launch-agent` via an authenticated session as the agent's owner (`postAs`).

## The tick (per enabled scope)
1. **Gate** — skip if `paused` (breaker) or `mode='off'`.
2. **Cadence** — skip unless `target_cadence_seconds` elapsed since the last real attempt.
3. **Hourly cap** — skip if `max_per_hour` reached in the trailing hour.
4. **Daily SOL cap** — compute remaining `daily_sol_cap`; skip if exhausted (real runs only).
5. **Rotation** — `ensureQueue` (auto-enrol avatar-bearing pool agents) → `pickAgent`
   (least-recently-used, weighted, must have avatar + wallet).
6. **Coin** — `pickSource({mode, network, categories, sources})` (narrative-driven).
7. **Record** — insert a `pending` `launcher_runs` row.
8. **dry_run?** → mark `dry_run`, bump rotation, stop (zero SOL moved).
9. **Master balance** — if below `per_launch_sol + buffer`, record `skipped` (recoverable wait).
10. **Fund** — `fundAgentForLaunch` master→agent (per-launch + daily caps) → `funded`.
11. **Launch** — agent signs its own create → `confirmed` with `mint` + `tx_signature`;
    bump `launcher_queue.last_launched_at` + `launch_count`.
12. **Failure** — `failed` + error; advance rotation anyway (no wedging); trip the breaker
    after `FAIL_BREAK` consecutive failures.

## Arming (operator)
- Default global row is `enabled=false, dry_run=true` — provably inert.
- Required env: `CRON_SECRET`; a master wallet (`LAUNCHER_MASTER_SECRET_KEY_B64`, falling back
  to `PUMP_X402_LAUNCHER_SECRET_KEY_B64`); LLM keys for trend/meme modes (else random filler).
- Arm sequence: set `mode`, `sources`, economics → run in `dry_run` and watch `launcher_runs`
  → flip `dry_run=false` with conservative caps → raise `max_per_hour` / lower cadence to scale.

## Tasks (to finish / harden)
1. **Apply the migration** (`20260629060000_coin_launcher.sql`) in every env; the engine also
   self-ensures the schema so it runs pre-migration.
2. **Enrol/curate the rotation** — global draws from the circulation pool; expose weighting so
   higher-performing avatars launch more often.
3. **Confirm-on-chain** — optionally poll the mint/signature to upgrade `launched`→`confirmed`
   only after on-chain finality (today the launch-agent response is trusted).
4. **Tune cadence/caps for #1-deployer scale** — once stable, push cadence down and
   `max_per_hour` up within the daily SOL ceiling.

## Acceptance
- With no enabled config, a tick is a no-op (`note: 'no enabled launcher config'`).
- In `dry_run`, ticks select coin+agent and write `dry_run` rows; **zero** SOL moves.
- Armed, a tick funds an agent and produces a real mint recorded in `launcher_runs` and
  surfaced in `/launches` + the money feed; caps and breaker observably hold.
- The tick never throws; every scope is isolated and every outcome recorded.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. Real APIs only. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. `vercel.json`/migrations are deploy-time. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
