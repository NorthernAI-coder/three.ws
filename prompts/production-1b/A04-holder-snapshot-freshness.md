# A04 — Holder snapshot freshness, reconciliation & alerting

> Phase A · Depends on: none · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
Holder counts, tiers, reflections eligibility, the leaderboard, and the OG share card all
read from one $THREE holder snapshot. If that snapshot goes stale (Helius/DAS rate-limited
or the cron stalls), every downstream number silently drifts and reflections could pay the
wrong set. Make the snapshot self-healing, observable, and never silently stale.

## Where this lives (real files)
- `api/_lib/coin/three-holders.js` — cached read/write layer; `threeHolderBalances()`, `threeHolderCount()`, `readThreeHolderSnapshot()` (30-min staleness gate), cold-fallback scan with cross-instance lock.
- `api/cron/three-holders-snapshot.js` — the 5-minute refresh cron (single DAS scan).
- `api/_lib/coin/holders.js` — full Helius DAS walk.
- `api/three-token/[action].js` — `/stats` (holders) and `/leaderboard` consume the snapshot.

## Current state & gaps
- A single DAS scan per cron tick; if it fails or is throttled, the snapshot stales with no alert.
- Public reads fall back to a cold scan (expensive) but nothing signals that the snapshot is degraded.
- No public freshness signal (age of snapshot) and no operator alert past the 30-min gate.
- Reconciliation between `holder_count` (meta) and actual ranked rows is assumed, not verified.

## Build this
1. **Resilient cron:** wrap the DAS scan in retry-with-backoff; on a zero/short result, refuse to overwrite a good snapshot (the code already guards the wipe — keep and test it) and alert ops.
2. **Freshness signal:** add `GET /api/three-token/holder-snapshot-status` returning snapshot age, holder_count, and `fresh|stale|cold`. Surface a subtle "holders as of Xm ago" on the leaderboard.
3. **Alerting:** if the snapshot exceeds the staleness threshold (e.g. >30m) or the cron fails N times, fire an ops alert (`api/_lib/alerts.js`) once per incident with recovery announcement.
4. **Reconciliation check:** a lightweight assertion (in the cron and a test) that `meta.holder_count` equals the count of rows with balance > 0, and that treasury/AMM/LP wallets are flagged so A02/A03 can exclude them.
5. **Cost control:** confirm the cold-fallback stampede guard (cross-instance lock + in-process single-flight) holds under concurrent reads; add a test.

## Out of scope
- Reflections execution (**A02**) and tier logic (**A03**) — this only guarantees the data they read.

## Definition of done
- [ ] Snapshot cron retries, never wipes on a bad scan, and alerts on failure + recovery.
- [ ] Freshness endpoint live; leaderboard shows snapshot age.
- [ ] Reconciliation assertion passes; treasury/AMM wallets flagged for exclusion.
- [ ] Stampede guard tested under concurrency; `npx vitest run` green.
- [ ] Changelog entry; committed + pushed to both remotes.

## Verify
- Simulate a failed scan (mock DAS error) → snapshot preserved + alert fired.
- `curl …/api/three-token/holder-snapshot-status` returns a sane age + count.
