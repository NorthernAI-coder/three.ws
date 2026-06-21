# 43 — Brand, press & social proof

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Trust is the conversion multiplier. A first-time visitor decides in seconds whether
three.ws is a serious company or a side project — and the signals that decide it are
brand consistency, real press coverage, and visible social proof. three.ws has genuine
coverage (Business Insider, IBM partnership, Yahoo Finance, Crunchbase, Vogue, KuCoin
listing) and partner logos already in the repo, but they're scattered in the footer and
a `/news` feed instead of working as a coherent credibility story. Surfacing them well
turns existing assets into acquisition leverage.

## Mission

Lock brand consistency across the platform (logo, OG images, voice), build a real press
page that surfaces the existing coverage, and weave testimonials/case studies and trust
signals into the high-intent surfaces.

## Map (trust but verify — files move)

- **Brand mark** — [public/brand.js](../../public/brand.js) (universal top-left brand
  chip; opt-out via `data-no-brand-mark`), logos in [public/](../../public)
  (`logo.png`, `favicon.svg`, `favicon.ico`, `pwa-192x192.png`, `pwa-512x512.png`).
- **Partner / featured logos** — [public/featured-logos/](../../public/featured-logos)
  (`anthropic.svg`, `coinbase.svg`, `solana.svg`, `googlecloud.svg`,
  `alibabacloud.svg`, `coinmarketcap.svg`, `hackernoon.svg`), plus
  [public/ibm-partner-logo.png](../../public/ibm-partner-logo.png).
- **Existing press links** — [public/footer.html](../../public/footer.html) (Business
  Insider, IBM community, Yahoo Finance, Crunchbase, Vogue, KuCoin, TradingView),
  echoed in [public/features.json](../../public/features.json).
- **News / announcements** — [public/news/](../../public/news) (~107 items),
  [public/news/index.html](../../public/news/index.html) ("News & Announcements"),
  build via `npm run build:news`; [public/launch-week.html](../../public/launch-week.html).
- **Default OG image** — [public/og-image.png](../../public/og-image.png),
  [public/ibm-og.png](../../public/ibm-og.png); per-surface OG endpoints `api/*-og.js`
  (see prompt 38).
- **Voice / brand copy** — [public/llms.txt](../../public/llms.txt) and home copy in
  [pages/home.html](../../pages/home.html) (the canonical brand description).

## Do this

1. **Brand consistency audit.** Walk the main pages and confirm `brand.js` (or a native
   header) puts the same logo, same wordmark casing ("three.ws"), and same theme color
   on every standalone surface. Fix any page with a stray/old logo treatment or missing
   mark. Confirm favicon + PWA icons are consistent.
2. **OG image consistency.** Verify every shareable page has an `og:image` (default
   `og-image.png` or its per-surface `*-og.js` card) with consistent brand framing —
   same logo placement, type, and color. No page should fall back to a broken or
   off-brand preview when pasted into a social platform.
3. **Build a real press page.** Create `/press` (a static page under `public/`, routed in
   `vercel.json` like `/news`) that surfaces the existing coverage as a credible
   "as seen in" wall: outlet logos linking to the real articles already in the footer,
   plus the IBM partnership and the news feed. Pull from real data
   (`public/features.json` / footer links / `public/news/`) — no invented quotes or
   fabricated outlets.
4. **"As seen in" trust strip on high-intent surfaces.** Add a tasteful logo strip
   (using `public/featured-logos/` + real press outlets) to the home page and pricing
   page, linking through to the press page. Real partners/coverage only.
5. **Testimonials / case studies.** Surface real social proof — genuine user creations,
   real quotes, or verifiable usage stats from platform data (e.g. agents created,
   launches, embeds). Build a testimonials/case-study section sourced from real records;
   do not write fake testimonials or attribute quotes to people who didn't say them.
6. **Trust signals throughout.** Place credibility cues where decisions happen: security
   note near wallet/payment, "open source / MIT" near SDKs/docs, partner logos near the
   integration story, real counts near the marketplace. Each must link to something real.
7. **Voice consistency.** Align headline/CTA copy with the canonical brand description
   ("The 3D agent layer of the internet …" from the manifest/`llms.txt`). Remove
   off-brand or contradictory taglines.
8. Verify all new images via `npm run check:images`, run `npm run audit:pages` and
   `npm run seo:meta`, add a `data/changelog.json` entry (tag `feature`) for the press
   page + trust strip, and `npm run build:pages`.

## Must-not

- Do not fabricate press coverage, partner relationships, testimonials, or stats — only
  surface what's real and verifiable from the repo/platform data.
- Do not reference any coin other than `$THREE` in brand, press, or social-proof copy.
- Do not break the `brand.js` chromeless opt-out for embeds/iframes.
- Do not ship off-brand or broken OG images; every shareable page previews correctly.
- No placeholder logos, "logo here" boxes, or lorem-ipsum testimonials.

## Acceptance (all true before claiming done)

- [ ] Logo, wordmark casing, theme color, favicon, and PWA icons are consistent across all
      main standalone pages.
- [ ] Every shareable page has a consistent, on-brand `og:image` that previews correctly.
- [ ] A real `/press` page surfaces the existing coverage (real outlets → real articles)
      and is routed + linked from the footer/nav.
- [ ] An "as seen in" trust strip appears on home + pricing using real partner/press
      logos, linking to the press page.
- [ ] Testimonials/case-study section sourced from real data — no fabricated quotes/stats.
- [ ] Trust signals (security, OSS, partners, real counts) placed at decision points, each
      linking to something real.
- [ ] `check:images`, `audit:pages`, `seo:meta` clean; changelog updated; `build:pages` clean.
