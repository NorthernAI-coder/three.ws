# G04 — Content engine: blog/tutorial pipeline + templates

**Track:** Partnerships & Content · **Size:** M · **Priority:** P3

## Goal
A low-friction pipeline and templates for publishing blog posts, tutorials, and partner
showcases consistently — so content (a stated goal) ships regularly without bespoke effort each
time.

## Why it matters
Content drives SEO, activation, and partner visibility. The blocker is consistency and format.
Templates + a clear pipeline make publishing routine.

## Context
- Existing surfaces: `blog/` (static posts), `pages/tutorials.html` + `pages/tutorial.html` (hydrates `/api/tutorials/:slug`), docs guides (F05).
- Reuse the unified design system and the OG cards (D04) for share-ability.

## Scope
- Templates for: a feature/announcement post, a how-to tutorial, and a partner showcase — each with front-matter, structure, SEO/OG fields, and a CTA.
- Document the publishing pipeline (where files go, how they get routed, how they appear in nav/sitemap, how OG cards generate).
- Wire 1–2 real inaugural pieces (e.g. a real feature post and one tutorial) as working proof — real content, not lorem.
- Ensure posts are searchable (D01) and listed on the blog/tutorials indexes.

## Definition of done
- Templates + a documented pipeline exist; at least one real post and one real tutorial are published through it, correctly routed, OG-carded, and discoverable.

## Verify
- Publish a test piece via the template; confirm it routes, appears in the index/sitemap, generates an OG card, and is searchable.
