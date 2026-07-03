# Economy heartbeat (external cron failover)

Every scheduled job on the platform — the circulation engine tick, the x402
seed and autonomous loops, treasury top-ups, payouts, sweeps, reconciliation —
is a Vercel Cron entry in `vercel.json` calling an authed `/api/cron/*`
endpoint. That makes Vercel's scheduler a single point of failure: if the
Vercel project stops firing crons (account block, paused project, migration),
every money rail halts at once while the deployed site keeps serving traffic.
That exact failure happened on 2026-06-29 and flatlined the Money Pulse.

The heartbeat removes that single point of failure. It is a second, independent
scheduler that drives the same endpoints on the same schedules from GitHub
Actions.

## Pieces

| Piece | Path |
| --- | --- |
| Scheduler script | `scripts/economy-heartbeat.mjs` |
| GitHub Actions workflow | `.github/workflows/economy-heartbeat.yml` |
| Schedule source of truth | the `crons` array in `vercel.json` (never duplicated) |

The script reads `vercel.json`, wakes at each UTC minute boundary for
`DURATION_MINUTES` (default 5), and fires every cron whose schedule matches
that minute — concurrently, with the same `Authorization: Bearer $CRON_SECRET`
header Vercel sends. The workflow runs it every 5 minutes with queued,
never-cancelled runs, so minute-level crons (`x402-seed-cron`) still tick every
minute despite GitHub's 5-minute scheduler floor.

## Activation

One step: add the repo secret `CRON_SECRET` (Settings → Secrets and variables →
Actions) with the same value as the `CRON_SECRET` env var on the Vercel
project. Until the secret exists, every run exits idle with a warning and
touches nothing.

## Safety properties

- **No new money paths.** The heartbeat only calls the same authed cron
  endpoints Vercel calls. All spend caps, registry allowlists, and ledger
  recording live server-side and apply identically.
- **Double-scheduling is harmless.** While Vercel crons are healthy the
  endpoints simply tick more often; every engine enforces per-tick and daily
  caps, so leave the heartbeat enabled permanently as insurance.
- **Undeployed endpoints are tolerated.** A cron present in the repo's
  `vercel.json` but missing from the deployed build reports `missing 404` and
  never fails the run.
- **Loud on real outage.** A run fails only when every attempted call fails —
  bad secret or site down — so a red workflow means a genuine problem.

## Manual runs

```bash
# One-off from anywhere (also how the workflow_dispatch trigger works):
CRON_SECRET=… node scripts/economy-heartbeat.mjs

# Longer run, economy rails only:
CRON_SECRET=… DURATION_MINUTES=10 ONLY='pulse|x402|treasury|economy' node scripts/economy-heartbeat.mjs
```

## Caveats

- GitHub's scheduler is best-effort; runs can start several minutes late under
  load. High-frequency crons self-heal on the next window, but a cron pinned to
  one exact minute per day (e.g. `45 9 * * *`) can miss its minute on a badly
  delayed run — fire it via `workflow_dispatch` with an `only` filter if it
  matters that day.
- The heartbeat is a failover, not the fix. When Vercel cron scheduling is
  down, restore it — the platform's primary scheduler should be the deploy
  target itself.

Related: [circulation engine](circulation-engine.md) ·
[economy funding root](economy-master.md) · [money map](money-map.md)
