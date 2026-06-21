# 16 — Mobile responsiveness

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** `public/mobile.css`, responsive layout across `pages/` + `src/`, touch interactions.
**Depends on:** `01`. **Pairs with:** `15` (a11y), `20` (design system), `55` (PWA).

## Why this matters for $1B
A large share of crypto + consumer traffic is mobile. If forge, the gallery, the wallet
flow, or a coin page is broken at 360px, half the audience bounces. CLAUDE.md: "Responsive
by default. Test at 320px, 768px, and 1440px." Mobile parity is not a nice-to-have for a
consumer platform aiming at $1B.

## Map — real anchors
- `public/mobile.css` (~442 lines) — breakpoints at 768/640/480/380/360px, `@media (hover:none) and (pointer:coarse)` touch rules, `@media (display-mode: standalone)` PWA tweaks.
- `public/style.css` — fluid `clamp()` sizing + viewport units. `public/tokens.css` — spacing scale.

## Do this
1. **Audit every primary surface at 320 / 360 / 768 / 1024px** (and a real phone if possible): home, forge, gallery, marketplace, dashboard, create wizard, scene, club, city, walk, agent-studio, brain, coin/launch detail, wallet/funding, embed studio.
2. **Fix layout breaks:** horizontal overflow, clipped content, overlapping elements, unreadable type, off-screen CTAs, fixed widths that don't fit. Prefer fluid units + the existing `clamp()` pattern; avoid new fixed pixel widths.
3. **Touch targets:** ≥44px tap targets, adequate spacing, no hover-only affordances (provide tap equivalents). Honor the existing coarse-pointer media query.
4. **3D on mobile:** canvas surfaces (forge preview, viewer, scene, walk, city) must be usable on touch — pinch/drag camera, sane default framing, lower asset/quality tier on low-power devices (coordinate with `19`). No locked-up scroll.
5. **Forms + modals:** inputs don't get hidden by the soft keyboard; modals/sheets are full-height-friendly; payment + wallet flows work one-handed.
6. **Safe areas + PWA:** respect `env(safe-area-inset-*)` on notched devices; verify the `standalone` display mode (coordinate with `55`).

## Must-not
- No horizontal scroll on any primary surface at 320px.
- No hover-only interactions without a touch equivalent.
- Do not ship a desktop-only 3D control scheme on touch surfaces.

## Definition of done
- [ ] Every primary surface clean at 320/360/768/1024px — no overflow, clipping, or off-screen CTAs.
- [ ] Tap targets ≥44px; no hover-only affordances; coarse-pointer rules honored.
- [ ] 3D/canvas surfaces usable + framed on touch, with a low-power quality tier.
- [ ] Forms/modals/payment flows usable one-handed; safe-area insets respected.
- [ ] `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
