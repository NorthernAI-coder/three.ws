# F05 — Task-oriented docs overhaul

**Track:** Advertise & Value · **Size:** M · **Priority:** P2

## Goal
Reorient the docs around what users want to *do* — "Build a customer-service avatar in 5 minutes,"
"Embed an agent on your website," "Launch a coin for your community" — not around internal
architecture.

## Why it matters
Docs are both support and marketing. Task-oriented guides reduce friction, rank in search, and
double as proof the platform works. The audit shows users need plain, goal-driven guidance.

## Context
- Docs hub: [docs/index.html](docs/index.html) (SPA, `/docs/:page`). Existing integration docs (e.g. IBM) are nav-wired — follow that pattern.
- Reuse C02 use-cases, C04 glossary, F02 landing pages; honest examples only.

## Scope
- A "Guides" section with 5–8 task-oriented walkthroughs for the top jobs-to-be-done, each with real steps, screenshots/embeds, and links into the product.
- Keep reference docs but lead with guides; wire glossary terms (C04).
- Ensure docs use the unified design system and are searchable (tie to D01 command palette).

## Definition of done
- The docs lead with task-oriented guides covering the top user goals; each guide is accurate, real, and links into the product; nav-wired and searchable.

## Verify
- Follow one guide end-to-end as a new user and reach the promised outcome; confirm guides appear in nav + command palette.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/F-advertise-value/F05-task-oriented-docs.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
