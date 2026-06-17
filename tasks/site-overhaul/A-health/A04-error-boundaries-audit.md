# A04 — Network & input error-boundary audit

**Track:** Health · **Size:** M · **Priority:** P1 · **Depends on:** A02 (overlaps; coordinate)

## Goal
Every network call and user-input handler that can fail must fail *into a designed state*, not a
blank screen or a console error. Establish boundaries at the edges, consistently.

## Why it matters
`CLAUDE.md`: "Errors handled at boundaries (network, user input)." The UX audit found pages that
go blank or silently fail on fetch errors — that's invisible breakage for users.

## Context
- The app is vanilla JS; there's no React error boundary. Boundaries are manual `try/catch` around `fetch`/`await` at handler level.
- A reusable error/empty/loading state treatment should come from Track B's shared components once they exist — coordinate so you're not inventing a one-off.
- ~324 `console.error/warn` calls exist; many mark spots where a user-facing state is missing.

## Scope
- Inventory `fetch(`/`await`-in-handler sites in `src/` that render user-facing data. For each, ensure: a loading state, a catch that renders an **actionable** error ("Couldn't load X — retry"), and an empty state.
- Prioritize the high-traffic surfaces: home, `/discover`, `/marketplace`, `/dashboard`, agent detail, `/create`.
- Standardize a small helper (e.g. `src/shared/async-state.js`) if one doesn't exist, so every surface uses the same loading/error/empty pattern.

## Out of scope
- Rewriting the data sources; just add boundaries + states.

## Definition of done
- The prioritized surfaces show designed loading/empty/error states; a forced network failure (DevTools offline) never yields a blank page or an unhandled rejection.

## Verify
- `npm run dev`; toggle DevTools "Offline" and reload each prioritized surface — each shows a retryable error, not a void.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/A-health/A04-error-boundaries-audit.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
