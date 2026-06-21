# 15 — Accessibility (WCAG 2.2 AA)

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** semantic HTML, ARIA, keyboard nav, focus management, contrast across `pages/` + `src/`.
**Depends on:** `01`. **Pairs with:** `16` (responsive), `20` (design system).

## Why this matters for $1B
CLAUDE.md: "Accessibility is not optional." It's also enterprise procurement reality —
AWS/IBM/Google-tier customers require it, and it's a legal exposure if absent. The repo
already has ~2,500 ARIA usages; the goal is conformance, a CI gate, and a keyboard-only
user who can do everything a mouse user can.

## Map — real anchors
- ~2,490 `aria-*`/`role=` usages across `pages/`. Design tokens (`public/tokens.css`, `:root` in `public/style.css`) carry contrast intent; theme via `public/theme-switcher.js` (dark default + light).
- No a11y CI gate yet — add one.

## Do this
1. **Automated pass:** run `axe-core` (or `@axe-core/playwright`) across the top ~25 routes. Catalog violations by rule + severity.
2. **Fix systematically:** semantic landmarks (`header`/`nav`/`main`/`footer`), heading order, labels on every form control, `alt` on meaningful images + `aria-hidden` on decorative, `aria-label`/`aria-labelledby` on icon buttons, `aria-live` on async status, correct roles on custom widgets.
3. **Keyboard:** every interactive element reachable + operable by keyboard; visible focus ring everywhere (tokens already define `--focus-ring-*`); logical tab order; no keyboard traps; modals trap+restore focus; skip-to-content link.
4. **Contrast:** verify text + UI contrast meets AA in **both** dark and light themes; fix token values that fail rather than one-off overrides.
5. **Motion + 3D:** honor `prefers-reduced-motion` (pause/reduce avatar idle, transitions); provide text alternatives / controls for canvas-only 3D content where it conveys info.
6. **CI gate:** add an automated a11y check (axe in Playwright) to the suite so regressions fail CI (coordinate with `14`).

## Must-not
- Do not add ARIA that lies about state, or ARIA where semantic HTML would do.
- Do not fix contrast with per-element hacks — fix the design token.
- Do not ship a focus style that's invisible on either theme.

## Definition of done
- [ ] axe across top ~25 routes: zero critical/serious violations.
- [ ] Full keyboard operability + visible focus + skip link + modal focus management.
- [ ] AA contrast in dark **and** light themes via tokens.
- [ ] `prefers-reduced-motion` honored for 3D/animation.
- [ ] a11y check wired into CI; `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
