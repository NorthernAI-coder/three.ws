# Task 05 — Programmatic SEO: make every agent, skill, and coin crawlable

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track B —
> Virality.** Coordinate with `03` (OG/meta endpoints) and `04` (leaderboard as a landing
> surface). Independent otherwise.

## The thesis

The platform's growth surface area is its user-generated content — thousands of agents,
skills, launches, avatars. Today almost none of it is crawlable: agent pages render
client-side, marketplace listings have no structured data, and there are no high-intent
content/landing pages. A $1B consumer platform earns a large share of acquisition from
organic search; right now that channel is near zero. This task turns UGC into an indexable,
compounding acquisition engine.

## What exists today (read first)

- **Static-page SEO only.** [scripts/inject-seo-meta.mjs](../../scripts/inject-seo-meta.mjs)
  backfills title/description/OG/JSON-LD onto **static** pages from
  [data/pages.json](../../data/pages.json). It does nothing for dynamic entity pages.
- **Blog + changelog feeds exist** — `blog/` (auto-generated from `.md`),
  `public/changelog.{json,xml}`, sitemap via [vercel.json](../../vercel.json) routes.
- **Discovery manifests exist** — `public/.well-known/openapi.yaml`, `agent-card.json`,
  `ai-plugin.json`, etc.
- **The gap:** agent profiles (`/agents/:id` / `/agent/:id`), skill listings, and
  launch/coin pages are client-rendered with generic meta and no structured data; there's no
  programmatic SEO sweep, no entity sitemaps, and no high-intent content/tutorial landing pages
  to rank for "3D AI agent", "monetize an AI skill", "launch an agent token", etc.

## What to build

1. **Crawlable entity pages.** Ensure agent, skill, and launch/coin detail pages serve real,
   entity-specific `<title>`, meta description, canonical URL, OG/Twitter tags (reuse the
   dynamic OG endpoints from `03`), and **JSON-LD structured data** appropriate to the type
   (e.g. `Product`/`Offer` with real price + rating for skills once `07` ships reviews;
   `Person`/`CreativeWork` for agents). If pages are client-rendered, add server-rendered
   meta/SSR or prerendering for crawlers so the head is correct without a JS execution — pick
   the approach that fits the existing Vercel setup and document it. No cloaking: served
   content must match what users see.
2. **Entity sitemaps.** Generate and serve sitemaps (or a sitemap index) covering live agents,
   public skills, and launches, refreshed on a sane cadence (a build step and/or cron). Wire
   into `robots.txt` / [vercel.json](../../vercel.json).
3. **High-intent content/landing pages.** Add a small set of genuinely useful, real-content
   pages targeting high-intent queries (e.g. "make your first 3D AI agent", "monetize a skill
   with x402", "launch an agent token"). Real content, internal links to the product, correct
   meta — extend the existing blog/static pipeline; don't bolt on a new CMS.
4. **Structured data for the catalog.** Add the marketplace/skill structured data and a
   machine-readable catalog where it helps discovery, consistent with the existing
   `.well-known` manifests.

## Hard rules specific to this task

- **No doorway/spam pages, no keyword-stuffed thin content.** Every generated/landing page
  must be genuinely useful and accurate, or it hurts the domain. Quality over volume.
- **$THREE only** in token copy. Coin pages render runtime launch-record mints (allowed); never
  hardcode/promote a specific non-$THREE mint in templates or content.
- Don't regress `npm run audit:pages` (route ↔ manifest parity) — register new routes in
  [data/pages.json](../../data/pages.json).

## Definition of done

README DoD, plus: an agent page, a skill page, and a coin page each return correct
entity-specific head + valid JSON-LD (validate with a structured-data testing tool); sitemaps
list live entities and are referenced from robots/sitemap config; the new content pages are
live, useful, internally linked, and pass `audit:pages`. Changelog (`improvement`/`docs`).
Self-review, then improve the weakest entity type's metadata.

Delete this file when done.
