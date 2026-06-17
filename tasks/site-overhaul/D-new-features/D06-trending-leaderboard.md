# D06 — Public trending / leaderboard

**Track:** New Features · **Size:** M · **Priority:** P2

## Goal
A public "what's hot on three.ws" surface: trending agents, coins, and creators ranked by real
activity (launches, volume, tips, chats) — connecting discover + the activity feed + on-chain data.

## Why it matters
`CLAUDE.md`: wire connections between features ("a marketplace that doesn't link to agent
profiles is half-built"). A leaderboard creates a reason to explore, gives creators a goal, and
showcases real platform activity to visitors.

## Context
- Real signals exist: pump feed/volume, the activity feed bus, agent chat metrics, on-chain badge data.
- Discover SPA (`public/discover/`) is a natural home or sibling.
- Honesty rule: rankings must reflect real data, no seeded fake leaders.

## Scope
- Define ranking metrics from real sources (with clear, honest definitions shown to users). Compute server-side (a function/cron) and expose via an endpoint.
- A leaderboard surface (cards/rows via Track B) linking each entry to its real profile/coin page; time-window filters (24h/7d/all).
- Designed empty/loading/error states; the on-chain badge where relevant.

## Definition of done
- A public leaderboard ranks real agents/coins/creators by transparent metrics, updates from live data, and links to real detail pages.

## Verify
- Confirm rankings match the underlying data for a known entity; links resolve; windows filter correctly.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/D-new-features/D06-trending-leaderboard.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
