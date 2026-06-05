# A06 — Reconcile the homepage variants

**Track:** Health · **Size:** M · **Priority:** P1

## Goal
There are 5+ home pages: `home.html`, `home-v2`, `home-v3`, `home-v4`, `home-classic`. Pick the
canonical one, make `/` serve it, and redirect or delete the rest. One front door.

## Why it matters
Multiple half-maintained homepages dilute the brand, fragment SEO, and guarantee inconsistency.
The audit identifies `pages/home-v4.html` ("Give your AI a body") as the current canonical.

## Context
- Files: `pages/home.html`, `pages/home-v2.html`, `pages/home-v3.html`, `pages/home-v4.html`, `pages/home-classic.html`.
- Routing: `vite.config.js` (dev) + `vercel.json` (prod) define `/`, `/home`, `/home-v2…`.
- Note: Track C (C01) will rewrite the canonical home's copy for newcomers — coordinate so you converge on **one** file C01 then edits.

## Scope
- Confirm the canonical (default to `home-v4.html` unless you find a clearly better/newer one) and make `/` and `/home` serve it in both dev and prod routing.
- For the others: `301` redirect to `/` if they have inbound links/SEO value, otherwise delete the file and its routes. Don't leave orphaned routes (`A07` covers the broader orphan sweep).
- Update any internal links pointing at a non-canonical variant.

## Definition of done
- `/`, `/home`, and every former variant URL all resolve to the single canonical homepage (directly or via redirect). No variant renders a different, competing design.

## Verify
- Hit `/`, `/home`, `/home-v2`, `/home-v3`, `/home-classic` in dev — all land on the canonical page or redirect to it. `grep -rn "home-v2\|home-v3\|home-classic" pages public src` shows no live internal links.
