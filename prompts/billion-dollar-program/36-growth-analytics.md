# 36 — Growth analytics instrumentation

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

You cannot grow what you cannot measure. To scale acquisition, activation, and
retention deliberately, every meaningful step in the funnel must emit a clean,
consistently-named event — and never leak PII, or the platform becomes a privacy
liability instead of a $1B business. three.ws already has the spine (PostHog +
Vercel Web Analytics injected by Vite, a typed event taxonomy in `src/analytics.js`,
a first-party error reporter). The job is to complete coverage across the full funnel
without drift and without leaking.

## Mission

Complete privacy-respecting, consistently-taxonomied event instrumentation across the
activation → conversion → retention funnels, with dashboards/funnels that line up and
zero PII in any event.

## Map (trust but verify — files move)

- **Event taxonomy + facade (source of truth)** — [src/analytics.js](../../src/analytics.js)
  (`ANALYTICS_EVENTS`, `FUNNELS.activation`, `FUNNELS.three`, `track()`,
  `trackFunnelStep()`, `identifyUser()` / `resetIdentity()`, `trackError()`,
  `shortWallet()`). `track()` validates against the catalog and rejects unknown
  events — never bypass it.
- **Acquisition instrumentation** — [src/acquisition-analytics.js](../../src/acquisition-analytics.js)
  (`LANDING_VIEWED` once + delegated `CTA_CLICKED` over `data-cta`/`data-cta-loc`).
- **Existing call sites** — [src/wallet-auth.js](../../src/wallet-auth.js),
  [src/account.js](../../src/account.js), [src/create-agent.js](../../src/create-agent.js),
  [src/marketplace.js](../../src/marketplace.js), [src/three-token-page.js](../../src/three-token-page.js),
  [src/swap-jupiter.js](../../src/swap-jupiter.js), [src/agent-detail.js](../../src/agent-detail.js),
  [src/dashboard-next/shell.js](../../src/dashboard-next/shell.js).
- **Provider injection (do not duplicate)** — the `posthog-analytics`,
  `vercel-analytics`, and `client-error-reporter` plugins in
  [vite.config.js](../../vite.config.js) (PostHog snippet, `person_profiles:
  'identified_only'`, ingest proxied through `/ingest`).
- **Server-side event/error sinks** — [public/error-reporter.js](../../public/error-reporter.js)
  → [api/client-errors.js](../../api/client-errors.js); per-surface analytics in
  [api/marketplace/analytics.js](../../api/marketplace/analytics.js),
  [api/walk/analytics.js](../../api/walk/analytics.js),
  [api/creators/skill-analytics.js](../../api/creators/skill-analytics.js).
- **Privacy reference** — [public/legal/privacy.html](../../public/legal/privacy.html)
  ("no IPs, no fingerprints", "no third-party advertising cookies"). Instrumentation
  must stay true to this.

## Do this

1. **Inventory before adding.** Grep for `track(`, `trackFunnelStep(`, `data-cta`, and
   `ANALYTICS_EVENTS` to map what already fires. Do not reinvent the spine — extend
   `src/analytics.js`. List the funnel gaps (any real step with no event).
2. **Complete the funnels by journey.** Ensure each stage emits a taxonomy event:
   acquisition (`landing_viewed`, `cta_clicked`), activation (`agent_created`,
   first-generation, checklist steps from prompt 33), conversion (the `token_*` and
   pay/x402 events from prompt 35), retention (return visits, key surfaces opened via
   `SURFACE_OPENED`, share actions). Add missing event names to `ANALYTICS_EVENTS` and
   wire them into `FUNNELS` so PostHog funnel insights line up automatically.
3. **One taxonomy, no drift.** All events go through the validating `track()` /
   `trackFunnelStep()` facade — no raw `window.posthog.capture()` ad-hoc strings in
   feature code. Names are snake_case and live only in `ANALYTICS_EVENTS`.
4. **PII audit — hard requirement.** No raw wallet addresses, emails, prompt text, or
   tokens as event props. Truncate wallets with `shortWallet()`; drop free-text
   prompts (send a length/category, not content). Verify `person_profiles:
   'identified_only'` and that `identifyUser()` is called only after auth resolves
   with non-PII identifiers. Reconcile with `public/legal/privacy.html`.
5. **Fail-safe by design.** Every analytics call must no-op when PostHog is absent or
   blocked (`window.__posthog_blocked`) — verify the app works identically with an ad
   blocker on, in an embed iframe, and offline. Analytics can never break the page.
6. **Verify events fire in a browser** (`npm run dev`): with PostHog network calls
   visible, walk landing → create → a free generation → a pay flow and confirm each
   expected event fires once with correct, PII-free props. Confirm dedupe (e.g.
   `LANDING_VIEWED` fires exactly once).
7. **Dashboards/funnels.** Document the canonical activation, conversion, and
   retention funnels (the `FUNNELS` map is the contract) so PostHog funnel/insight
   definitions match the code. Keep this in the existing analytics docs, not a new
   throwaway file.
8. **Test + changelog.** Run touched tests (`npx vitest run`, including any
   `tests/**/analytics*`); add a `data/changelog.json` entry only if a user-visible
   surface changed (pure instrumentation is internal and usually skips the changelog —
   see `/CLAUDE.md`). Run `npm run build:pages` if you touched anything that feeds it.

## Must-not

- Do not send PII as event props — no raw wallets, emails, prompt/message text, or
  tokens. Truncate and categorize.
- Do not bypass the `track()` facade with ad-hoc `posthog.capture()` calls or invent
  event names outside `ANALYTICS_EVENTS`.
- Do not add a second analytics vendor, advertising pixel, or fingerprinting — stay
  within the existing PostHog + Vercel stack and the privacy policy.
- Do not let an analytics failure (blocked/offline/embed) break or block the app.
- Do not reference any coin other than `$THREE` in event names or props.

## Acceptance (all true before claiming done)

- [ ] Every funnel stage (acquisition → activation → conversion → retention) emits a
      taxonomy event through `track()` / `trackFunnelStep()`; gaps closed.
- [ ] No ad-hoc event strings or raw `posthog.capture()` in feature code; all names in
      `ANALYTICS_EVENTS`.
- [ ] PII audit passes — no raw wallets/emails/prompt text/tokens in any event;
      consistent with `public/legal/privacy.html`.
- [ ] App behaves identically with PostHog blocked, in an embed iframe, and offline
      (no errors, no broken flows).
- [ ] Each expected event verified firing once with PII-free props in a real browser
      session.
- [ ] `FUNNELS` matches documented PostHog funnels; docs updated in place (no
      throwaway file).
- [ ] Touched tests pass; changelog handled per `/CLAUDE.md` and `npm run build:pages`
      clean if it was touched.
