# B09 — Spacing & radius unification

**Track:** UI Uniformity · **Size:** S/M · **Priority:** P3 · **Depends on:** B01

## Goal
Adopt the shared spacing scale and a small set of radii everywhere, replacing ad-hoc `px` gaps
and the 5/10/14px radius chaos.

## Why it matters
Inconsistent spacing/radius is subtle but pervasive — it's why surfaces "feel" different even
when colors match. The phi-ratio `--space-*` scale exists but is almost never used.

## Context
- `--space-*` phi scale in [public/style.css](public/style.css). Radii currently vary: `5px` (style.css), `10px` (marketplace), `14px` (root/app-next).
- B01 should define `--radius-sm/md/lg/pill`.

## Scope
- Standardize on ≤4 radius tokens and apply them via the shared button/card systems (B03/B04) and across pages.
- Migrate hardcoded gaps/padding to the spacing scale on the high-traffic surfaces.
- Don't over-engineer — pixel-perfect parity isn't the goal; *consistency* is.

## Definition of done
- Cards/buttons/inputs share radii; spacing on home/dashboard/marketplace uses the scale; no jarring per-section spacing jumps.

## Verify
- Inspect spacing/radius on 4 surfaces in DevTools — values resolve to tokens, not arbitrary px.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/site-overhaul/B-ui-uniformity/B09-spacing-and-radius.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
