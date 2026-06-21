# 28 — Onboarding, guided tour & activation funnel

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 5 — Developer platform
**Owns:** the guided tour (3D guide), `tour-sdk/`, first-run experience, feature-tour, activation tracking.
**Depends on:** Phase 4 surfaces.  ·  **Parallel-safe with:** 25–27.

## Why this matters for $1B
Activation — a new user reaching their first "wow" (a forged model, a shipped agent) —
is the single biggest lever on growth. A guided, frictionless first run turns visitors
into users. The recent feature-tour free-roam work is a foundation to finish, not restart.

## Mission
Make first-run onboarding deliver a real "aha" within minutes, with the 3D guide walking
users through the platform and activation measured.

## Map
- The guided tour ("a 3D guide walks you through every feature, live"), `tour-sdk/`,
  the feature-tour free-roam + narrator work (recent commits), first-run entry points.

## Do this
1. Define the activation moment per persona (creator → forged model / shipped agent;
   trader → armed agent / watchlist; developer → first SDK call) and instrument it
   (hand metrics to prompt 30).
2. Build/finish a first-run flow that routes a new user to their activation moment with
   minimal steps; the 3D guide narrates and can free-roam without breaking.
3. Empty/zero-state across the app should teach and CTA toward activation (ties 15).
4. Make the tour resilient: skippable, resumable, keyboard-accessible (ties 13), and
   correct on mobile (ties 14); never traps or blocks the user.
5. Add contextual nudges (tooltips, next-step hints) that don't nag; respect dismissal.
6. Verify the whole first-run in a real browser as a brand-new user.

## Must-not
- No fake demo data in onboarding; no tour step that points at a broken/dead route.
- Do not block the UI behind an un-skippable tour.

## Acceptance
- [ ] New user reaches a real activation moment in minutes, verified in-browser.
- [ ] Tour is skippable/resumable/accessible/mobile-correct; activation event instrumented.
- [ ] `npm test` green; changelog `feature`/`improvement` entry.
