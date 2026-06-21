# G4 — Enforce the design system everywhere (tokens-only, no legacy palettes, token lint gate)

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`, `STRUCTURE.md`, `prompts/production-campaign/00b-the-bar.md`, and `DESIGN-TOKENS.md` (the spec) first. **Prerequisites:** none — but this track is the **enforcement backstop** for G2 (contrast fixes) and the whole campaign. Run it late enough to catch others' regressions, or re-run the lint at the end.

## Why this matters for $1B
Brand consistency is how trust is *communicated before it is earned* (00b's polish pillar). Vercel, Linear, and Stripe feel like one product on every screen because every color, space, and font flows from one vocabulary. three.ws already did the hard migration — `DESIGN-TOKENS.md` records that **eight legacy per-surface palettes** (`--mk-*`, `--pd-*`, `--ibm-*`, `--gx-*`, `--ho-*`, `--saas-*`, `--sdk-*`, `--t-*`) were removed in B02 — but with concurrent agents shipping daily, hardcoded hexes and forked palettes creep back in. Without an automated gate, the system erodes one PR at a time. This track makes the design system *enforceable*, not aspirational.

## Current state (read before you write)
- **The token system is canonical and documented.** `public/tokens.css` is the single source of truth (ink, surface, stroke, accent, `--space-*` on a φ=1.618 scale, radius, shadow, blur, motion). `public/style.css` `@import`s it then layers component tokens (buttons, cards, badges, skeleton); `public/nav.css` `@import`s it too, so every page is covered via `/style.css` or the shared nav. `DESIGN-TOKENS.md` is the full vocabulary + migration guidance; `docs/btn-pill-migration.md` documents the pill-button migration.
- **`--nxt-*` (app shell) and `--nv-*` (nav) are intentional alias layers** that resolve *to* the canonical tokens via `var(--surface-1, …)`. Keep them as aliases — do **not** fork them into standalone palettes.
- **A token verifier exists but isn't a gate.** `scripts/verify-b09-tokens.mjs` launches puppeteer, loads a few pages (home, marketplace, dashboard-next, pump-dashboard), and flags off-scale radii/spacing — but it covers only 4 pages, isn't an `npm` script, and isn't in `.github/workflows/ci.yml`. So drift goes unmeasured.
- **No CSS lint for hardcoded values.** `eslint.config.js` lints JS only; there's no stylelint catching raw hexes/rgba/px-spacing in CSS, and nothing catching reintroduced `--mk-*`/`--pd-*`/legacy-namespace declarations.
- **Component consistency is uneven.** Buttons/cards/badges/skeletons are tokenized in `style.css`, but per-surface CSS files may redefine them or hardcode values.

## Your mission
### 1. Sweep and eliminate hardcoded colors, spacing, and fonts
Grep the first-party CSS (`public/**/*.css`, any `src/**` inline styles, `pages/**` `<style>` blocks) for raw `#hex` / `rgb()/rgba()` / hardcoded `px` spacing / literal `font-family` stacks that a token already expresses, and replace each with the correct `var(--token)` from `public/tokens.css`. Where a value genuinely has no token (rare), add it to `tokens.css` as a named primitive and reference it — never leave a magic number. Preserve intentional exceptions (vendored libs already ignored in `eslint.config.js`, true one-off media-query thresholds) and document them.

### 2. Kill any reintroduced legacy palettes
Search for the eight removed namespaces (`--mk-*`, `--pd-*`, `--ibm-*`, `--gx-*`, `--ho-*`, `--saas-*`, `--sdk-*`, `--t-*`) and any other forked per-surface palette. Replace each declaration with the canonical token (or, for a legitimately distinct brand accent like IBM Carbon at `/ibm/*`, express it as a small theme layer that **remaps** tokens per `tokens.css`'s guidance — never a standalone set). Confirm `--nxt-*`/`--nv-*` remain thin aliases, not forks.

### 3. Normalize buttons, cards, badges, and skeletons
Ensure every button uses the canonical pill-button classes (`docs/btn-pill-migration.md`), every card/badge/skeleton uses the component tokens layered in `style.css`, and no per-surface file redefines them with hardcoded values. Loading skeletons must match the populated layout and use the token-based shimmer (respecting `prefers-reduced-motion` — coordinate with G2). The result: a button on `/forge` is visually identical to one on `/marketplace`.

### 4. Build the token lint gate
Add a real, fast lint that **fails the build on token violations**: configure **stylelint** with a custom rule set (or extend `scripts/verify-b09-tokens.mjs` into a static-analysis pass that doesn't need a browser) that flags raw hex/rgba in first-party CSS, off-scale spacing/radius literals, and any legacy-namespace (`--mk-*` etc.) declaration. Expose it as `npm run lint:tokens`. Broaden `verify-b09-tokens.mjs` to cover the primary surfaces (not just 4). Add a `tokens` job to `.github/workflows/ci.yml` that runs the lint on every PR. The gate must catch a reintroduced hardcoded color and a forked palette.

### 5. Verify
`npm run dev`, visually diff the touched surfaces at 320/768/1440px — nothing shifted, everything is on-brand, buttons/cards/badges/skeletons are consistent. `npm run lint:tokens` passes on a clean tree and fails on a deliberately-injected raw hex (then revert it). Confirm existing tests pass (`npm test`) and the new CI job is green.

## Definition of done
Clears 00b's **polish bar** (consistent tokens, spacing rhythm, typography; every surface on-brand and screenshot-worthy) and makes it *enforceable*. Inherits the global definition of done in `00-README-orchestration.md`: `$THREE` only, **design tokens only** (this track defines that bar for the platform), zero console errors, zero visual regressions, existing tests pass, the new `tokens` CI gate green and enforced. No first-party hardcoded color/spacing/font remains where a token exists; no legacy palette is reintroduced.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs. `$THREE` is the only coin. **Design tokens only** (`public/tokens.css`) — this track ENFORCES that everywhere; the only new raw values allowed are net-new named primitives added *to* `tokens.css`. Stage explicit paths only (never `git add -A`) — and per CLAUDE.md, watch the `npx vercel build` trap that overwrites `api/*.js`/`public/*` with bundles before committing. Own the design-system-enforcement lane; extend `tokens.css`, `style.css`, `scripts/verify-b09-tokens.mjs`, and `eslint.config.js`/stylelint config — do not rewrite the token vocabulary or rename the canonical prefix.

## When finished
Run the self-review (CLAUDE.md's five checks). Ship one improvement (e.g. a `/design-tokens` living style-guide page rendering the vocabulary from `tokens.css`, or a pre-commit hook running `lint:tokens`). Append a `data/changelog.json` entry only if user-visible (tag: `improvement` or `docs`) — a pure-CI lint addition is an internal chore and gets **no** entry; a visible style-guide page or unified components do. Then delete this prompt file (`prompts/production-campaign/G-trust/G4-brand-design-system.md`) and report what you shipped + the seam for the next agent (any surface still carrying hardcoded values you couldn't tokenize, or a missing primitive).
