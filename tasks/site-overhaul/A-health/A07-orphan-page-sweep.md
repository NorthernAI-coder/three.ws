# A07 — Orphaned & duplicate page sweep

**Track:** Health · **Size:** M · **Priority:** P2 · **Depends on:** A06

## Goal
Inventory every `pages/` and `public/*.html` file, classify each as **live / orphaned /
duplicate**, then route, redirect, or delete. Shrink the surface to what's actually reachable
and maintained.

## Why it matters
The route audit found 200+ routes with many dangling pages (`deal.html`, `embed-test.html`,
`pump-coin-page.html`, `pump-3d-agent.html`, `pumpfun-{buy,counter,search,trending,widget}.html`,
duplicate dashboard trees). Dead pages rot, drift from the design system, and confuse search.

## Context
- Cross-reference each HTML file against `vite.config.js` and `vercel.json` route definitions to find files with no route, and routes with no file.
- Some "orphans" are intentional partials/components (e.g. `gallery-picker.html`) — confirm before deleting.

## Scope
- Produce a short classification table (live / orphan / duplicate / partial) committed as `tasks/site-overhaul/A-health/ORPHAN-REPORT.md`.
- For each orphan: delete the file + any stale route, OR wire a real route if it's a feature that should be live, OR mark it a partial with a comment.
- Consolidate duplicate dashboards (`pages/dashboard/*` vs `pages/dashboard-next/*` vs `public/dashboard-classic/*`) — keep one canonical, redirect the rest (coordinate with E06).

## Out of scope
- Home variants (A06 owns those).

## Definition of done
- Every HTML file is either reachable via a real route or intentionally removed. No route points at a missing file (404). The classification report is committed.

## Verify
- A script/grep confirms no `vercel.json` route targets a non-existent file and no shipped `pages/*.html` is unreachable. Spot-check former orphan URLs return a real page or a clean redirect.
