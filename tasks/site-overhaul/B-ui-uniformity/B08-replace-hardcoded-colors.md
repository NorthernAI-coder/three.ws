# B08 — Replace hardcoded colors with tokens

**Track:** UI Uniformity · **Size:** M · **Priority:** P2 · **Depends on:** B01

## Goal
Replace the 100+ hardcoded color literals that already have token equivalents with the canonical
tokens, and excise the home-only orange-gradient accent so the site reads as one monochrome
brand.

## Why it matters
Hardcoded colors are how the site drifts. The audit found `#1a1a1a`×43, `#e8e8e8`×36 (=`--ink`),
`#4ade80`×31 (=`--success`), `#f87171`×26 (=`--danger`), `#0a0a0a`×25, plus a home-exclusive
orange (`rgba(255,215,106,…)`, `rgba(255,175,60,…)`). Memory: the site is monochrome; never
reintroduce purple/colored accents.

## Context
- B01 tokens define every needed value. The monochrome system is the brand.
- The home orange is the biggest off-brand element (`public/home.css`).

## Scope
- Sweep `public/`, `pages/`, `src/` for hex/rgb literals that map to existing tokens; replace with `var(--…)`.
- Resolve the home orange: either remove it for monochrome consistency, or — if the founder wants a single accent — promote **one** accent token in B01 and apply it consistently site-wide (not just home). Default to removing it unless told otherwise.
- Leave genuinely content-specific colors (e.g. data-viz categorical scales, brand logos of partners) alone, but token-ize them if reused.

## Definition of done
- `grep -rEn "#[0-9a-fA-F]{3,6}|rgba?\(" public pages src | grep -v "var(--"` shrinks dramatically; remaining literals are justified (logos, data-viz). No home-only orange accent remains.

## Verify
- Visual pass across home/dashboard/marketplace/agent pages — uniform monochrome; no stray colored accents.
