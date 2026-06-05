# B07 — Typography unification

**Track:** UI Uniformity · **Size:** M · **Priority:** P2 · **Depends on:** B01

## Goal
One type system: a single font stack (display + body + mono), the shared type scale, and
consistent weights/line-heights — replacing hardcoded `px` sizes and the Space-Grotesk-vs-Inter
split.

## Why it matters
The audit found the home page is "Space Grotesk heavy" while nav/root/app-next are "Inter
primary," and sizes are hardcoded per page (`14px`, `13.5px`, `11px`…) ignoring the `--text-*`
phi scale. Typography is half of perceived polish.

## Context
- Root scale: `--text-*` in [public/style.css](public/style.css). Fonts currently vary: nav uses Inter Tight/Inter/JetBrains Mono; home uses Space Grotesk/Inter; root lists Space Grotesk/Inter/SF Mono.
- Decide one display family and one body family (recommend: keep **one** display for marketing headers, **Inter** for product/body, one mono) and document it in B01's `DESIGN-TOKENS.md`.

## Scope
- Define `--font-display`, `--font-body`, `--font-mono` in the canonical tokens; set the type scale + standard heading/body classes.
- Migrate pages off hardcoded font-sizes/families to the scale and font tokens, starting with home, nav, dashboard, marketplace.
- Ensure font files are loaded once, with `font-display: swap`, no FOUT jank.

## Definition of done
- Headings and body text are visually consistent across home/dashboard/marketplace; no page declares a competing font family; sizes come from the scale.

## Verify
- `npm run dev`; compare H1/H2/body across 5 pages — same families, harmonious scale. Network tab shows fonts loaded once.
