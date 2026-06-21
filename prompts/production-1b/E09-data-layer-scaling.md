# E09 — Data layer: read-replica routing, partitioning, backup/restore drills

> Phase E · Depends on: E06 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Postgres (Neon) is a single point of failure: all reads hit the primary, high-growth tables
grow unbounded, leaderboards recompute on every request, and there's no proven restore path.
Make the data layer ready to scale and recoverable.

## Where this lives (real files)
- `api/_lib/db.js` — single Neon `DATABASE_URL`, HTTP driver; `api/_lib/db-retry.js`.
- High-write tables: `agent_actions`, `agent_revenue_events`, world events, x402 settlements.
- Hot read aggregations: leaderboards, holder stats, analytics.

## Build this
1. **Read-replica routing:** route heavy, non-critical reads (leaderboards, profiles, analytics) to a Neon read replica when configured, with fall-back to primary if the replica lags > threshold. Keep money/consistency-critical reads on primary.
2. **Materialize hot aggregates:** precompute leaderboard/stat aggregates (materialized views or a rollup table refreshed by cron) so hot reads don't recompute over the whole table each request.
3. **Partition/retention:** for unbounded tables, add time-partitioning or a retention/archival policy so they don't degrade over time; index review on the hottest queries.
4. **Backup/restore drill:** document RTO/RPO; add a periodic job (or runbook) that restores a backup to a scratch DB and runs smoke checks; alert if the last backup is stale.
5. **Connection discipline:** confirm the singleton HTTP driver usage avoids connection blowups under serverless fan-out.

## Out of scope
- Migration mechanics (**E06**) — build on it.

## Definition of done
- [ ] Heavy reads route to a replica (when configured) with lag-aware fallback; money reads stay on primary.
- [ ] Hot aggregates are materialized/rolled up; hottest queries indexed.
- [ ] Unbounded tables have partitioning/retention; backup/restore drill documented + a stale-backup alert exists.
- [ ] `npx vitest run` green; changelog entry (infra); committed + pushed to both remotes.

## Verify
- With a replica configured, confirm leaderboard reads hit it and fall back when lagged; run the restore drill to a scratch DB.
