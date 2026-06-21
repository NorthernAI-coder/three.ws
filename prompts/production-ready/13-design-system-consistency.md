# 13 — Design-system consistency

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 1 — Cross-cutting hardening
**Owns:** global CSS / design tokens (`style.css`, `public/*.css`), shared components, every page's styling.
**Depends on:** none. Pairs with `09`, `11`, `12`.

## Why this matters for $1B
Consistency compounds into perceived quality. `/CLAUDE.md`: "Consistent spacing and
typography. Use the existing design tokens / CSS variables." A site that uses the same
spacing scale, type ramp, and component vocabulary everywhere reads as one premium
product — not a pile of separately-built pages.

## Mission
One coherent design system: documented tokens, a consistent type/spacing/color scale,
reusable components, and every page conformed to it. No ad-hoc magic numbers.

## Map
- Existing tokens: the forge page references `--space-md/lg/xl/2xl`, `--text-xs..xl`,
  `--ink`, `--ink-dim`, `--stroke`, `--surface-*`, `--radius-*`, `--font-display/
  body/mono`, `--leading-*`. Treat these as the canonical token set.
- 125 pages in `pages/`, many with inline `<style>` blocks — the main source of drift.

## Do this
1. Catalog the existing tokens (the `--space/--text/--ink/--surface/--stroke/--radius/
   --font/--leading` families). If a token catalog doc doesn't exist, create
   `docs/design-system.md` documenting every token, its value, and when to use it.
2. Audit pages for **hardcoded values** that should be tokens: raw px spacing, hex
   colors, font sizes, border radii, shadows. Replace with the nearest token; if no
   token fits, the scale has a gap — extend the scale deliberately, don't add a
   one-off.
3. **Components:** identify repeated UI (buttons, cards, chips, tabs, modals, inputs,
   toasts, badges) re-implemented per page. Extract canonical, accessible, themeable
   versions and replace duplicates. Match hover/active/focus states everywhere.
4. **Type & spacing rhythm:** enforce the type ramp and an 8pt-ish spacing scale
   site-wide. Fix inconsistent line-heights and vertical rhythm.
5. **Color & theming:** both light and dark themes pass contrast (prompt `09`) and use
   only tokens. No hardcoded colors that break theming.
6. **Microinteractions:** ensure consistent transition timing/easing tokens for
   hover/active/enter/exit (`/CLAUDE.md`: "Transitions matter"). Honor reduced-motion.
7. Add a lint/check (stylelint or a custom scan) that flags hardcoded colors/spacing
   outside the token system, and wire it into CI.

## Must-not
- Do not introduce a parallel token set or rename existing tokens (breaks every page).
- Do not add one-off magic numbers when a token exists.
- Do not refactor working components purely for style — extract shared ones additively.

## Acceptance
- [ ] `docs/design-system.md` documents the full token set and components.
- [ ] Hardcoded color/spacing/type values replaced with tokens (scale extended only deliberately).
- [ ] Canonical reusable components extracted and adopted; duplicates removed.
- [ ] Consistent hover/active/focus + transition tokens across the site.
- [ ] Both themes consistent and contrast-passing.
- [ ] Token-drift lint wired into CI.
