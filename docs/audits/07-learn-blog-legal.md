# Audit 07 — Learn / Blog / Legal / Machine-readable

Scope: docs (learn), tutorials, status, support, glossary, events, blog (index + 6 sampled posts), legal, and machine-readable files. Read-only content+UX audit. Routing resolved via `vite.config.js` (`vercel-rewrites` fileMap) and `vercel.json`.

Date: 2026-06-18.

**Headline:** Coin rule is CLEAN across every audited surface — the only Solana mint anywhere is `$THREE` (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Zero P0. Machine files are all wired (generated or function-backed and non-empty). The real problems are content-layer: a blog footer regression on ~22 posts, dead `/ibm/*` links, two orphaned `.md` posts, one orphaned doc, and a likely-dead RSS subscribe link.

---

## Learn — docs

### /docs — docs/index.html
Healthy SPA doc viewer. Renders markdown by slug, ships shared nav + footer (`/footer.js`, docs/index.html:1095-1096), default slug `start-here` (line 852). No issues.

### /docs/start-here — docs/start-here.md
Alive, in nav. Links `/discover`, `/start` resolve. No issues.

### /docs/make-your-agent — docs/make-your-agent.md
Alive, in nav. Links `/start`, `/app` resolve. No issues.

### /docs/share-and-embed — docs/share-and-embed.md
Alive, in nav. Link `/studio` resolves. No issues.

### /docs/do-i-need-crypto — docs/do-i-need-crypto.md
Alive. $THREE referenced with correct CA; USDC correctly framed as payment rail not a traded coin (lines 60-63). No issues.

### /docs/quick-start — docs/quick-start.md
Alive. `npm install @three-ws/sdk` (line 55) matches `sdk/package.json`. No issues.

### /docs/agent-system — docs/agent-system.md
Alive, in nav (line 763). No issues.

### /docs/erc8004 — docs/erc8004.md
Alive, in nav (line 779). Base58-looking strings (lines 90/94/576/582) are `0x` EVM hex fragments, not Solana mints — not coin violations. No issues.

### /docs/embedding — docs/embedding.md
Alive. Internal link `/docs/ar` (line 277) → `ar.md` exists and `ar` is in nav. No issues.

### /docs/web-component — docs/web-component.md
Alive. `/docs/ar` links resolve; React/Vite sample imports correct. No issues.

### /docs/mcp — docs/mcp.md
Alive, in nav (line 796). No issues.

### /docs/skills — docs/skills.md
Alive, in nav (line 765). No issues.

### /docs/widgets — public/docs-widgets.html
Alive standalone page (17 KB), registered in nav (docs/index.html:801) and top-nav `/widgets`. No coin hits. No issues.

### /docs/api-reference — docs/api-reference.md
Alive, in nav (line 793). Base URL, openapi/x402/mcp well-known links valid.
- [P3] docs/api-reference.md:74,256,… — example payloads use "2025" timestamps while current date is 2026-06-18 — cosmetic; refresh sample timestamps if desired.

### /docs/sdk — docs/sdk.md
Alive, in nav (line 797).
- [P3] docs/sdk.md:62-120 — `from './src/lib.js'` relative imports appear before the published-package (`@three-ws/sdk`) section. Intentional self-host path, but a skimming reader could copy the wrong import. Consider leading with the npm import.

### /docs/listings — docs/listings.md
Alive, in nav (line 830). External links (IBM Community, HackerNoon, Alibaba Cloud) well-formed; internal `/news/partnered-with-hackernoon` and the Alibaba blog post resolve.
- [P2] docs/listings.md:42 — inline link `/docs/syndication#hackernoon`. `syndication.md` exists and renders by slug, but `syndication` is NOT in the docs/index.html nav array — reachable only via this one inline link (orphaned doc). Fix: add a nav entry for Syndication.

---

## Learn — interactive

### /tutorials — pages/tutorials.html
Manifest-driven index (28 tutorials from `public/tutorials-manifest.js`), fully populated, hover/focus states present. CTA links (`/create`, `/studio`, `/widgets`, `/discover`, `/docs`, `/blog`, `/dashboard`, `/legal/*`) all resolve. No fetch → no async state needed (synchronous classic script). No issues.

### /tutorials/<slug> — pages/tutorial.html (text-to-3d, image-to-3d, prompts-for-3d, generate-3d-api)
Viewer hydrates from `/docs/tutorials/${slug}.md` (line 1319). All 4 target slugs have backing markdown (`docs/tutorials/*.md`) + manifest entries — no orphan routes. Designed error state with recovery link (lines 1361-1367); prev/next pager wired.
- [P3] docs/tutorials/text-to-3d.md:51, generate-3d-api.md:166 — link to third-party generators Meshy/Tripo. Legitimate BYO-key Forge engine options (real feature, not coins), accurately documented. Noted only as the sole competitor-link mentions.

### /status — pages/status.html
Real uptime page. Fetches `GET /api/status` (line 351), refreshes every 5 min. Endpoint exists (`api/status.js`) and computes from probe history written by `api/cron/uptime-check.js`. No hardcoded "all operational" — banner derived from `data.services` (lines 286-298). Loading skeleton (lines 257-268), warming-up empty state (line 287), designed error state with retry + `@trythreews` link (lines 340-347); respects `prefers-reduced-motion`. Exemplary. No issues.

### /support — pages/support.html
Every contact path real and resolving. GitHub Issues (line 158) + Discussions (167) live. mailto links valid: support@/security@/partnerships@/privacy@/legal@/dmca@/abuse@ (lines 183-221). Copy-to-clipboard uses real `navigator.clipboard` with mailto fallback (lines 306-339) — no fake timers. Doc/product links (README, SUPPORT.md, npm, `/ibm`, `/docs`) resolve except `/ibm` (see blog note below — bare `/ibm` has no route).
- [P2] pages/support.html — link to `/ibm` (bare) has no vercel.json route or file (only `/ibm/x402-demo` is routed). Dead link. Fix: point at `/ibm/x402-demo` or a real IBM landing page, or remove.

### /glossary — pages/glossary.html
Wired to real data (`/src/glossary/page.js` + `public/glossary.js`), live search, deep-linkable `#term` anchors, designed empty state ("No terms match…", `role="status"`). No issues.

### /events/build-3d-agents-live — pages/events/build-3d-agents-live.html
Correctly framed as upcoming. Event date 2026-06-23 (JSON-LD lines 45-46, JS 299-300) — 5 days after today; single source drives countdown, Google Calendar link, and LIVE-NOW/replay transition. Live `<agent-3d src="/avatars/default.glb">` asset exists. RSVP uses real `data-newsletter-form` handler. IBM partnership link points to a real external IBM Community blog. No issues.

---

## /blog/*

Sampled 6 posts: `see-your-3d-in-ar` (newest, 2026-06-13), `solana-wallet-integration` (oldest, 2026-04-30), `three-ws-google-cloud-partnership`, `pumpfun-agent-payments-sdk` (SDK), `how-to-embed-3d-onchain-agents` (tutorial), `three-ws-ibm-collaboration`. Plus blog/index.html and full-corpus greps.

Verdict: Coin rule CLEAN across all 30 files (only `$THREE`/`$three` + correct CA). Index is solid. Systemic footer regression and several dead `/ibm/*` links are the main issues.

- [P0] None. Coin grep returned only `$THREE`/`$three` and CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Lowercase `$three` (e.g. three-ws-dextools-social-boost-buyback.html:6) is still $THREE — fine.
- [P2] blog/three-ws-ibm-collaboration.html, three-ws-ibm-business-partner.html — dead internal links to `/ibm`, `/ibm/galaxy`, `/ibm/oracle`, `/ibm/proof`, `/ibm/trust-layer`, `/ibm/vision`. Confirmed: no vercel.json route and no files; `pages/ibm/` only contains `x402-demo.html` (only `/ibm/x402-demo` is routed at vercel.json:778). Fix: create the pages or repoint links.
- [P2] Footer missing on ~22 of 28 posts — e.g. solana-wallet-integration.html:99, pumpfun-agent-payments-sdk.html:104, how-to-embed-3d-onchain-agents.html:164, three-ws-google-cloud-partnership.html:93. They load `/footer.css` (line 22) but have NO `<div id="footer-container">` and NO `/footer.js`, so the site footer never renders (dead CSS load, no bottom nav). Only ~6 posts render it. Fix: append footer-container + footer.js to the affected posts.
- [P2] blog/decision-optimization-3d-ai-crypto.md, blog/internets-second-species.md — orphaned/unreachable. Route regex (vercel.json:3175) `/blog/([a-z0-9-]+)/?` → `/blog/$1.html` only; neither `.md` has an `.html` sibling and neither is linked from index.html, so they cannot be served. Fix: render to `.html` or delete.
- [P2] RSS subscribe link `/rss/announcements.xml` (index.html:9,61 and several posts) — no generator writes `public/rss/announcements.xml`; not in source, public/, or dist/. Scripts reference the URL but only emit an archive JSON. Likely dead (note: vercel.json:299-304 rewrites `/rss/announcements.xml` and `/rss.xml` → `/api/rss/announcements`, so prod MAY serve it dynamically — verify the function exists before treating as broken). Fix: confirm `api/rss/announcements` function returns valid XML, or add an emit step.
- [P3] blog/three-ws-play-coin-communities.html exists and is URL-reachable but is NOT linked from index.html (26 listed, this one omitted) — orphaned from discovery. Fix: add to index.
- [P3] index.html:78 AR-post summary says "a QR code gets you there" while body see-your-3d-in-ar.html:73 says "no QR code to hunt for" — minor copy contradiction.
- Images: no `<img>` in post bodies; all `og:image` → `https://three.ws/og-image.png` which exists. Shared assets present.

---

## Legal

### /legal/privacy — public/legal/privacy.html
Solid. Route OK (vercel.json:3338 `/legal/privacy/?` → file). Real complete content (11 sections, 8.5KB, no lorem). Coin grep clean. Links to tos, mailto contacts, `/three.svg`, `/brand.js` resolve. Effective date April 27, 2026.
- [P3] public/legal/privacy.html:123 — footer "Home" link points to `/marketplace?tab=mine` instead of `/` (TOS uses `/`). Cosmetic mislabel.

### /legal/tos — public/legal/tos.html
Solid. Route OK (vercel.json:3342). Real content (12 sections, 7.4KB). Coin grep clean. Links resolve. Effective date April 27, 2026.
- [P3] public/legal/tos.html:6 vs :36/:43 — `<title>` says "Terms of Service" but `og:title`/`twitter:title` say "Terms of Use". Inconsistent metadata. Cosmetic.

---

## Machine-readable

### /sitemap.xml — api/sitemap.js (function)
Served dynamically: vercel.json:3132 `/sitemap.xml` → `/api/sitemap`. Function exists (`api/sitemap.js`, 3.3KB) and reads `data/pages.json`; per-type sub-sitemaps via `api/sitemap/[type].js`. Non-empty. No issues.

### /llms.txt — public/llms.txt
Served from generated static file: vercel.json:3179 → `/llms.txt` (= public/llms.txt, 67 KB, generated by `scripts/build-page-index.mjs`). NOT the empty root `llms.txt`. No issues.
- [P3] Repo-root `llms.txt` (0 bytes) and `docs/llms.txt` / `docs/llms-full.txt` ("Placeholder…") are stale/unused files — NOT served (the served copies live in public/). Harmless but dead; delete to avoid confusion.

### /llms-full.txt — public/llms-full.txt
Served (vercel.json:3187), 72 KB, generated. No issues.

### /robots.txt — public/robots.txt
Served (vercel.json:3128). 606 bytes, real disallow rules, points Sitemap at https://three.ws/sitemap.xml and references llms.txt. No issues.

### /openapi.json — api/openapi-json.js (function)
Served dynamically: vercel.json:307 `/openapi.json` → `/api/openapi-json`. Function exists (35 KB), advertises only x402 (the rail actually settled). Non-empty. No issues.

### /.well-known/x402 — api/wk.js (function)
Served: vercel.json:359 `/.well-known/x402` → `/api/wk?name=x402`; `x402` and `x402-discovery` handlers present in api/wk.js (63 KB). Static `public/.well-known/` also has openapi.yaml, agent cards, security.txt, etc. Non-empty. No issues.

---

## Group summary

**P0 (0):** None. Coin rule clean everywhere; all critical machine files non-empty and wired.

**P1 (0):** None — every audited route resolves to a real, non-empty file, and the interactive pages (status/support) fetch real data with designed loading/empty/error states.

**Top P2 (content/links to fix):**
1. Blog footer regression — ~22 of 28 posts load footer.css but omit `#footer-container` + footer.js, so the site footer never renders.
2. Dead `/ibm/*` links — IBM blog posts (and /support's bare `/ibm` link) point to `/ibm`, `/ibm/galaxy`, `/ibm/oracle`, `/ibm/proof`, `/ibm/trust-layer`, `/ibm/vision`; only `/ibm/x402-demo` exists.
3. Orphaned posts — `blog/decision-optimization-3d-ai-crypto.md` and `blog/internets-second-species.md` are `.md`-only, unreachable via the `.html`-only blog route.
4. Orphaned doc — `docs/syndication.md` reachable only via one inline link in listings.md, not the docs nav.
5. RSS subscribe link `/rss/announcements.xml` — no local generator writes the XML; prod rewrite to `/api/rss/announcements` should be verified.
