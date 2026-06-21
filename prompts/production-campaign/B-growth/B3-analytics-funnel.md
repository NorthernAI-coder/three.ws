# B3 — Analytics & Funnel Instrumentation

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:**
B1 (it emits the activation events this funnel reads — runs better after, not hard-blocked).

## Why this matters for $1B
"We think users like it" is not data, and you cannot raise a billion-dollar valuation on a
vibe. The bar (`00b-the-bar.md` §5) is unambiguous: **every primary surface emits real
analytics events into a funnel you can read.** Without it, every other growth decision in this
track — which onboarding wins, which share card converts, which lifecycle email earns a return
— is a guess. This prompt builds the one clean taxonomy that turns three.ws's behavior into
measurable acquisition → activation → retention → revenue, and a dashboard that makes it
legible. It's the instrument panel the whole campaign flies by.

## Current state (read before you write)
- `src/acquisition-analytics.js` exists and exports `trackLandingView()` (fires
  `LANDING_VIEWED` as the first activation step), `wireCtaTracking()` (delegated `data-cta`
  click capture → `CTA_CLICKED`), and `initAcquisitionAnalytics()`. It imports `track`,
  `ANALYTICS_EVENTS`, `FUNNELS`, and `trackFunnelStep` from `src/analytics.js` — **read that
  module**: it's the core event bus and taxonomy. Do NOT fork either; extend them.
- `src/app.js` has a view beacon (grep "view beacon for analytics" ~line 1262) — understand
  what's already fired and from where, so you don't double-count or invent a parallel path.
- The gap: the taxonomy is partial (a couple of events, one funnel). There is no end-to-end
  acquisition→activation→retention→revenue funnel covering Forge, walk, agents, marketplace,
  x402 pay, and $THREE surfaces, and no dashboard to read it.

## Your mission
### 1. Define one clean event taxonomy (extend `ANALYTICS_EVENTS` / `FUNNELS`)
In `src/analytics.js`, formalize a small, consistent, namespaced event set across four funnel
stages — **acquisition** (landing viewed, referral arrived, share clicked-through),
**activation** (first-run shown, wow delivered, account created), **retention** (returned,
session N, gallery revisited), **revenue** (checkout started, $THREE-gated upgrade,
x402 paid, mint/launch). Names are documentation: `forge.free.generate.succeeded`, not
`event7`. Define the `FUNNELS` map so each stage's ordered steps are explicit and queryable.

### 2. Instrument every primary surface — additively
Add event emission on Forge (free + high-quality), the walk companion, agent profiles, the
marketplace, x402 checkout, and the $THREE-gated upgrades. Prefer the existing `data-cta`
attribute pattern (`wireCtaTracking` already delegates) so most CTAs are captured by markup,
not bespoke handlers. For surfaces lacking it, add `data-cta`/`data-funnel-step` attributes —
**additive only**, no behavior change. Coordinate with B1 (activation events) and B6 (home
CTAs): use the same taxonomy, don't define a second one.

### 3. Confirm the event sink is real (no fake telemetry)
Trace where `track()` actually sends — a real beacon/endpoint (Axiom is already wired server-
side per `00b-the-bar.md` §1; there may be a client `/api/` collector). If events are
currently swallowed, wire a real, batched, `sendBeacon`-based sink to a real endpoint. No
`console.log` analytics, no dropped events. Respect Do-Not-Track and any consent gate
(coordinate with G-trust if a consent banner exists).

### 4. Build a funnel dashboard surface
Create a real dashboard page (fit it into `src/dashboard-next/` to match the existing pattern,
or a dedicated `/analytics` page) that reads aggregated funnel data from a real query endpoint
and renders the four-stage funnel with conversion rates, drop-off, and a time range. Every
state designed: loading (skeleton), empty ("no events yet — here's how events flow in"), error
(actionable), populated (on-token charts). This is what makes the data *readable*, per the bar.

### 5. Make it privacy-honest and resilient
Boundary-handle the sink (network failure must never break a user surface — fire-and-forget,
buffered). No PII in events. Sampling/rate-limit if volume warrants. Document the taxonomy
inline so the next agent emits correctly.

## Definition of done
Maps to `00b-the-bar.md` §5 (activation measured, funnel readable) and §4 (honest UI, inputs
validated). Specifically: a single coherent taxonomy in `src/analytics.js` covering all four
funnel stages; every primary surface emits real events visible in the network tab going to a
real sink; a dashboard renders the acquisition→activation→retention→revenue funnel with real
conversion numbers and all five states; DNT/consent respected; no double-counting with the
existing `app.js` beacon; no console errors. **Also inherits the global definition of done in
`00-README-orchestration.md`.**

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs — no fabricated funnel numbers in the dashboard, real
aggregates only. `$THREE` is the only coin. Design tokens only for the dashboard. Stage
explicit paths only (never `git add -A`); re-check `git diff --staged` before commit. Own the
analytics lane (`src/analytics.js`, `src/acquisition-analytics.js`, the dashboard page);
extend the existing modules, never fork them — adding `data-cta` attributes to other surfaces
is additive and in-lane.

## When finished
Run the five self-review checks. Ship one improvement — e.g. a per-surface conversion sparkline
on the dashboard, or a shareable "this week's activation rate" tile. Append a
`data/changelog.json` entry if the dashboard is user-visible (tag `feature`/`infra`). Then
delete this prompt file (`prompts/production-campaign/B-growth/B3-analytics-funnel.md`) and
report the taxonomy you shipped, which surfaces are instrumented, and the dashboard URL — the
seam B4, B5, and B6 measure their work against.
