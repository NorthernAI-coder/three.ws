# Task: Design every empty, loading, and error state

CLAUDE.md: "Every state is designed." Audit the data-driven views and make their
loading, empty, and error states intentional and helpful.

## Scope
The views that fetch real data: `pages/marketplace.html` (`src/marketplace.js`,
`src/marketplace-lobby.js`), `pages/agent-home.html` (`src/agent-home.js`),
`pages/dashboard/` (`src/dashboard/`), `pages/pump-dashboard.html`
(`src/pump/dashboard.js`), `pages/skills.html` (`src/skills.js`).

## For each view, deliver three designed states
1. **Loading** — skeleton screens that mirror the final layout (preferred over spinners). No layout shift when data arrives.
2. **Empty** — when the fetch succeeds but returns nothing: explain what this view is and give the user a next action (a CTA), not a blank void. E.g. marketplace with no results → "No agents match — clear filters / create one".
3. **Error** — when the fetch fails: say what went wrong in human terms and offer recovery (Retry button that re-runs the fetch). Never a blank screen or a raw stack trace.

## Method
- Trace each view's data flow to its `api/` endpoint. Confirm the three branches exist and are reachable.
- Test empty by querying a filter with no matches; test error by pointing at a failing endpoint or going offline in devtools.
- Reuse the design tokens (from task 08 / `home.html :root`). Build a small reusable skeleton + empty-state + error component if one doesn't exist; check `src/components/` first.

## Constraints
- Real async only — no `setTimeout` fake loaders.
- Retry must actually re-fetch.

## Definition of done
- All three states designed and reachable on every audited view.
- Verified in `npm run dev` (force each state via devtools). No console errors.
- Run the **completionist** subagent. Report the states added per view, with screenshots described.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/wow-sprint/09-empty-loading-error-states.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
