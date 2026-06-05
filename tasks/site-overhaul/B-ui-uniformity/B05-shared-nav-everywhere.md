# B05 — Shared nav on every page

**Track:** UI Uniformity · **Size:** M · **Priority:** P1

## Goal
Every user-facing page uses the one shared header (`public/nav.{html,css,js}` via
`#nav-container`). Convert the ~40 pages that ship a bespoke `<nav>`.

## Why it matters
The shared nav is good and already on ~216 pages, but ~40 pages reinvent it (different brand,
spacing, colors) — the most visible inconsistency a user hits on every navigation. Memory note:
the shared nav is the single global header; never add a per-page brand.

## Context
- Shared system: [public/nav.html](public/nav.html), [public/nav.css](public/nav.css), [public/nav.js](public/nav.js); injected into `#nav-container`.
- Bespoke-nav offenders: `public/arbitrage.html`, `public/bazaar.html`, `public/providers.html`, `public/characters.html` (`.chs-nav`), `public/character.html` (`.ch-nav`), `public/login.html` (`.features-nav`), `public/404.html` (inline nav), `public/forever.html`, and others.

## Scope
- For each offender: remove the bespoke `<nav>` + its CSS, add `<div id="nav-container"></div>` and the standard nav injection, verify the page's top spacing still works under the shared sticky header.
- Pages that intentionally have **no** chrome (embeds: `/widget`, `/embed/*`, `/walk-embed`) stay chrome-less — do not add nav there.

## Definition of done
- The bespoke-nav pages all render the shared header; `grep -rn "chs-nav\|ch-nav\|features-nav" public` (and other one-off nav classes) returns nothing live. Embeds remain chrome-free.

## Verify
- Visit each former offender in dev — identical header to the homepage, working dropdowns/mobile drawer.
