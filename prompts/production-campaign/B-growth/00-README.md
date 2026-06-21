# Track B — Activation, Growth & Distribution

**Goal: turn visitors into users who come back.** three.ws is impressive and mostly
built — 125+ pages, 100+ endpoints, SDKs, MCP servers, payment rails. What it lacks is
the growth machinery that compounds: a first run that reaches value in under 60 seconds,
SEO that makes every page discoverable, analytics that prove activation, share loops that
turn each forged model and trade win into a new visitor, lifecycle messaging that earns a
second session, and a landing page that converts. A platform nobody activates on is worth
its liquidation value. This track builds the funnel — acquisition → activation → retention
→ revenue — and instruments every stage so "we think users like it" becomes a number.

Read `CLAUDE.md`, `STRUCTURE.md`, `prompts/production-campaign/00-README-orchestration.md`,
and `prompts/production-campaign/00b-the-bar.md` before any prompt here. Every prompt
inherits the global definition of done; each adds its own.

## The six prompts

| ID | Mission (one line) | Run order |
|---|---|---|
| **B1** | First-run flow to real value in <60s, no signup wall before the first "wow" — built on the feature-tour, activation measured. | First (unblocks B3, B6) |
| **B2** | SEO + structured data across all 125+ pages: canonical, sitemap, JSON-LD, OG, llms.txt — inject scripts wired into the build and held. | First (independent) |
| **B3** | Clean event taxonomy + funnel instrumentation on every primary surface, readable in a dashboard. Extends `src/acquisition-analytics.js`. | After B1 |
| **B4** | Every shareable moment → a gorgeous universal OG card + one-tap share + a referral loop. Built on `api/*-og.js` and `@vercel/og`. | After B3 (uses events) |
| **B5** | Lifecycle email, notifications, changelog→Telegram, re-engagement digests, win-back — honest opt-in/opt-out. | After B3 |
| **B6** | Conversion-optimize home/landing: value prop, social proof, CTA hierarchy, above-the-fold wow — measured. | Last (consumes B1–B4) |

**Run order in one line:** B1 + B2 in parallel first → then B3 → then B4 + B5 in parallel
→ then B6 last (it depends on the activation path, the funnel, the share cards, and the
press strip all existing). Each is independent enough to run in its own chat; the
dependencies above are about *quality of result*, not hard blocks.

## File-ownership map (parallel-safe lanes)

Stage explicit paths only — never `git add -A`. Shared files (`data/changelog.json`,
`data/pages.json`) are **append-only**; never reformat them. If two prompts run at once,
these lanes do not collide:

| Prompt | Owns (edit freely) | Touches lightly (append/wire only) |
|---|---|---|
| **B1** | `src/feature-tour/*`, `pages/start.html`, `src/start.js`, `pages/home.html` (first-run trigger only) | `src/acquisition-analytics.js` (emit activation events) |
| **B2** | `scripts/inject-seo-meta.mjs`, `scripts/inject-blog-seo.mjs`, `scripts/build-page-index.mjs`, `docs/llms.txt`, `docs/llms-full.txt`, `public/llms.txt`, `vercel.json`/`vite.config.js` (sitemap wiring) | `package.json` scripts (build wiring), per-page `<head>` via injectors |
| **B3** | `src/acquisition-analytics.js`, `src/analytics.js`, a new analytics dashboard page | per-surface `data-cta`/event hooks (additive attributes only) |
| **B4** | `api/agent-og.js`, `api/avatar-og.js`, `api/feature-og.js`, `api/a-og.js`, `api/app-og.js`, `api/*-share.js`, `api/agent-oembed.js`, share UI components, `src/dashboard-next/pages/referrals.js`, `src/dashboard-next/referral-claim.js` | shared OG render helper under `api/_lib/` |
| **B5** | `api/_lib/email.js`, `api/newsletter-subscribe.js`, `scripts/changelog-telegram.mjs`, `api/alerts/*`, `src/notifications.js`, new digest/win-back cron(s) under `api/cron/` | email-preference UI in account settings |
| **B6** | `pages/home.html` (full landing), home hero/CTA/social-proof CSS+markup | consumes B1's first-run trigger, B3's events, B4's share cards |

`pages/home.html` is touched by B1 (trigger wire), B6 (full conversion pass), and B3
(event hooks). Coordinate: **B6 owns home.html's layout/markup**; B1 adds only the
first-run entry hook; B3 adds only `data-cta`/event attributes. Re-check `git diff --staged`
before committing.

When this directory contains only this `00-README.md`, Track B is done.
