# Task 17 — Company surfaces: About, team, careers, press/brand kit

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track F —
> Credibility.** Independent. This is the cheapest credibility you can buy and it's entirely
> missing today.

## The thesis

Enterprise buyers, partners, press, and serious users all ask the same silent question: "Is
this a real company or a weekend project?" three.ws has world-class legal/docs/security
surfaces but **no About page, no team, no careers, no press/brand kit** — the basic signals
of legitimacy. A $1B company looks like a company. Build that surface.

## What exists today (read first)

- **Strong legal/docs/security already** — `public/legal/*`, `docs/*`,
  `public/.well-known/security.txt`, [pages/support.html](../../pages/support.html),
  [pages/status.html](../../pages/status.html). Reuse their layout/tone.
- **Company identity is basically absent** — only footer links
  ([public/footer.html](../../public/footer.html)) and the README. There is **no** `/about`,
  `/team`, `/careers`, or `/press`. Press mentions exist (Business Insider, IBM, Yahoo Finance,
  Crunchbase, Vogue) but only as scattered footer links.
- Nav/manifest: register any new page in [data/pages.json](../../data/pages.json) so
  `npm run audit:pages` passes, and link it from [public/nav-data.js](../../public/nav-data.js)
  / [public/footer.html](../../public/footer.html).

## What to build

Real, on-brand pages (match the design system and the existing page chrome):

1. **About / company** (`/about`) — the mission ("Give your AI a body."), what three.ws is, how
   it works at a glance, the real traction signals that exist (press logos linking to the real
   articles, on-chain/ecosystem facts that are true). No invented metrics — only real, citable
   facts. If a number isn't real, don't print it.
2. **Team** (`/team` or a section of `/about`) — the people behind it, to whatever degree the
   user is comfortable making public. Build the page and layout; where specific bios/photos
   aren't provided, leave a clearly-structured, easily-fillable section rather than inventing
   names. (Ask nothing — build the structure; the user can populate.)
3. **Careers** (`/careers`) — even a simple "we're building the body layer for AI agents,
   here's how to reach us / roles we want" page signals growth. Wire to the real contact channel
   ([pages/support.html](../../pages/support.html) emails).
4. **Press / brand kit** (`/press`) — logo assets (the real three.ws marks), color palette
   (straight from [public/tokens.css](../../public/tokens.css)), the one-liner, boilerplate
   description, and press contact. Make assets downloadable. Consolidate the existing press
   mentions here.

## Hard rules specific to this task

- **No fabricated facts.** Don't invent funding, user counts, customer logos, awards, or team
  members. Use only what's real and citable; structure the rest for the user to fill. Inventing
  company facts is the same violation as fake data.
- **$THREE only** if tokens are mentioned at all.
- Every page: responsive, accessible, designed empty/edge states, real links (no dead `#`).

## Definition of done

README DoD, plus: `/about`, `/team`, `/careers`, `/press` are live, on-brand, responsive,
accessible, linked from nav + footer, and pass `npm run audit:pages`; brand assets download;
press mentions consolidated; zero invented facts. Changelog (`docs`/`feature`). Self-review,
then improve the weakest page (likely About's traction section or the brand kit completeness).

Delete this file when done.
