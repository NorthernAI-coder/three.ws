# 21 · WCAG 2.2 AA accessibility pass

> **Phase 4 — Frontend excellence** · **Depends on:** 05 (axe infra helps) · **Parallel-safe:** yes · **Effort:** L

## Mission
CLAUDE.md says accessibility is not optional, but the audit expects axe/Lighthouse to flag missing
icon-button labels, inconsistent focus indicators, low-contrast dim text (`rgba(...,0.45/0.55)` on
dark), heading-hierarchy gaps, and unlabeled dynamic images. Bring the platform to **WCAG 2.2 AA**
and keep it there with an automated gate.

## Context (read first)
- `CLAUDE.md` accessibility standards.
- `public/buttons.css` (`:focus-visible` defined but not universally applied), the dim-text tokens, icon buttons in `launches.js`/`radar.js`/`oracle.js`.
- axe-core/Playwright infra from prompt 05 (build it here if 05 hasn't run).

## Build this
1. **Icon/interactive labels** — every icon-only button/link/chip/tab gets an `aria-label` (or visible text). Sweep `pages/` + `src/` for unlabeled interactive elements.
2. **Focus visibility** — a consistent, visible `:focus-visible` ring on *all* interactive elements (buttons, links, chips, toggles, custom widgets). No `outline:none` without a replacement.
3. **Contrast** — raise dim text/icon tokens to meet AA (4.5:1 body, 3:1 large/UI). Fix the `rgba(...,0.45/0.55)`-on-dark offenders centrally via tokens, not per-component.
4. **Semantics & landmarks** — proper heading hierarchy (no skips), `<nav>`/`<main>`/`<header>` landmarks, lists as lists, dialogs with `role="dialog"` + focus trap + ESC, `aria-live` for async updates (toasts, feed inserts).
5. **Keyboard nav** — every flow operable without a mouse: modals trap+restore focus, dropdowns/menus arrow-navigable, the forge/marketplace/dashboard fully keyboard-usable. Add a skip-to-content link.
6. **Dynamic images** — meaningful `alt` (or `aria-hidden` if purely decorative) on avatar/coin/model thumbnails.
7. **Gate it** — axe (prompt 05) green on the top ~15 pages at serious/critical; wire to CI.

## Files likely in play
Design tokens (CSS variables for text/contrast + focus ring), `public/buttons.css`, the offender modules, modal/dropdown components, `pages/*` landmark fixes, axe Playwright spec + CI.

## Definition of done
- [ ] axe: zero serious/critical violations on the top pages; CI-gated.
- [ ] All interactive elements labeled + keyboard-operable with visible focus.
- [ ] Contrast meets AA via tokens.
- [ ] Modals/menus/toasts have correct roles, focus management, and `aria-live`.
- [ ] Manually verified with keyboard-only + a screen reader on a key flow (forge or checkout).
- [ ] Changelog: **improvement** entry ("accessibility: WCAG 2.2 AA across the platform").

## Guardrails
Follow CLAUDE.md. Don't bolt on ARIA where native HTML suffices — semantic elements first. Push both remotes.
