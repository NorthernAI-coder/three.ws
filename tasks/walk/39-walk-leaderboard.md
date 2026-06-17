# Task 39 — Walk Leaderboard: Distance Walked, Sites Visited, Sessions

## Priority: LOW

## Objective
Track per-user walk metrics (distance walked, time spent walking, environments visited, sites visited via extension) and surface a public leaderboard. Adds a gamification layer that drives daily return visits.

## Scope
- Backend:
  - New endpoint `POST /api/walk/metrics` — accepts batched metric increments: `{ distanceMeters, durationSec, envId, siteHostname }`
  - New endpoint `GET /api/walk/leaderboard?period=daily|weekly|all-time&metric=distance|sites|time`
  - Backed by the existing user DB; new tables/columns as needed (real migration in `migrations/`)
- Client:
  - In `src/walk.js`, accumulate distance per frame (delta position magnitude) and total session duration
  - Flush metrics every 60s via `navigator.sendBeacon` to `/api/walk/metrics`
  - Chrome extension (`content.js`) also flushes site visit + walk duration when avatar is active on a host
- Leaderboard page: `pages/walk-leaderboard.html`
  - Tabs: Today | This Week | All Time
  - Metric switcher: Distance | Sites | Time
  - Table: rank, avatar (clickable to profile), handle, value, change-from-yesterday delta
  - User's own rank is sticky-pinned even if outside top 50
- Achievements (simple): "1 km walked", "10 sites visited", "Walked in all 6 environments" — surfaced as toast on unlock; stored on user

## Definition of Done
- Walk for 1 minute → metrics appear in DB
- Leaderboard page renders real data, sorted correctly
- Achievement toast fires when threshold crossed
- No console errors
- Endpoints return correct shape and pagination

## Rules
Complete 100%. No stubs. No fake data. Real DB schema, real metrics, real leaderboard. Wire end-to-end.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/walk/39-walk-leaderboard.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
