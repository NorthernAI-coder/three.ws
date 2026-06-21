# 45 · Analytics & Conversion Funnels

## Mission
Measure what matters so growth is data-driven: instrument acquisition → activation → revenue →
retention, with privacy-respecting analytics and honest dashboards.

## Context
- Usage events pipeline exists (`api/cron/flush-usage-events`). Onboarding wizard (prompt 22) and
  homepage (prompt 42) are the key funnels. Consent handling from prompt 44.

## Tasks
1. **Event taxonomy:** define a clean, documented event schema (names, props) for the core funnels:
   landing → signup → avatar created → agent created → embed deployed → first payment → repeat use.
   Avoid event sprawl; one source of truth.
2. **Instrumentation:** emit those events from the real flows (non-blocking, consent-gated). Reuse the
   usage-events pipeline rather than bolting on a second system where possible.
3. **Funnels + retention:** build (or wire a provider for) funnel + cohort/retention views for the core
   journeys; surface drop-off points.
4. **Revenue analytics:** track payment volume, conversion to paid, $THREE-perk usage, creator earnings
   — tied to real settlement data, not estimates.
5. **Privacy:** respect consent + Do-Not-Track; no PII in analytics; document what's collected (sync
   with prompt 44).
6. **Actionability:** a dashboard the team checks daily; alert on funnel regressions (sync prompt 36).

## Acceptance
- Documented event taxonomy emitted from real flows, consent-gated + non-blocking.
- Funnel + retention + revenue views exist and reflect real data; drop-off visible.
- No PII in analytics; collection documented; regression alerts wired.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No fabricated metrics; analytics reflect real events. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
