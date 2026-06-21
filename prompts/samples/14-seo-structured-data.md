# 14 — SEO & structured data

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/production-1b/00-README.md`
> for shared context.

## Why this matters for $1B

Organic search and well-formed link previews are the cheapest, most durable growth
channel a platform has. Unique titles and descriptions win impressions; Open Graph and
Twitter cards turn every shared link into an ad; JSON-LD structured data earns rich
results; canonicals and a clean sitemap keep crawlers efficient. With ~125 pages, the
compounding cost of missing or duplicate metadata is enormous — and increasingly,
LLM-driven discovery reads `llms.txt`. A $1B platform is fully indexable and previews
beautifully everywhere.

## Mission

Ensure every canonical, indexable page has a unique title and meta description, correct
Open Graph + Twitter cards, valid JSON-LD, a self-referencing canonical, and that the
sitemap, robots, and llms.txt all reflect reality — leaning on the existing injection
tooling rather than hand-editing 125 files.

## Map (trust but verify — files move)

- **SEO injectors (the engine — use these)** — [scripts/inject-seo-meta.mjs](../../scripts/inject-seo-meta.mjs)
  (idempotently backfills `<title>`, description, canonical, OG/Twitter, WebPage/WebSite
  JSON-LD; never overwrites existing tags; re-points stale static OG images at
  `/api/page-og`), [scripts/inject-blog-seo.mjs](../../scripts/inject-blog-seo.mjs) (blog
  posts). Run via `npm run seo:meta`.
- **Catalog (single source of copy)** — [data/pages.json](../../data/pages.json) feeds
  the injector, sitemap, and llms.txt. Titles/descriptions live here — edit copy here, not
  in 125 HTML heads.
- **Page index build** — `npm run build:pages` ([scripts/build-page-index.mjs](../../scripts/build-page-index.mjs)),
  audited by [scripts/audit-page-index.mjs](../../scripts/audit-page-index.mjs) (`npm run audit:pages`).
- **Discovery surfaces** — [public/sitemap/index.html](../../public/sitemap/index.html)
  (human sitemap), [public/robots.txt](../../public/robots.txt),
  [public/llms.txt](../../public/llms.txt) + [public/llms-full.txt](../../public/llms-full.txt).
- **Dynamic OG cards** — `/api/page-og` (per-page social image) referenced by the injector.
- **Routing (route → file resolution)** — [vercel.json](../../vercel.json) `routes` table,
  which the injector uses to map a route to its HTML file.

## Do this

1. **Coverage scan.** `npm run seo:meta` in dry-run (read the script's flags) to see which
   pages are missing title / description / canonical / OG / Twitter / JSON-LD. Cross-check
   counts: grep `pages/*.html` for `rel="canonical"`, `og:title`, `application/ld+json` and
   compare against the indexable page count to find the gaps.
2. **Fix copy at the source.** For every indexable page, ensure `data/pages.json` has a
   **unique**, descriptive title (≤ ~60 chars) and meta description (~120–160 chars) — no
   duplicates, no boilerplate, real human language describing that page's value. This is
   where you edit copy.
3. **Inject.** Run `npm run seo:meta` (write mode) to backfill title, description,
   canonical, OG, Twitter, and WebPage/WebSite JSON-LD across pages. Confirm it filled gaps
   without clobbering hand-authored tags.
4. **Richer structured data where it earns rich results.** Beyond WebPage/WebSite, add the
   correct schema.org type to high-value templates: `BreadcrumbList` on nested pages,
   `Product`/`Offer` on marketplace listings, `Article`/`BlogPosting` on blog posts,
   `SoftwareApplication`/`Organization` where appropriate. Validate every block.
5. **Canonicals & duplicates.** Every page self-references a canonical absolute URL;
   collapse duplicate/parameterized routes onto one canonical. Ensure non-indexable surfaces
   (embeds, widgets, kiosk) are `noindex` and excluded from the sitemap.
6. **Sitemap, robots, llms.** Regenerate via `npm run build:pages` so the sitemap matches
   the live page set; verify `robots.txt` points to the sitemap and doesn't block indexable
   routes; confirm `llms.txt` / `llms-full.txt` reflect current pages and product framing.
7. **Validate previews & markup.** Validate JSON-LD (Google Rich Results / Schema.org
   validator) on a sample of each template; check OG/Twitter previews resolve (per-page
   `/api/page-og` image renders, not a single static fallback). `npm run dev` and spot-check
   `<head>` on home, forge, marketplace, a blog post, and an agent profile.
8. **Verify & ship.** Run `npm run audit:pages` (strict) and `npm test`. Add a changelog
   entry if the SEO improvements are user-visible (e.g. share-preview cards); `npm run build:pages`.

## Must-not

- Do not duplicate titles/descriptions across pages — each must be unique and descriptive.
- Do not hand-edit metadata into 125 HTML heads — edit `data/pages.json` and run the injector.
- Do not let the injector overwrite a page's existing hand-authored tags.
- Do not index embed/widget/kiosk surfaces or list them in the sitemap.
- Do not ship invalid JSON-LD; validate every block before claiming done.
- Do not reference any coin other than `$THREE` in any title, description, or structured data.

## Acceptance (all true before claiming done)

- [ ] Every indexable page has a unique, descriptive title and meta description (no duplicates).
- [ ] Every indexable page has a self-referencing canonical, OG + Twitter cards, and valid JSON-LD.
- [ ] High-value templates carry the right schema type (Product/Article/Breadcrumb/etc.), all validated.
- [ ] Per-page `/api/page-og` social images render (no single static fallback on shared links).
- [ ] Sitemap matches the live page set; robots points to it; llms.txt/llms-full.txt are current.
- [ ] Non-indexable surfaces are `noindex` and excluded from the sitemap.
- [ ] `npm run audit:pages` (strict) and `npm test` pass; changelog updated and `npm run build:pages` is clean.
