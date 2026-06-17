# C03 — Getting-started / first-5-minutes guided flow

**Track:** UX for Newcomers · **Size:** M · **Priority:** P1 · **Pairs with:** D05 (tour engine)

## Goal
A guided first-run path that takes a new user from landing to a finished, embeddable avatar in
~5 minutes, distinguishing the free core (create → animate → embed) from optional add-ons
(on-chain, monetize).

## Why it matters
The audit: "onboarding is nearly non-existent — no tutorial, no progressive disclosure." Users
who reach the creation tools succeed; the job is to *get them there* with a clear path.

## Context
- Entry experiences: `/create`, `/scan`, `/forge`, `/avatar-studio`. Strong individually, unconnected as a journey.
- A reusable coachmark/tour engine is specced in `D05` — if it lands first, build on it; otherwise a simple linear stepper is fine.

## Scope
- A first-run flow (triggered for new/anonymous users, dismissible, resumable) that: welcomes, states the value in one line, routes to "create your first avatar," then after creation surfaces "what's next" (embed / give it a brain / optional: own it / monetize).
- A persistent, low-key "Getting started" progress affordance (e.g. a checklist) the user can reopen.
- Free core steps require no wallet; optional steps are clearly marked optional.
- Don't trap the user — always skippable.

## Definition of done
- A brand-new visitor is guided from home to an embeddable avatar without hitting unexplained crypto, and can see/resume their progress.

## Verify
- In a fresh/incognito session, follow the flow end-to-end; confirm no crypto wall in the core path and that "what's next" links work.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/C-ux-newcomers/C03-getting-started-flow.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
