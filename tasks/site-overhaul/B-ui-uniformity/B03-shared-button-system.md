# B03 — Shared button system

**Track:** UI Uniformity · **Size:** M · **Priority:** P1 · **Depends on:** B01

## Goal
Replace **387 unique button class names** with one shared button system: a small set of
semantic classes (`.btn`, `.btn--primary`, `.btn--ghost`, `.btn--danger`, sizes, `:disabled`,
loading) used everywhere.

## Why it matters
Buttons are the most-touched control; 387 bespoke variants is the single clearest symptom of
the fragmentation. One system = instant site-wide consistency and a fraction of the CSS.

## Context
- Fragments include `.h-btn-primary` (home), `.nxt-signin` (app-next), `.btn-primary` (marketplace), `.pumpfun-btn`, `.chs-btn-primary` (characters), `.create-avatar-btn`, etc.
- Tokens from B01 supply padding/radius/color. The best reference styling is in `public/app-next.css`.

## Scope
- Define the canonical button classes in the shared layer (a `buttons.css` partial or in `style.css`), token-driven. Cover: primary, secondary/ghost, danger, link, icon-only; sizes sm/md/lg; states hover/active/focus-visible/disabled/loading. Include a focus ring (a11y).
- Migrate the highest-traffic surfaces first (nav, home, dashboard, create, marketplace), replacing bespoke classes with the shared ones. Then sweep the rest.
- Delete the bespoke button CSS as you migrate.

## Definition of done
- A representative set of pages uses only the shared button classes; `grep` shows the bespoke button class definitions shrinking toward zero.
- Every button has hover/active/focus-visible/disabled states from the shared system.

## Verify
- `npm run dev`; tab through buttons on home/dashboard/marketplace — consistent look, visible focus rings, working disabled/loading states.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/B-ui-uniformity/B03-shared-button-system.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
