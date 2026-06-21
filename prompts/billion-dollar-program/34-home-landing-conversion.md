# 34 — Home / landing conversion

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

The homepage is where ad spend, press, and word-of-mouth all land. A first-time
visitor decides in about 5 seconds whether to stay. If the hero doesn't instantly
communicate "give your AI a body" and offer an obvious, fast next action, the
acquisition funnel dies before activation (prompt 33) even begins. A clear,
fast-loading, mobile-first, socially-proven landing page is the cheapest growth lever
the platform has.

## Mission

Make the home page make a cold visitor understand the product in 5 seconds and act:
sharp hero, one above-the-fold primary CTA, a live demo they can touch, credible
social proof, benefit-led copy, fast LCP, and flawless mobile.

## Map (trust but verify — files move)

- **Home page** — [pages/home.html](../../pages/home.html) (`/`). Hero h1 currently
  "The 3D agent layer of the internet." with bullets Create/Embed/Earn and the
  `.hero-cta-row` (`/create`, `/forge`, `#embed`, `/tour`). All inline `<style>` +
  `<script type="module">`.
- **Live demo embeds** — [src/home-forge.js](../../src/home-forge.js) (mini Forge:
  real `/api/forge` text→3D in-page), [src/forge-showcase.js](../../src/forge-showcase.js)
  ("Fresh from the Forge" community feed), [src/home-live-token.js](../../src/home-live-token.js)
  (live $THREE price), [src/api-playground.js](../../src/api-playground.js) and the
  `<agent-3d>` web component embed (`agent-3d/latest/agent-3d.js`).
- **Social proof / press strip** — the `.press-row` block in
  [pages/home.html](../../pages/home.html) (Anthropic, Coinbase, IBM, AWS, Google
  Cloud, Alibaba Cloud, Solana, CoinMarketCap, CoinGecko, HackerNoon) with SVGs in
  [public/featured-logos/](../../public/featured-logos).
- **CTA + funnel instrumentation** — `data-cta` / `data-cta-loc` attributes on every
  CTA, consumed by [src/acquisition-analytics.js](../../src/acquisition-analytics.js)
  → [src/analytics.js](../../src/analytics.js) (`CTA_CLICKED`, `LANDING_VIEWED`).
- **Performance budget** — Core Web Vitals work lives in
  `prompts/production-1b/11-*`; SEO/structured data in `prompts/production-1b/12-*`.

## Do this

1. **Open `/` cold on mobile and desktop** (`npm run dev`; emulate 320 / 768 / 1440).
   Read the hero as a stranger: in 5 seconds, is it obvious this turns your AI into an
   embeddable 3D avatar? Sharpen the h1/sub/bullets toward the plain promise ("give
   your AI a body" — make a 3D agent, embed it anywhere) without losing the existing
   voice or the i18n `data-i18n-*` hooks.
2. **One unmistakable primary CTA above the fold.** The hero has four buttons; keep
   the primary "Build your agent" visually dominant and make the rest clearly
   secondary so the eye has one path. Verify each `href` resolves in `vercel.json` and
   carries `data-cta`/`data-cta-loc`.
3. **Prove it with a live demo, not a screenshot.** Confirm the mini-Forge
   (`home-forge.js`) and the `<agent-3d>` embed actually run real generations / render
   live on load, with real elapsed time and designed loading/empty/error states (no
   `setTimeout` fakery). The showcase strip hides itself when empty — verify it never
   shows a hollow row.
4. **Make social proof credible and honest.** Keep the press/partner strip truthful
   (only real, linkable mentions — the SVGs in `public/featured-logos/`); ensure logos
   are lazy, accessible (alt/label), and don't push down the hero. Do not invent or
   overstate any endorsement.
5. **Fast LCP.** The hero text/CTA must be the LCP and must not wait on the 3D embed
   or model-viewer scripts — defer/lazy-load heavy modules (tour director, model
   viewer, showcase) below the fold. Preload the hero font/critical CSS only. Confirm
   no layout shift from late-loading logos or demos.
6. **Mobile is first-class.** At 320px the hero, CTA, and one demo must be usable
   without horizontal scroll; the CTA stays reachable (sticky or repeated near the
   fold). Touch targets ≥44px; the press strip wraps, never overflows.
7. **Wire the funnel.** Every CTA fires `CTA_CLICKED` with `cta`/`location`; the page
   fires `LANDING_VIEWED` once with referrer + UTM (already in
   `acquisition-analytics.js`) — verify it loads on `/` and no PII leaks.
8. **Verify + changelog.** Lighthouse the page locally (LCP, CLS), run touched tests
   (`npx vitest run`), add a `data/changelog.json` entry for the conversion
   improvement, and run `npm run build:pages`.

## Must-not

- Do not invent press/partner logos or overstate endorsements — only real, linkable
  mentions; this is a trust surface, not a dark pattern.
- Do not block LCP on the 3D embed, model-viewer, or any third-party script.
- Do not ship a fake/looping demo or a `setTimeout` progress bar — the demo is the
  real pipeline or it is not shown.
- Do not reference any coin other than `$THREE` (the live token widget is $THREE only).
- Do not strip `data-i18n-*`, `data-cta`, or accessibility attributes from existing
  elements.

## Acceptance (all true before claiming done)

- [ ] A cold visitor understands "give your AI a body" in ≤5s; one dominant
      above-the-fold CTA; all CTA `href`s resolve.
- [ ] The live demo runs the real pipeline on load with designed loading/empty/error
      states; the showcase never shows a hollow row.
- [ ] Press/partner proof is truthful, accessible, lazy, and does not push the hero
      below the fold.
- [ ] LCP is the hero (not the 3D embed); no CLS from late logos/demos; verified in
      Lighthouse locally.
- [ ] Usable at 320 / 768 / 1440 with no horizontal scroll and ≥44px touch targets.
- [ ] `LANDING_VIEWED` + every `CTA_CLICKED` fire with no PII; no console
      errors/warnings.
- [ ] Touched tests pass; changelog entry added and `npm run build:pages` clean.
