# 30 — Analytics & growth instrumentation

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 6 — Growth & business
**Owns:** analytics layer (PostHog / Vercel Analytics integration), event taxonomy, funnel + retention dashboards.
**Depends on:** 28 (activation defined), 29 (funnel).  ·  **Parallel-safe with:** 31.

## Why this matters for $1B
You cannot grow what you cannot see. A rigorous, privacy-respecting event model turns
guesses into a compounding optimization loop across acquisition, activation, retention,
and revenue — the literal inputs to the $1B model.

## Mission
Instrument the full funnel with a clean, consistent event taxonomy and stand up the core
growth dashboards, without harming performance or privacy.

## Map
- Existing analytics (PostHog / Vercel Analytics — confirm which is wired in `src/`);
  they must stay off the critical render path (ties prompt 12).

## Do this
1. Define an event taxonomy (consistent names, props) for the key funnel: page_view →
   signup/connect → activation moment (prompt 28) → first purchase/launch → return.
2. Instrument those events across the real surfaces; verify they fire with correct props
   in the network tab — no double-counting, no PII in event payloads (ties prompt 05/32).
3. Build/configure the core dashboards: acquisition source, activation rate, funnel
   drop-off, D1/D7/D30 retention, revenue per surface.
4. Load analytics non-blocking and respect Do-Not-Track / consent (ties prompt 32).
5. Add a lightweight server-side event path for money events (purchases, launches) so
   revenue isn't dependent on client analytics.
6. Document the taxonomy so future features instrument consistently.

## Must-not
- No PII or secrets in events; no analytics on the critical render path.
- Do not invent vanity metrics — instrument decisions, not decoration.

## Acceptance
- [ ] Funnel + retention + revenue events fire correctly with a documented taxonomy.
- [ ] Core dashboards live; analytics non-blocking + consent-respecting.
- [ ] `npm test` green; changelog `improvement`/`infra` entry.
