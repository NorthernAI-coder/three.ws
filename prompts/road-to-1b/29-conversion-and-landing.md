# 29 — Conversion funnel & landing optimization

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 6 — Growth & business
**Owns:** the home/landing page, hero, value proposition, primary CTAs, social proof, pricing entry points.
**Depends on:** 12 (perf), 16 (SEO), 28 (onboarding).  ·  **Parallel-safe with:** 30, 31.

## Why this matters for $1B
The landing page is where the $1B math starts: every point of conversion compounds
through the funnel. A first-time visitor must understand "give your AI a body" in
seconds and have an obvious, fast path to their first action.

## Mission
Turn the landing and top-of-funnel into a high-converting, fast, credible first
impression with a single obvious primary action.

## Do this
1. Sharpen the hero: one-sentence value prop, a live 3D proof element, and one primary
   CTA (to the activation moment from prompt 28) above the fold.
2. Add credible social proof (real metrics, real press from the footer — Business
   Insider, IBM, Yahoo, etc., real agent/coin counts) — never fabricated numbers.
3. Make secondary paths (explore, docs, launch) discoverable without diluting the
   primary CTA.
4. Ensure the landing is the fastest page on the site (LCP target from prompt 12) and
   flawless on mobile (prompt 14).
5. Reduce friction to first action: no premature sign-up wall; let users try, then
   prompt to save (ties funding/upsell logic).
6. Instrument the funnel (visit → CTA click → activation) with prompt 30; set up a clean
   A/B harness for hero variants if one exists, else document the plan.

## Must-not
- No fabricated stats or fake logos; no slow hero; no buried primary CTA.

## Acceptance
- [ ] Hero communicates value in seconds with one primary CTA to activation; real proof only.
- [ ] Landing meets perf + mobile targets; funnel instrumented end to end.
- [ ] `npm test` green; changelog `improvement` entry.
