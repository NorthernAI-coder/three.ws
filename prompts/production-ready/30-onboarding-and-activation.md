# 30 — Onboarding & activation funnel

> Part of **Production-Ready** (`prompts/production-ready/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** first-run experience across `pages/`, signup/auth, the path from landing → first "aha", `src/feature-tour/`, empty states.
**Depends on:** `12`, `15`, `19`. Pairs with `31`, `33`.

## Why this matters for $1B
Activation rate — the share of new users who reach the "aha" (a forged 3D model, a
created agent) — is the single biggest lever on growth-loop velocity and therefore
valuation. Most signups are won or lost in the first 60 seconds.

## Mission
Design and build a first-run experience that gets a brand-new visitor to a real,
shareable "aha" moment as fast as possible, with zero confusion and zero dead ends.

## Do this
1. **Define the aha + the funnel:** pick the primary activation event (likely: first
   forged/created 3D model, or first agent). Map every step from landing →
   aha and instrument each (prompt `33`) to find drop-off.
2. **Reduce time-to-value:** let users experience the magic *before* signup where
   possible (the free `forge_free` lane, the live tour) — capture the account *after*
   they've felt value, not before. No wall in front of the wow.
3. **Guided first run:** a focused, skippable first-run flow (lean on the feature tour,
   prompt `19`) that points at the one next action, not a feature dump. Progressive
   disclosure.
4. **Empty states as onboarding:** every first-visit empty state (profile, wallet,
   marketplace, dashboard) teaches the next step with a working CTA (prompt `12`).
5. **Account creation:** frictionless auth; if a custodial wallet is provisioned,
   explain it simply and reassuringly. Clear value for signing up.
6. **First-win reinforcement:** when the user hits the aha, celebrate it and offer the
   natural next step (share it, list it, make another, give it a wallet) — chain into
   the growth loop (prompt `35`).
7. **Re-engagement:** a sensible welcome/first-steps message (email/notification per
   prompt `39`) for users who leave before activating.
8. **Measure:** activation rate, time-to-aha, and step drop-off visible on the growth
   dashboard (prompt `25`/`33`). Set a baseline and a target.

## Must-not
- Do not gate the core "wow" behind signup if a no-account path exists.
- Do not dump every feature on a new user — one next action at a time.
- Do not ship empty states that are dead ends.

## Acceptance
- [ ] Activation event defined; full landing→aha funnel instrumented with drop-off visibility.
- [ ] A no-signup path to the core wow exists; account captured after value.
- [ ] Skippable guided first-run points at one next action; progressive disclosure.
- [ ] Every first-visit empty state teaches + has a working CTA.
- [ ] First-win celebration chains into share/create-again/wallet.
- [ ] Re-engagement message for pre-activation drop-offs.
- [ ] Activation rate + time-to-aha tracked with a baseline and target.
