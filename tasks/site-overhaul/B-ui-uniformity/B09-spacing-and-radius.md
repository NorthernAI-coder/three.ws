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
