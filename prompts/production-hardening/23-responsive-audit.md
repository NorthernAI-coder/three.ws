# 23 · Responsive at 320 / 768 / 1440 across all surfaces

> **Phase 4 — Frontend excellence** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
CLAUDE.md requires every surface to work at 320 / 768 / 1440. The audit found responsive coverage is
inconsistent — largely a single `768px` breakpoint, fixed-width spots, and untested edges (320px
overflow, 1440px sprawl). Make every primary surface genuinely responsive and add a check so it stays
that way.

## Context (read first)
- `CLAUDE.md` ("Responsive by default": relative units, flex/grid over fixed widths).
- Existing media queries cluster at `max-width: 768px`; some dashboard/marketplace components have fixed max-widths.
- Recent mobile work landed in the changelog (tour, walk companion) — match that quality bar.

## Build this
1. **Breakpoint tokens** — establish a small, documented set of breakpoints (e.g. 480 / 768 / 1024 / 1440) as CSS variables/utility classes; use them consistently instead of one-off `768px`.
2. **Fix 320px** — no horizontal scroll, no clipped controls, tap targets ≥44px, readable type, composers/modals usable. Sweep the primary surfaces: forge, marketplace, gallery, dashboard, agent detail, launches, wallet/checkout.
3. **Fix 1440px+** — content doesn't sprawl into unreadable line lengths or leave awkward voids; use max-widths + centered gutters where appropriate (mirror the recent forge full-width work).
4. **Touch vs hover** — hover-only affordances have a touch equivalent; no functionality hidden behind `:hover` on touch devices.
5. **Automated check** — a Playwright responsive spec that loads the top surfaces at 320/768/1440 and asserts no horizontal overflow + key elements visible; wire to CI. (Pairs with visual regression, prompt 05.)

## Files likely in play
Global CSS tokens + layout CSS across `pages/*` and `src/*`, the primary surface stylesheets, a Playwright responsive spec, `.github/workflows`.

## Definition of done
- [ ] Documented breakpoint tokens used consistently.
- [ ] Every primary surface verified at 320/768/1440 — no overflow, no clipping, usable controls.
- [ ] Touch equivalents for all hover affordances.
- [ ] Responsive Playwright spec green in CI.
- [ ] Verified in a real browser at all three widths.
- [ ] Changelog: **improvement** entry ("responsive polish across phones, tablets, and wide screens").

## Guardrails
Follow CLAUDE.md. Test the 3D viewers and modals at 320px specifically — they break first. Push both remotes.
