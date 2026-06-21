# 31 — Home / landing conversion

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** `pages/home.html`, top-of-funnel landing pages, hero, primary CTAs, social proof.
**Depends on:** `10`, `13`, `14`. Pairs with `30`, `33`.

## Why this matters for $1B
The homepage is the highest-traffic, highest-leverage page. A few points of conversion
lift compounds across every channel. It must instantly communicate what three.ws is,
why it's special, and what to do next — and it must be screenshot-worthy.

## Map
- `pages/home.html` (currently modified in the working tree — review before editing).
  Pulls from `data/features.json` / `public/features.json`. Global tokens (prompt
  `13`).

## Do this
1. **Message clarity:** above the fold answers "what is this / who is it for / why
   care" in one glance, with a single dominant CTA toward the activation event (prompt
   `30`). No jargon, no ambiguity.
2. **Show, don't tell:** lead with the product's magic — a live, interactive 3D
   moment (a real model the visitor can orbit, the walking guide, a forge demo) rather
   than a static screenshot. It must load fast (prompt `10`) and never block first
   paint.
3. **Proof:** real social proof — usage numbers, notable creations, launches, SDK
   installs, testimonials — all truthful and live where possible. No fabricated
   metrics.
4. **Narrative flow:** the page tells a story — magic → how it works → what you can
   build (forge, agents, marketplace, SDKs) → proof → CTA. Each section links into the
   relevant surface (cross-wiring, `/CLAUDE.md`).
5. **CTAs everywhere sensible:** primary CTA repeated at natural decision points;
   secondary paths (developers → SDKs/docs, traders → launches, creators →
   marketplace) routed clearly.
6. **Polish to screenshot bar:** microinteractions, gradients, motion-with-intent
   (reduced-motion safe), perfect spacing/type (prompt `13`), flawless on mobile
   (prompt `11`) and both themes.
7. **Performance + SEO:** great LCP/CLS (prompt `10`), complete meta + OG + JSON-LD
   (prompt `14`).
8. **Experiment-ready:** structure the hero/CTA so they can be A/B tested (prompt
   `33`); instrument CTA clicks and scroll depth.

## Must-not
- Do not show fabricated stats or testimonials.
- Do not block first paint on the 3D hero — lazy/progressive load it.
- Do not bury the primary CTA or present competing equal CTAs that paralyze.
- Do not reference any coin other than $THREE.

## Acceptance
- [ ] Above-the-fold communicates what/who/why + one dominant CTA at a glance.
- [ ] Live interactive 3D moment that loads fast and doesn't block first paint.
- [ ] Truthful, live social proof.
- [ ] Narrative sections cross-link to forge/agents/marketplace/SDKs.
- [ ] Screenshot-grade polish; flawless mobile + both themes; reduced-motion safe.
- [ ] Strong LCP/CLS + complete meta/OG/JSON-LD.
- [ ] CTA clicks + scroll depth instrumented; hero/CTA A/B-ready.
