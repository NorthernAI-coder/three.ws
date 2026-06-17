# Task 40 — Walk Analytics: Per-Creator Dashboard for Embedded Avatars

## Priority: MEDIUM

## Objective
Give creators who embed walking avatars on their sites a real analytics dashboard: how many sessions, time spent, distance walked, conversion events, top embed locations. Mirrors what Stripe Dashboard or Plausible offers, scoped to a creator's avatars.

## Scope
- Backend:
  - Extend `POST /api/walk/metrics` (task 39) to also accept `{ avatarId, embedOrigin, eventName?, value? }`
  - `embedOrigin` is the `referrer` header of the embed iframe — recorded server-side, not trusted from client
  - `eventName` is creator-defined ("subscribe", "buy", "play") — fired via the embed SDK API: `window.ThreeWalkAvatar.track('subscribe', { plan: 'pro' })`
  - New endpoint `GET /api/walk/analytics?avatarId=<id>&from=<iso>&to=<iso>` — aggregated metrics
- Frontend dashboard page: `pages/walk-analytics.html`
  - Avatar selector (creator's avatars)
  - Date range picker
  - Cards: Total sessions, Avg session duration, Total distance walked, Unique sites embedded on
  - Time-series chart (use Apache ECharts or D3 — vendored)
  - Top-10 origins table
  - Events table (eventName, count, conversion-rate vs sessions)
- Auth-gated: only the creator who owns the avatar can view its analytics

## Definition of Done
- Embed an avatar on a test site → sessions show up in dashboard within 60s
- Fire `track('subscribe')` from the test site → event appears in dashboard
- Date range picker correctly filters
- Auth check: another user cannot view your analytics (verify with real second account)
- No console errors

## Rules
Complete 100%. No stubs. No fake data. Real metrics pipeline, real auth check, real charts. Wire end-to-end.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/walk/40-walk-analytics-dashboard.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
