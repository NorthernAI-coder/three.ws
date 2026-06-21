# B2 — SEO & Structured Data across all 125+ pages

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** none.

## Why this matters for $1B
Distribution is one of the five pillars (`00-README-orchestration.md`). A platform with 125+
genuinely useful surfaces that search engines and AI crawlers can't parse is invisible — it
compounds nothing. Correct metadata, canonical URLs, a complete sitemap, and JSON-LD
structured data are how Google, Bing, and increasingly the LLM crawlers (which `llms.txt`
exists to serve) understand what three.ws *is* and rank/cite it. This is the cheapest, highest-
leverage growth work in the campaign: it makes every other page you've already built
discoverable, shareable, and machine-readable — permanently.

## Current state (read before you write)
- `scripts/inject-seo-meta.mjs`, `scripts/inject-blog-seo.mjs`, and
  `scripts/build-page-index.mjs` already exist and are **already wired into `prebuild`** in
  `package.json` (`inject-blog-seo --write` → `build-page-index` → `audit-page-index --strict`
  → `inject-seo-meta --write`). There's also a `seo:meta` script. Read all three scripts and
  the `prebuild` chain before changing anything — the wiring exists; your job is to make the
  *output complete and correct on every page*, not to re-architect the pipeline.
- `data/pages.json` is the page registry that feeds the index and changelog. `docs/llms.txt`,
  `docs/llms-full.txt`, and `public/llms.txt` exist — confirm they're current and served.
- Per-page OG: many `api/*-og.js` endpoints render dynamic cards (B4 owns those). Static pages
  need correct static OG tags from the injector.
- The gap to audit: which of the 125+ pages are *missing* canonical URLs, unique
  title/description, OG/Twitter tags, or JSON-LD? Is the sitemap complete and submitted? Is
  `audit-page-index --strict` actually catching omissions, or passing pages with empty meta?

## Your mission
### 1. Audit coverage across all pages
Run `node scripts/build-page-index.mjs` and `node scripts/audit-page-index.mjs --strict`; read
`data/pages.json` against the actual files in `pages/`. Produce the real list of pages missing
canonical, unique title (<60 chars), description (<160 chars), OG image, or structured data.
Generalize if a script name differs — find the actual injector.

### 2. Make `inject-seo-meta.mjs` emit complete, correct metadata for every page
Each page gets: a unique `<title>` and meta description, a `<link rel="canonical">` to the
production URL, full Open Graph (`og:title`, `og:description`, `og:image`, `og:url`,
`og:type`) and Twitter Card tags, and `theme-color`. Derive from `data/pages.json` where
possible — no hand-maintained per-page duplication. Default OG image must be on-brand; dynamic
pages defer to B4's `api/*-og.js` endpoints (wire the URL, coordinate, don't reimplement).

### 3. Add JSON-LD structured data
Emit appropriate `schema.org` JSON-LD per page type: `WebSite` + `SearchAction` on home,
`SoftwareApplication`/`Product` on product surfaces, `Article`/`BlogPosting` on blog (extend
`inject-blog-seo.mjs`), `BreadcrumbList` on nested pages, `Organization` site-wide. Validate
the shape — malformed JSON-LD is worse than none.

### 4. Generate and serve a complete sitemap + robots
Build `sitemap.xml` from `data/pages.json` (every public page, real `lastmod`, sensible
`priority`/`changefreq`) and a correct `robots.txt` pointing at it. Wire generation into the
build (alongside `build-page-index`), not a manual step. Confirm both are served at the root
in production (check `vercel.json` rewrites).

### 5. Keep `llms.txt` / `llms-full.txt` accurate and built
These tell AI crawlers what three.ws offers. Make `docs/llms.txt`, `docs/llms-full.txt`, and
`public/llms.txt` consistent and regenerated from the page registry (not hand-edited and
stale). Cover the real product surfaces from `STRUCTURE.md`. `$THREE` is the only coin named.

### 6. Hold it in the build (regression-proof)
Strengthen `audit-page-index --strict` (or its sibling) to **fail the build** on any public
page missing canonical, title, description, or OG image — so future pages can't ship SEO-
broken. This is the "wire the inject scripts into the build and hold them" deliverable.

## Definition of done
Maps to the distribution pillar and §3 polish (no FOUC from injected tags). Specifically:
every public page has a unique canonical, title, description, OG + Twitter tags, and valid
JSON-LD (spot-check 5+ across types in Google's Rich Results Test mentally / via the validator
shape); `sitemap.xml` + `robots.txt` are complete, built, and served; `llms.txt` files are
regenerated and accurate; the build **fails** if a page ships without required meta; no
console errors; the injected `<head>` causes no layout shift. **Also inherits the global
definition of done in `00-README-orchestration.md`.**

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs. `$THREE` is the only coin — scrub any other token from
meta, JSON-LD, sitemap, llms.txt. Design tokens for any visible default-OG art. **Watch the
`api/*.js` bundle trap** (`__defProp`/`createRequire` in `head -1`) if you touch any endpoint.
Stage explicit paths only (never `git add -A`); re-check `git diff --staged` before commit.
Own the SEO/build-script lane; extend the existing injectors and page-index pipeline, don't
replace them.

## When finished
Run the five self-review checks. Ship one improvement — e.g. `hreflang` readiness, a
`SearchAction` that actually resolves to the site search, or an OG-image fallback chain.
Append a `data/changelog.json` entry if user-visible (tag `improvement`/`infra`). Then delete
this prompt file (`prompts/production-campaign/B-growth/B2-seo-structured-data.md`) and report
the before/after coverage numbers, the build gate you added, and any page type still needing a
bespoke JSON-LD schema (seam for C-surfaces).
