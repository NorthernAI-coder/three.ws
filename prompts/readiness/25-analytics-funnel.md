# 25 — Analytics & funnel instrumentation

**Phase 6. [parallel-safe]** with 22–24, 26.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. PostHog and Vercel
Analytics are already loaded on the frontend (visible in the page network logs).
Read [CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE**.

## Objective

The full funnel is instrumented with consistent, well-named events so you can
measure activation, retention, conversion, and the growth loops — privacy-
respecting, no PII leakage, with a defined event taxonomy that product decisions
can actually run on.

## Why it matters

A $1B valuation is argued with numbers: activation rate, D1/D7/D30 retention,
conversion to paid, K-factor, revenue cohorts. If the funnel isn't instrumented
consistently, you're flying blind and can't prove traction to anyone — including
yourselves. This is the measurement layer the growth and monetization work
depends on.

## Instructions

1. **Define the event taxonomy** before adding events. A documented schema
   (`docs/analytics-events.md`): event name (consistent `object_action` naming),
   when it fires, properties, and which funnel/metric it feeds. No ad-hoc
   one-off events.
2. **Instrument the funnels:**
   - **Acquisition:** landing view, source/referrer, ref-param capture (ties to
     [23 — growth](23-growth-virality.md)).
   - **Activation:** forge_started → forge_succeeded (the "aha" from
     [21 — onboarding](21-onboarding-first-run.md)) → agent_saved → agent_shared.
   - **Engagement/retention:** return visits, session depth, feature adoption
     (animate, embed, brain, chat).
   - **Monetization:** checkout_started → payment_succeeded/failed, subscription
     events, creator earnings events (ties to
     [24 — monetization](24-monetization-completeness.md)).
   - **Growth loops:** share_clicked, embed_installed, embed_impression,
     referral_signup, and a computed K-factor.
3. **Identity & sessions.** Tie events to a stable anonymous ID pre-auth and
   merge to the user on sign-in (PostHog supports this). Don't double-count.
4. **Privacy & compliance.** No PII, no secrets, no wallet private data, no full
   addresses where avoidable in event props. Respect Do-Not-Track and provide a
   cookie/analytics consent path if the audience requires it. Mask sensitive
   fields. Document what's collected.
5. **Server-side events** for things the client can't be trusted for (payment
   settled, on-chain confirmed) so revenue metrics are accurate even if the
   client drops.
6. **Dashboards.** Build/define the core dashboards: activation funnel, retention
   cohorts, conversion funnel, growth-loop metrics, revenue. Keep product
   analytics (PostHog) distinct from ops metrics
   ([11 — observability](11-observability.md)).
7. **Verify events fire** correctly end-to-end in PostHog (use the live events
   view) for each funnel step — no missing, misnamed, or duplicate events.

## Definition of done

- [ ] `docs/analytics-events.md` defines the full event taxonomy (naming, props,
      funnel mapping).
- [ ] Acquisition, activation, engagement, monetization, and growth-loop events
      are instrumented per the taxonomy and verified firing in PostHog.
- [ ] Anonymous→identified merge works without double-counting.
- [ ] Privacy honored: no PII/secrets in props, DNT/consent respected, collection
      documented.
- [ ] Revenue/settlement events are captured server-side for accuracy.
- [ ] Core dashboards (activation, retention, conversion, growth, revenue) exist
      or are defined and reproducible.
- [ ] Each funnel step verified end-to-end in the live events view.
- [ ] `npm test` passes. Changelog: skip (internal) unless a user-facing consent
      UI shipped.
