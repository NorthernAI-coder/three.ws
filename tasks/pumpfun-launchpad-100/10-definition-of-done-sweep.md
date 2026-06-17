# Task 10 — Launchpad Definition-of-Done sweep (final audit gate)

**Priority:** HIGH (run LAST). **Depends on:** 01–09. **Type:** audit + polish.

## Goal

Run the entire pump.fun launchpad surface through the CLAUDE.md Definition of Done as a single
deliberate pass, fix everything that falls short, and produce a short audit report proving the
launchpad is genuinely 100% — every path reachable, every state designed, no dead links, no
mocks, no console noise.

## Why this matters

Tasks 01–09 each close a specific gap. This task guarantees the *whole* surface holds together:
the accumulation of small quality decisions that separates a great product from an adequate one.
This is the "would I demo this to a room of senior engineers" gate.

## Surfaces to audit (every one)

- Pages: `/launches`, `/pump-live`, `/pump-dashboard`, `/pump-visualizer`, `/pumpfun`,
  `/launchpad` (Studio), agent-detail launch history.
- Modals/widgets: launch-token-modal, pump-modals (buy/sell/governance/withdraw),
  agent-token-widget, homepage-launcher, bonding-curve-chart.
- The Launchpad Studio publish flow (`/api/launchpad/publish` → `/p/<slug>` → `/api/launchpad/invoke`).

## Checklist — apply to each surface

1. **Reachable + navigable.** Every surface is in `public/nav-data.js` and reachable; every
   button/link goes somewhere real; no dead paths (CLAUDE.md). Verify `/pumpfun` (served from
   `public/pumpfun.html`) actually renders the intended stream UI, not a stale stub.
2. **Every state designed:** loading (skeleton), empty (tells the user what to do — not a blank
   void), error (actionable + recovery), populated, overflow (long names, 0 / 1 / 1000 items).
3. **No mocks/fake data in prod paths.** Grep for sample arrays, `DEMO_*`, hardcoded mints
   (only `$THREE` CA or synthetic placeholders allowed), `setTimeout` fake loading, TODO,
   `not implemented`. Remove or implement.
4. **No console errors/warnings** from our code on any surface (open each in a browser).
5. **Network tab:** real `/api/pump/*` calls succeeding with real data on every surface.
6. **Microinteractions + a11y:** hover/active/focus states on every interactive element;
   semantic HTML; ARIA labels; keyboard nav; focus rings; sufficient contrast. The launch modal
   and dashboard must be keyboard-operable.
7. **Responsive** at 320 / 768 / 1440.
8. **Cross-links wired:** launches feed ↔ agent profiles ↔ token widget ↔ dashboard ↔ pump.fun.
   A coin card links to its agent; an agent links to its launches. The platform should feel linked.

## Definition of done

- [ ] Every surface passes the checklist; each fix committed with a justified diff.
- [ ] A short report `tasks/pumpfun-launchpad-100/AUDIT-REPORT.md` listing each surface, its
      verified states, and what was fixed.
- [ ] Run the `completionist` subagent over the launchpad changes; address its findings.
- [ ] `npm test` passes; no console errors on any surface.
- [ ] Changelog entry (tag: `improvement`) summarizing the polish pass.
- [ ] You would be proud to demo every one of these surfaces to senior engineers.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/pumpfun-launchpad-100/10-definition-of-done-sweep.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
