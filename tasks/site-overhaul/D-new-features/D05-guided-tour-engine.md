# D05 — Reusable guided-tour / coachmark engine

**Track:** New Features · **Size:** M · **Priority:** P1 · **Powers:** C03, C09

## Goal
A small, reusable in-app tour engine (spotlight + tooltip steps, anchored to DOM elements,
dismissible, resumable, progress-tracked) that any surface can drive with a declarative step list.

## Why it matters
C03 (getting started) and C09 (dashboard onboarding) both need guided overlays. Build the engine
once, well, instead of two bespoke implementations — and unlock lightweight tours anywhere.

## Context
- Vanilla JS app; no tour library assumed. Keep it dependency-light.
- Persistence of "seen/completed" per user (reuse the existing user prefs/storage; don't fake with only localStorage if a server pref store exists).
- Track B tokens/components for styling; a11y is mandatory.

## Scope
- Engine API: `startTour([{ target, title, body, placement, action? }], { id, onComplete })`. Handles spotlight, positioning, next/back/skip, resize/scroll, focus management, and `aria` roles.
- Persistence so a tour isn't re-shown once completed (server-backed when available).
- A couple of real tours wired as proof: the getting-started path (C03) and the dashboard orientation (C09) — coordinate with those owners.

## Definition of done
- Any page can define a tour declaratively; tours are accessible, dismissible, resumable, and remembered per user; C03/C09 use it.

## Verify
- Run a tour, skip mid-way, reload — it resumes/respects completion. Keyboard + screen-reader pass.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/D-new-features/D05-guided-tour-engine.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
