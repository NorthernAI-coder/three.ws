# 22 — SEO & shareability

**Phase 6. [parallel-safe]** with 23–26.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform, 125 pages. There's
already SEO tooling: `scripts/inject-seo-meta.mjs`, `scripts/inject-blog-seo.mjs`,
`scripts/build-page-index.mjs`, structured data in page heads, a blog
(`blog/`), and a changelog feed. Read [CLAUDE.md](../../CLAUDE.md) — "What would
make someone screenshot this and share it?" The only coin is **$THREE**.

## Objective

Every page is discoverable and every shareable artifact (agent, generated model,
launch, profile) renders a rich, correct social card. Search engines and LLMs can
crawl and understand the site; links pasted into X/Discord/Telegram unfurl into
something people click.

## Why it matters

Organic discovery + viral link-unfurls are the cheapest acquisition channels and
the ones that compound. A $1B consumer/crypto platform lives or dies on shared
links rendering beautifully and on ranking for its category. This is the demand
side of the growth equation.

## Instructions

1. **Audit current SEO.** Run the existing tooling and check coverage:
   ```bash
   npm run seo:meta            # inject blog + page SEO, rebuild index
   npm run build:pages         # page index + changelog feeds
   ```
   Verify every page has: unique `<title>`, meta description, canonical URL,
   `og:*` + `twitter:card` tags, and valid JSON-LD where relevant.
2. **Dynamic OG images.** Shareable entities (agent profile, generated model,
   launch, leaderboard rank) need a per-entity OG image — ideally a rendered
   preview of the actual 3D agent. Build an OG-image endpoint (`api/og/*`) that
   generates a branded card with the entity's real data/thumbnail. No generic
   fallback for things that have a real preview.
3. **Sitemap & robots.** Generate a complete `sitemap.xml` from the page index +
   dynamic entities, and a correct `robots.txt`. Submit-ready. Ensure
   noindex on what shouldn't be indexed (auth, internal).
4. **Structured data.** Add/verify JSON-LD: `WebSite` + `SearchAction` on home,
   `Product`/`SoftwareApplication` where it fits, `BreadcrumbList`, `Article` on
   blog posts, `FAQPage` on FAQ/docs. Validate with the Rich Results test format.
5. **Crawlability for SPA-ish surfaces.** Anything rendered client-only that
   should rank needs SSR/prerender or a static fallback so crawlers and link
   unfurlers (which don't run much JS) get real content. Confirm OG tags are in
   the initial HTML, not injected post-load.
6. **LLM/agent discoverability.** Ensure `llms.txt` (or equivalent) and clean
   semantic HTML so AI crawlers represent the platform correctly — relevant for
   an agent platform. Cross-check the x402 discovery indexing already in place
   (your memory: CDP Bazaar / x402scan / 402index).
7. **Performance ties in.** Core Web Vitals are a ranking factor — keep
   [12](12-frontend-performance.md) consistent.
8. **Verify unfurls.** Paste representative URLs (home, an agent profile, a
   generated model, a blog post) into a card validator / a real X/Discord/
   Telegram message and confirm the card renders with correct image, title,
   description.

## Definition of done

- [ ] Every page has unique title, description, canonical, OG + Twitter card, and
      valid JSON-LD where relevant (verified, not assumed).
- [ ] Per-entity dynamic OG images render real previews for agents/models/
      launches/profiles via an `api/og/*` endpoint.
- [ ] Complete `sitemap.xml` (static + dynamic) and correct `robots.txt`; noindex
      on private routes.
- [ ] JSON-LD validates for home, blog, and key entity types.
- [ ] Shareable surfaces expose OG tags in initial HTML (crawler/unfurl-safe).
- [ ] `llms.txt`/semantic HTML supports AI crawlers; x402 discovery intact.
- [ ] Real unfurl test passed for 4+ representative URLs.
- [ ] `npm run build:pages` clean; `npm test` passes.
- [ ] Changelog: `improvement` entry ("Rich social previews and better
      discoverability").
