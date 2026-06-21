# 33 — Growth analytics instrumentation

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 4 — Growth
**Owns:** product analytics, event taxonomy, funnels, A/B framework, consent/privacy.
**Depends on:** `25`, `30`, `31`, `32`. Pairs with `35`, `37`.

## Why this matters for $1B
You can't grow what you don't measure. A clean event taxonomy + funnels + experiment
framework is how every growth decision (prompts `30`–`35`) gets validated instead of
guessed. Investors expect to see the funnel and the levers.

## Mission
Instrument the product with a consistent, privacy-respecting analytics layer: a typed
event taxonomy, the core funnels, retention/cohort views, and an A/B testing
capability — all feeding dashboards.

## Map
- A vetted product-analytics tool (privacy-friendly, e.g. PostHog-class) over
  hand-rolling. Distinguish from system observability (prompt `25`) — this is product/
  growth events. Respect consent (prompt `37`).

## Do this
1. **Event taxonomy:** define a documented, typed event schema (`docs/analytics.md`):
   consistent names, properties, and identity model (anon → authed stitching). Cover
   the funnel: landing view, CTA click, signup, first generation, first agent, first
   purchase, share, return. No ad-hoc one-off event names.
2. **Funnels:** build the core funnels — acquisition → activation (prompt `30`) →
   revenue (prompt `32`) → retention → referral (prompt `35`) — with step drop-off
   visible.
3. **Retention & cohorts:** D1/D7/D30 retention and cohort curves; identify the
   behaviors that correlate with retention (the "north-star input" — e.g. created N
   agents in week 1).
4. **A/B framework:** a lightweight experiment system (feature-flag + assignment +
   metric readout) so hero/CTA/pricing/onboarding variants (prompts `30`–`32`) can be
   tested with statistical rigor. Document how to run an experiment.
5. **Dashboards:** a growth dashboard (acquisition, activation, retention, revenue,
   referral, north-star) alongside the system/business dashboards (prompt `25`).
6. **Privacy & consent:** consent management, IP/PII minimization, honoring
   do-not-track and opt-out (prompt `37`). No PII in event payloads.
7. **Validate:** verify events fire correctly across key flows (no double-counting,
   correct identity stitching) before trusting the numbers.

## Must-not
- Do not collect PII in events or track without consent where required.
- Do not invent inconsistent event names per page — follow the taxonomy.
- Do not ship dashboards built on unvalidated/double-counted events.

## Acceptance
- [ ] Documented typed event taxonomy + identity model in `docs/analytics.md`.
- [ ] Core funnels (acq→activation→revenue→retention→referral) with drop-off.
- [ ] Retention/cohort views + identified north-star input metric.
- [ ] A/B framework usable for hero/CTA/pricing/onboarding experiments; documented.
- [ ] Growth dashboard live alongside system/business dashboards.
- [ ] Consent + PII-minimization in place; events validated for accuracy.
