# 13 — Design-system consistency (tokens, spacing, typography, theming)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

Consistency is what makes a platform feel like one product instead of forty pages glued
together. When spacing, type, color, and interaction states come from a single
vocabulary, every new surface inherits quality for free and the brand reads as
trustworthy. Drift — a one-off hex here, a magic `13px` there, a button with no focus
state — is the visual equivalent of bugs. A $1B platform speaks one design language
everywhere, in both light and dark.

## Mission

Unify the platform on the canonical design tokens: every surface references shared
spacing, type, color, radius, and motion tokens; every interactive element has hover /
active / focus states; light and dark themes are correct everywhere; and no surface
reintroduces a parallel palette.

## Map (trust but verify — files move)

- **Canonical tokens (single source of truth)** — [public/tokens.css](../../public/tokens.css)
  (φ-based spacing scale, type ladder, surfaces, ink, stroke, radius, shadow, blur,
  motion, `--focus-ring-color`) and [DESIGN-TOKENS.md](../../DESIGN-TOKENS.md) (vocabulary
  + migration guidance). Per-surface palettes (`--mk-*`, `--pd-*`, `--ibm-*`, …) were
  **removed in B02** — do not reintroduce; a surface accent REMAPS these tokens.
- **Token loading** — imported by [public/style.css](../../public/style.css) and
  [public/nav.css](../../public/nav.css) so tokens reach full-stylesheet pages and
  nav-only/embed surfaces. New pages just link one of those.
- **Theming (no-flash boot + runtime)** — [scripts/inject-theme-boot.mjs](../../scripts/inject-theme-boot.mjs)
  (pre-paint `data-theme` apply; key `twx_theme`), [public/theme-switcher.js](../../public/theme-switcher.js)
  (toggle, persistence, cross-tab sync), the nav toggle in [public/nav.js](../../public/nav.js).
- **Per-surface stylesheets** — [public/](../../public) `*.css` (~many). These are where
  drift hides: hardcoded hex/rgba/px, ad-hoc spacing, missing `:focus-visible`. Existing
  focus styles in [public/buttons.css](../../public/buttons.css), [public/home.css](../../public/home.css),
  [public/home-polish.css](../../public/home-polish.css) — extend, don't fork.

## Do this

1. **Read the vocabulary.** Read `DESIGN-TOKENS.md` and `tokens.css` end to end so you
   use the real token names (`var(--space-md)`, `var(--surface-1)`, `var(--text-sm)`,
   `--focus-ring-color`, motion tokens). Do not invent new names where one exists.
2. **Find the drift.** Grep `public/*.css` and inline `src/`/`pages/` styles for
   hardcoded color (`#`, `rgb(`, `rgba(`, `hsl(`) and raw pixel spacing/sizing that an
   existing token already expresses. Build a list of offenders by file.
3. **Migrate to tokens.** Replace each hardcoded value with the nearest correct token
   (color → surface/ink/stroke token; spacing/size → φ scale; font sizes → type ladder;
   radii/shadows/blur/motion → their tokens). If a genuinely new primitive is needed, add
   it once to `tokens.css` and document it in `DESIGN-TOKENS.md`, then use it everywhere.
4. **Kill parallel palettes.** If any reintroduced `--mk-*`/`--pd-*`/`--ibm-*`-style
   namespace or standalone color set exists, collapse it into a thin theme layer that
   remaps the canonical tokens. One palette, not eight.
5. **Interaction states everywhere.** Every interactive element (buttons, links, chips,
   tabs, cards, inputs) has consistent **hover**, **active**, and **`:focus-visible`**
   states drawn from tokens — using the shared focus ring, not ad-hoc outlines. Audit for
   controls missing any of the three.
6. **Verify both themes.** `npm run dev`, toggle light/dark via the nav switch on home,
   forge, marketplace, wallet, and a settings/dashboard page. Confirm no unreadable
   contrast, no token that only works in one theme, and no flash on reload (theme-boot
   working). Run `node scripts/inject-theme-boot.mjs` (dry run) to confirm every real page
   carries the boot.
7. **Typography & spacing rhythm.** Confirm headings, body, and labels map to the type
   ladder and that section/card padding uses the spacing scale — fix one-off rhythm that
   breaks the φ system.
8. **Lock it & ship.** Run `npm run build:pages`, `npm run audit:web`, and `npm test`;
   re-grep to confirm the hardcoded-value count dropped (ideally to zero on touched
   files). Add a changelog entry for the visible consistency pass; `npm run build:pages`.

## Must-not

- Do not reintroduce a parallel per-surface palette — remap canonical tokens instead.
- Do not hardcode a hex/rgba/px that an existing token already expresses.
- Do not invent a new token name when one exists; only add to `tokens.css` for a genuinely
  new primitive, and document it.
- Do not ship an interactive element missing hover/active/`:focus-visible`.
- Do not break the no-flash theme boot or leave a token that fails in one theme.

## Acceptance (all true before claiming done)

- [ ] Touched surfaces reference tokens; hardcoded hex/rgba/raw-px count dropped (zero where feasible).
- [ ] No parallel palette remains; surface accents are thin remaps of canonical tokens.
- [ ] Every interactive element has consistent hover, active, and `:focus-visible` states from tokens.
- [ ] Light and dark themes are correct on home, forge, marketplace, wallet, and a dashboard page; no flash.
- [ ] Typography and spacing map to the type ladder and φ spacing scale; any new token documented in `DESIGN-TOKENS.md`.
- [ ] `npm run audit:web` and `npm test` pass.
- [ ] Changelog updated and `npm run build:pages` is clean.
