# 16 — SEO, metadata, Open Graph & structured data

> Part of **Road to $1B** (`prompts/road-to-1b/`). Read `00-README.md` and `/CLAUDE.md` first.

**Phase:** 3 — Experience quality
**Owns:** `pages/` `<head>`, `scripts/inject-seo-meta.mjs`, `scripts/inject-blog-seo.mjs`, sitemap, OG image generation.
**Depends on:** none.  ·  **Parallel-safe with:** 12, 13, 14, 15, 17.

## Why this matters for $1B
Organic discovery and shareability are free, compounding growth. A platform that
competes with Vercel/Linear/Stripe has perfect titles, descriptions, canonical URLs,
rich OG cards, and structured data on every route. This is upstream of the $1B funnel.

## Mission
Give every public route correct, unique metadata, Open Graph/Twitter cards with real
preview images, a complete sitemap, and valid structured data.

## Map
- Existing SEO pipeline: `npm run seo:meta`, `scripts/inject-seo-meta.mjs`,
  `scripts/inject-blog-seo.mjs`, `scripts/build-page-index.mjs`, `data/pages.json`.
- Public assets: `public/` (check for `sitemap.xml`, `robots.txt`).

## Do this
1. Audit every route in `data/pages.json` for unique `<title>`, meta description,
   canonical URL, and lang; fill gaps via the inject-seo pipeline (extend it, don't
   hand-edit generated output).
2. Add Open Graph + Twitter card tags site-wide; generate per-route OG preview images
   (dynamic where content is dynamic — agents, coins, avatars).
3. Add JSON-LD structured data appropriate per surface (Organization, WebSite +
   SearchAction, Product/Offer for marketplace skills, BreadcrumbList, Article for blog).
4. Ensure `sitemap.xml` covers all live routes and `robots.txt` is correct; submit-ready.
5. Verify with a rich-results / OG validator on the top 10 routes; fix warnings.
6. Confirm dynamic pages render meta server-side or are prerendered (no blank-shell SEO).

## Must-not
- Do not duplicate titles/descriptions across routes.
- Do not hand-edit files the inject scripts generate — change the source/script.

## Acceptance
- [ ] Every route has unique title/description/canonical + OG/Twitter + JSON-LD.
- [ ] Sitemap + robots complete; OG images render in a validator for top routes.
- [ ] `npm run build` + `npm test` green; changelog `improvement` entry.
