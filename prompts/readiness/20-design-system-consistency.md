# 20 — Design-system & token consistency

**Phase 5. [parallel-safe]** with 18–19, 21.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. There is a design-token
doc (`docs/DESIGN-TOKENS.md`), a `public/nav.css`, a `theme-switcher.js` with
light/dark/auto, and a button-pill migration doc (`docs/btn-pill-migration.md`).
Read [CLAUDE.md](../../CLAUDE.md) — "Consistent spacing and typography. Use the
existing design tokens. If none exist, establish them and use them everywhere."
The only coin is **$THREE**.

## Objective

One coherent visual system across all 125 pages: every color, space, radius,
shadow, font-size, and component (button, input, card, modal, badge, toast) comes
from shared tokens/components — no one-off hex values, magic-number spacing, or
divergent button styles. Light and dark themes both correct everywhere.

## Why it matters

Visual consistency is the cheapest, most visible signal of quality. Products that
look like Linear/Stripe feel trustworthy enough to put money into. Inconsistency
reads as "unfinished" and undermines every other thing this program fixes.

## Instructions

1. **Audit token drift.** Find raw values that should be tokens:
   ```bash
   grep -rIn "#[0-9a-fA-F]\{3,8\}\b" --include=*.css --include=*.html public/ pages/ src/ | grep -v node_modules | wc -l
   grep -rIn "px;" --include=*.css public/ pages/ | grep -v node_modules | wc -l   # magic spacing
   ```
   Compare against the tokens in `docs/DESIGN-TOKENS.md`. Catalog the divergences.
2. **Consolidate tokens.** Ensure a single source of truth (CSS custom properties
   in one place) for color, spacing scale, radius, shadow, typography scale,
   z-index, and motion durations. Fill gaps in `docs/DESIGN-TOKENS.md`.
3. **Replace raw values with tokens** across CSS/HTML/inline styles. Inline
   `style="..."` with hardcoded colors/sizes (common in this repo's JS-built UI)
   should reference tokens or shared classes. Work surface-by-surface.
4. **Unify components.** One button system (finish the `btn-pill-migration`), one
   input style, one card, one modal, one toast, one badge. Find divergent
   implementations and converge them. Extract shared components where the same UI
   is rebuilt per page.
5. **Theme correctness.** Every surface must be correct in light, dark, and auto.
   Test the theme-switcher on each top page — no unreadable text, no invisible
   borders, no hardcoded dark-only colors. Fix via tokens, not per-theme hacks.
6. **Typography & spacing rhythm.** Consistent type scale and a consistent
   spacing scale (4/8px system or whatever the tokens define). No arbitrary
   `margin: 13px`.
7. **Microinteractions consistency.** Hover/active/focus states use the same
   motion tokens and feel uniform across components (ties to
   [17 — a11y focus rings](17-accessibility-audit.md)).
8. **Document** the system so new work stays consistent — update
   `docs/DESIGN-TOKENS.md` with usage examples and a "don't hardcode" rule.

## Definition of done

- [ ] Raw hex/spacing values replaced by tokens across the top surfaces; the
      remaining count is near-zero and justified (e.g. third-party vendored CSS).
- [ ] Single source of truth for all token categories; `docs/DESIGN-TOKENS.md`
      complete and authoritative.
- [ ] One unified button/input/card/modal/toast/badge system; divergent copies
      converged or extracted to shared components.
- [ ] Light/dark/auto themes verified correct on every top surface.
- [ ] Consistent type + spacing scale; no arbitrary magic numbers on touched
      surfaces.
- [ ] Hover/active/focus states uniform via motion tokens.
- [ ] `npm test` passes. Changelog: `improvement` entry ("Unified, consistent
      visual design across the platform").
