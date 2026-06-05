# C02 — "What is three.ws?" + concrete use-cases page

**Track:** UX for Newcomers · **Size:** M · **Priority:** P1

## Goal
A plain-language explainer page that answers "what is this and who is it for?" with 3–4 concrete,
relatable use-cases — and link it from the nav and homepage.

## Why it matters
The audit found users have "no idea these are all part of one platform" (avatar creator,
animation, AI chatbot, embeddable widget, optional tokens, paid APIs, 3D worlds). Concrete
use-cases convert abstract capability into "oh, I could use this for X."

## Context
- The platform's capabilities are real and listed in the route inventory; the gap is *framing*.
- Suggested use-cases (validate against real features): (1) a customer-service avatar embedded on a website, (2) a streamer/creator avatar for YouTube/Twitch, (3) a 3D character for a community/token, (4) a personal AI agent with a face.
- There is a `/start` and `/features` page already — coordinate so this doesn't duplicate (C05 rewrites `/features`).

## Scope
- New page (`pages/what-is.html` or repurpose `/start`) with: a one-paragraph plain definition, the 3–4 use-cases as cards (each: who, what they build, the steps, a live example/CTA), and a "start free" CTA.
- Each use-case links to the actual flow that achieves it (`/create`, `/scan`, embed, etc.).
- Add a nav entry ("What is three.ws?" or "Use cases") and link from the homepage.
- Built on Track B components; honest examples only.

## Definition of done
- The page exists, is linked from nav + home, and each use-case is real and actionable (its CTA reaches a working flow).

## Verify
- Click each use-case CTA — lands on the right working surface. Non-crypto reader can name a use-case that applies to them.
