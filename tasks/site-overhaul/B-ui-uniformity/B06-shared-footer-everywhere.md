# B06 — Shared footer on every page

**Track:** UI Uniformity · **Size:** S/M · **Priority:** P2 · **Depends on:** B05 pattern

## Goal
Add the shared footer (`public/footer.html`, `--h-footer-*`) to the ~60% of pages that currently
have none, so every standard page has consistent bottom chrome (links, legal, socials).

## Why it matters
The audit found ~60% of pages have no footer — inconsistent page edges and missing legal/nav
links hurt trust and navigation.

## Context
- Shared footer: [public/footer.html](public/footer.html) (injected like the nav).
- Same injection pattern as B05; reuse it.

## Scope
- Audit which standard pages lack the footer; inject the shared footer on all of them.
- Skip embeds and full-bleed 3D experiences where a footer doesn't belong (`/play`, `/walk`, `/xr`, embeds) — but ensure those still expose legal links somewhere (e.g. in a menu).
- Fix any layout that hides the footer (e.g. marketplace grid) so it's reachable.

## Definition of done
- Every standard content page renders the shared footer; full-bleed/embed surfaces are intentionally exempt but still expose legal links.

## Verify
- Scroll to the bottom of 10 representative pages — consistent footer. Embeds have no footer by design.
