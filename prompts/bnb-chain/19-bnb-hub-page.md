# 19 — /bnb hub page (the campaign's front door)

Read `prompts/bnb-chain/00-CONTEXT.md` first, then `/workspaces/three.ws/CLAUDE.md`.
**Prereqs: none** to build the shell; it LINKS to the three tracks and degrades gracefully if
a track isn't live yet. Best run last, but can ship early with "coming soon" states that
auto-light-up as tracks land.

## Why
One landing page that tells the whole BNB Chain story and routes to each track. It's the
narrative wrapper: three genuinely-unique capabilities, each with a live demo. This is where a
visitor (or BNB Chain / a grant committee) lands and immediately gets why we built on BNB.

## Build — `/bnb` page
- Three feature cards, each stating the capability HONESTLY (trace every claim to 00-CONTEXT's
  verified list — no 20k TPS, no 250ms):
  1. **Gasless agent onboarding** → links to gasless registration (03) + payments doc (06).
  2. **On-chain-gated 3D vault** → links to `/vault` (12).
  3. **Real-time on-chain world** → links to the on-chain mode (16) + `/bnb-latency` (17).
- Live proof widgets where cheap: embed the BNB live block-average from `probeBlockTime` (01)
  so the page itself demonstrates 0.45s. Show real counts if easy (agents registered, vault
  listings, moves recorded) pulled from the respective APIs — real data only, no vanity fakes.
- Each card: if its track's API/route isn't live yet, a designed "coming soon" state (not a
  broken link). CLAUDE.md UI bar throughout.

## States
Track live → card shows the real demo link + a live stat. Track not yet deployed → "coming
soon" state, no dead link. A stat API down → hide that stat gracefully, keep the card.
Responsive, a11y, motion-tasteful.

## Tests
- Pure helpers (stat formatting, track-availability gating) in `tests/`.
- Manual browser exercise: `npm run dev`, open `/bnb`, confirm the live block-average renders
  and links resolve (or show coming-soon). Zero console errors. Capture in PROGRESS.

## Definition of done
Inherit 00-CONTEXT DoD (UI items). Additionally:
- [ ] `data/pages.json`: register `/bnb` (this feeds sitemap/llms.txt/changelog).
- [ ] `STRUCTURE.md`: add the BNB hub row (and link the three track surfaces under it).
- [ ] `data/changelog.json`: entry (tag `feature`) — "BNB Chain hub: three uniquely-BNB demos in one place".
- [ ] Every capability claim on the page is checked against 00-CONTEXT's verified/refuted lists.
