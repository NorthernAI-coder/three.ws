# B01 — One canonical design-token system

**Track:** UI Uniformity · **Size:** M · **Priority:** P0 (unblocks all of Track B)

## Goal
Establish a single source of truth for design tokens — color, spacing, typography, radius,
shadow, motion — that every page imports. This is the foundation the rest of Track B builds on.

## Why it matters
The audit found 8+ competing token systems. You cannot unify buttons, cards, or pages until
there is *one* token vocabulary. `public/app-next.css` (`--nxt-*`) is the most modern, semantic
set and `public/style.css` `:root` already has a good monochrome + phi-ratio base.

## Context
- Best existing direction: [public/app-next.css](public/app-next.css) (`--nxt-*`) + [public/style.css](public/style.css) `:root` (phi spacing `--space-*`, type scale `--text-*`, `--surface-*`/`--stroke-*`/`--ink-*`, semantic `--success/--danger/--warn`).
- Competing systems to subsume (B02 deletes them): `--mk-*`, `--pd-*`, `--ibm-*`, `--gx-*`, `--ho-*`, `--saas-*`, `--sdk-*`, `--t-*`.

## Scope
- Create/normalize **one** token file (`public/tokens.css` or consolidate into `public/style.css` `:root`) defining the full token set with semantic names: surfaces, ink/text, strokes, accent, state colors, spacing scale, type scale + families, radii, shadows, blur, motion durations/easings.
- Promote the strongest `--nxt-*` values into this canonical layer. Pick one prefix (recommend keeping `--nxt-*` since it's modern, or rename to a neutral `--tw-*`/`--ds-*`) and document it.
- Provide a short mapping doc (`DESIGN-TOKENS.md`) so other agents know "use `--ds-surface-1`, not `#0a0a0a`."
- Load it globally (it should be imported by the shared nav/footer and every page entry CSS).

## Out of scope
- Migrating pages off hardcoded colors (that's B08) and deleting the dead systems (B02) — but make those trivial by having the canonical set ready.

## Definition of done
- A single token file defines every design primitive with semantic names and is loaded site-wide.
- `DESIGN-TOKENS.md` documents the vocabulary and the "no hardcoded values" rule.
- Visual regression: the canonical pages (home, dashboard, app-next) render identically or better.

## Verify
- `npm run dev`; confirm home/dashboard/app-next look correct sourcing the new tokens. No color/spacing regressions.
