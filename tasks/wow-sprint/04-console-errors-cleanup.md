# Task: Zero console errors & warnings across key pages

Ship-quality apps have a clean console. Drive the real app and eliminate every
error and warning that originates from our code.

## Scope
Run `npm run dev` (port 3000) and exercise these routes in a real browser:
`/`, `/marketplace`, `/agent-home`, `/dashboard`, `/pump-dashboard`,
`/pricing`, `/skills`, `/walk`, `/club`.

## Method
1. Open each route, watch the console and network tab through a normal interaction (load, scroll, click primary CTAs).
2. Catalogue every error and warning. For each, find the source `file:line`.
3. Fix the root cause, not the symptom:
   - Failed `fetch` → handle the boundary, fix the endpoint path, or add the missing param. Real API only.
   - Undefined variable / null deref → guard correctly or fix the data flow.
   - Three.js warnings (deprecated APIs, missing textures, NaN geometry) → update to current API, fix the asset path.
   - 404s on assets → fix the path or add the asset under `public/`.
   - Hydration/duplicate-id/invalid-nesting HTML warnings → fix the markup.
4. Ignore warnings that provably originate from third-party libs you can't change — but list them.

## Constraints
- Do not silence errors by wrapping in empty `try/catch`. Fix the cause.
- Do not remove features to remove warnings.

## Definition of done
- Each audited route loads and runs with zero console errors and zero warnings from our code.
- Network tab: real API calls succeed (or show a designed error state on failure).
- Run the **completionist** subagent on changed files.
- Report: before/after console inventory per route.

> Note: this task edits `home.html` / hero code. If running task 07 or 12 in parallel, run this one AFTER them.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/wow-sprint/04-console-errors-cleanup.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
