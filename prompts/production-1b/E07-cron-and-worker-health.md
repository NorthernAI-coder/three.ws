# E07 — Cron + worker health: execution history, SLA, dashboard

> Phase E · Depends on: E02 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
~20 crons and ~18 worker pipelines run the platform's background work — buybacks,
reflections, holder snapshots, oracle scoring, smart-money rollups, auto-rig sweeps. If one
silently stops, the failure is invisible until a user notices. Make every scheduled job
observable, with history and "didn't run" detection.

## Where this lives (real files)
- `api/cron/` — `[name].js` dispatcher + ~20 jobs (forge-smoke, three-holders-snapshot, rewards-distribute, oracle-*, smart-money-*, auto-rig-sweep, quota-check, relayer-balance-check, etc.).
- `workers/` — oracle, agent-sniper, model-*, avatar-reconstruction, unirig, etc.
- `vercel.json` — cron schedules.

## Build this
1. **Execution ledger:** a `cron_executions` table recording each run (job, started/finished, status, summary, error). Wrap the cron dispatcher so every job auto-records — no per-cron boilerplate.
2. **Missed-run detection:** know each job's expected cadence; alert (E02) if a job hasn't run within ~1.5× its interval ("buyback cron hasn't run in 18h").
3. **Worker health:** workers report heartbeat/health + errors to a shared place (DB or metrics) so a dead worker is visible; failures propagate to ops, not just local logs.
4. **Dashboard:** an admin view (or extend the status page E03) showing each job's last run, status, and 7-day history.
5. **Money-job priority:** buyback/reflection/holder-snapshot/relayer-balance crons are treated as critical (loud alerts on failure or miss).

## Out of scope
- The job logic itself (covered in A01/A02/A04/D01).

## Definition of done
- [ ] Every cron auto-records to `cron_executions`; missed-run detection alerts on critical jobs.
- [ ] Workers report health; a dead worker is detectable + alerts.
- [ ] Dashboard shows last run + 7-day history per job; `npx vitest run` green.
- [ ] Changelog entry (infra); committed + pushed to both remotes.

## Verify
- Disable a critical cron's schedule → missed-run alert fires after the window; kill a worker → health flags it.
