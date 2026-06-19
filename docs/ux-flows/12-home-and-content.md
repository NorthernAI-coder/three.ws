# Home & Content Pages

This atlas covers the landing page (`/`) in full and every content / read-only
page on three.ws. The home page is highly interactive (live 3D agents, embedded
Forge / pose / token widgets); the content pages are mostly read-only but several
carry real interactive bits (docs search, glossary filter, status polling,
copy-to-clipboard, countdown, newsletter signup, embedded 3D viewers) — all
confirmed against source.

---

## Home — `/`

- **Source:**
  - Markup + inline modules: `pages/home.html` (6921 lines; served via `vercel.json` `"/" → "/home.html"`)
  - Lazy-mounted widget modules: `src/home-forge.js`, `src/home-pose.js`, `src/home-act2-viewer.js`, `src/home-live-token.js`
  - Other lazy mounts referenced by inline scripts: `src/avatar-drop.js`, `src/walk-embed-preview.js`, `src/pump/homepage-launcher.js`, `src/api-playground.js`, `src/forge-embed-snippets.js`, `src/erc8004/qr.js`
  - Web component runtime: `<script src="https://three.ws/agent-3d/latest/agent-3d.js">` (line 2430) + `/embed.js`
  - Chrome: `/nav.js`, `/footer.js`
- **Entry point:** Root route. No auth. The hero `<agent-3d>` and the capability/press strips render immediately; every widget below the fold is lazy-loaded on `IntersectionObserver` to keep the initial payload light.
- **Prerequisites / gates:** None. Fully public, no wallet/login. The mini-Forge uses an anonymous device `forge:cid` handle (localStorage); no sign-up required to generate a model.
- **Steps (the landing flow is browse-and-branch, not linear; the "required" path is reach a CTA → click → leave to a product route):**
  1. Land on hero — headline "The 3D agent layer of the internet.", three hero bullets, a live `<agent-3d>` on stage, and the eyebrow link "New · Text → 3D is live…" → `/forge`.
  2. (Optional) Trigger a hero animation chip (🎲 Random, 👋 Wave, 💃 Dance, 🤸 Capoeira, 🦘 Jump, 🧟 Thriller, 🙏 Pray) — drives the live agent; a counter tracks triggers.
  3. Choose a primary CTA: **"Build your agent →"** → `/create`, **"Text → 3D"** → `/forge`, or **"See the embed"** → `#embed` anchor (in-page Playground).
  4. (Optional) Scroll through the page's ~23 sections, each demoing a capability with a live widget and its own CTA (see Decision points below).
  5. Click any CTA to leave for the target product route.
- **Decision points / branches (every body CTA → destination, exact labels):**
  - Hero / eyebrow: eyebrow → `/forge`; "Build your agent →" → `/create`; "Text → 3D" → `/forge`; "See the embed" → `#embed`.
  - Three Doors (02): "Start building" → `/create`; "Read the docs" → `/docs`; "Set up monetization" → `/dashboard/monetize`.
  - What You Get cards: "Open viewer" → `/playground`; "Widget Studio" → `/widgets`; "Claim your subdomain" → `/dashboard/account`.
  - Community Forge: "Generate yours →" → `/forge`.
  - Pose Studio: "Pose Studio" → `/pose`; "Open this pose in the full studio →" → `/pose?…` (carries pose params).
  - Mini Forge: "open the full Forge →" → `/forge`.
  - AR: "Forge gallery"/"Generate your own model →" → `/forge`; "Browse the avatar gallery →" → `/gallery`; "AR feature overview →" → `/features/ar`; "How AR works →" → `/blog/see-your-3d-in-ar`.
  - Capabilities Bento: "Continue in Avatar Studio →" → `/create/selfie`.
  - Pump.fun token (04): "Explore token agents →" → `/launches`; "Trending tokens" → `/radar`; "Launch yours" → in-page launcher (`src/pump/homepage-launcher.js`).
  - Oracle: "Open Oracle →" / "View all conviction scores →" → `/oracle`.
  - Pay-per-call: "Configure monetization →" → `/dashboard/monetize`.
  - Walk: "See walk mode →" → `/walk`.
  - Developer platform (05): "Get a key"/"Get API key →" → `/dashboard/api`; "Docs" → `/docs`; "GitHub" → github.com/nirholas/three.ws; "OpenAPI" → `/api/openapi-json`; "MCP server" → `/docs/mcp`.
  - The Stack (07): Studio → `/studio`; Registry → `/discover`; Embed → `/docs`; Pay-per-call → `/dashboard/monetize`; Walk → `/walk`; SDK → `/docs/sdk`.
  - Showcase 3D (08): "Browse all" → `/discover`; "Make your own" → `/create`.
  - Avatar Drop (09) & Vclose: "Build your agent →" → `/create`; "Text → 3D" → `/forge`; "Read the docs" → `/docs`.
  - Footer (6 columns): Product (`/create`, `/forge`, `/marketplace`, `/discover`, `/pricing`, `/dashboard`), Explore (`/agents`, `/reputation`, `/characters`, `/gallery`, `/bazaar`), Developers (`/docs`, `/avatar-sdk`, `/dashboard/api`, `/artifact`, `/sitemap`), Integrations (`/galaxy`, `/x402`, `/aws`), Company (`/blog`, `/community`, X, GitHub, `mailto:support@three.ws`), Legal (`/legal/privacy`, `/legal/tos`), plus a "$THREE contract address" copy button.
- **Embedded interactive widgets (in-page, no navigation required):**
  - **Hero agent** — live `<agent-3d>` + 7 animation chips.
  - **Playground (`#embed`)** — editable embed-code textarea (HTML/React/Vue tabs), mode chips (inline/widget), background chips, feature toggles (responsive/nameplate/chat/eager), live `<agent-3d>` preview, 7 animation test chips, copy-code button.
  - **Mini Forge (`#home-forge`, `src/home-forge.js`)** — real text-to-3D: prompt bar with typewriter suggestions (Tab to accept), example chips, POST `/api/forge` (tier `standard`, TRELLIS lane, free; auto-degrades to NVIDIA lane), poll `GET /api/forge?job=…`, live `<model-viewer>` result, session history rail (localStorage `forge:home:history`), result toolbar (auto-rotate toggle, variation, Scene Studio → `/scene?model=…`, copy share link, GLB download, clear), and an embed sheet (iframe/web-component snippets, size presets, copy, standalone link). Cancel/retry wired. Honest elapsed timer only.
  - **Pose Studio (`#home-pose`, `src/home-pose.js`)** — drag-to-orbit rig, joint sliders, preset chips, reset/snapshot/copy-link/open-studio buttons.
  - **AR (`#home-ar`)** — `<model-viewer>` with `ar` modes (webxr/scene-viewer/quick-look), desktop QR (lazy `src/erc8004/qr.js`), model cycling.
  - **Live token card (`#hlt-card`, `src/home-live-token.js`)** — real Pump.fun data; plus homepage launcher.
  - **Oracle feed** — `GET /api/oracle/feed?network=mainnet&limit=6&min_score=56`, renders top conviction coins.
  - **Community Forge gallery** — `GET /api/forge-gallery?scope=community&limit=18`.
  - **Showcase 3D grid** — `GET /api/explore`, agent cards + CTA cards.
  - **Other live agents** — What-You-Get viewer (50+ animation chips), Bento mini-agents, Vclose agent, Avatar Drop canvas, Walk preview canvas.
- **External calls / dependencies:** `POST/GET /api/forge`, `GET /api/forge-gallery`, `GET /api/explore`, `GET /api/oracle/feed`; Pump.fun feed (live token card); `agent-3d` runtime + Google `model-viewer` CDN (lazy). Solana RPC indirectly via the launcher.
- **Success state:** User reaches and clicks a CTA into a product route, or completes an in-page demo (e.g. a forged model rendered with a working toolbar; an embed snippet copied).
- **Empty / error states:**
  - Mini Forge: 503/`unconfigured` → "The generator is offline right now"; 429/`rate_limited` → "The forge is busy, try again in ~N s"; poll timeout → "try a simpler, single-subject prompt"; viewer load failure surfaced; explicit error state with **Try again** (re-runs `lastPrompt`) and **Cancel**.
  - API-fed sections (Oracle, Community Forge, Showcase) degrade gracefully if their fetch fails (sections render empty rather than break the page).
  - Reduced-motion respected throughout (typewriter, parallax, scanline disabled).
  - Clipboard blocked → fallback hidden input + `execCommand('copy')` with "Press ⌘/Ctrl-C" toast.
- **Step count:** ~3 required to leave via a CTA (land → optional browse → click) **(+ many optional)**: the page exposes ~40 distinct CTAs and ~13 self-contained interactive widgets, each an optional sub-flow.

---

## Content & Read-Only Pages

### What is three.ws — `/what-is`
- **Source:** `pages/what-is.html` (static; `<model-viewer>` v4.0.0 CDN).
- **Entry point:** `vercel.json` `/what-is → /what-is.html`.
- **Steps (4):** 1) Read hero/overview. 2) Expand/collapse FAQ accordion (4 questions: crypto, free-to-start, skills-needed, where-embed) via `.fl-faq-q` buttons. 3) Drag/orbit the embedded sample avatar (`/animations/soldier.glb`). 4) Follow a nav/CTA link (`#use-cases`, `/create`, `/features`, `/studio`, `/playground`, `/play`, `/overlay-control`, `/pay`).
- **Notes:** Schema.org FAQPage + WebPage. No API calls. Interactive: FAQ accordion + 3D viewer.

### Features (index) — `/features`
- **Source:** `pages/features.html` (static + 3D widgets; `/footer-newsletter.js`).
- **Entry point:** `vercel.json` `/features → /features.html`. (Subpages `/features/*` covered elsewhere.)
- **Steps (6):** 1) Hero "Core" vs "Optional" pill nav scrolls to `#core`/`#optional`. 2) Animation showcase: 70+ pills swap a live `<model-viewer>` `src` (`/animations/*.glb`) with a "Now Playing" label. 3) Copy embed snippet (`#embedCopyBtn` → clipboard, "Copied!" 2s). 4) Scroll-reveal cascade (IntersectionObserver). 5) Interact with multiple embedded `<model-viewer>` demos. 6) Newsletter signup (footer `data-newsletter-form` → `POST /api/newsletter/subscribe`).
- **Notes:** No content-fetch API; copy button + animation picker + newsletter form are the real interactions.

### Status — `/status`
- **Source:** `pages/status.html` (dynamic).
- **Entry point:** `vercel.json` `/status → /status.html`.
- **Prerequisites / gates:** None.
- **Steps (3):** 1) On load, fetch `GET /api/status` and render service cards (status dot, uptime %, avg latency, 90-day history bar). 2) Auto-poll every 5 min (`setInterval`, 300000 ms) updating the `aria-live` banner ("All systems operational" ↔ "X of Y services disrupted"). 3) Hover/focus a 90-day history cell for per-day tooltip.
- **External calls:** `GET /api/status`.
- **Success state:** Live service grid rendered with current operational status + "last check" timestamp.
- **Empty / error states:** Skeleton loaders on first paint; on fetch failure renders an error message with retry guidance.
- **Step count:** 1 required (page loads + auto-fetches) (+2 optional: re-poll happens automatically; hover cells).

### Glossary — `/glossary`
- **Source:** `pages/glossary.html` + `src/glossary/page.js`; term data inline in `public/glossary.js` (`window.twsGlossary.terms`, injected site-wide by `nav.js`).
- **Entry point:** `vercel.json` `/glossary → /glossary.html`.
- **Steps (4):** 1) Type in `#glos-q` search (rAF-debounced `applyFilter`, case-insensitive, filters cards). 2) Result count updates (`#glos-count` aria-live: "X terms" / "Y of X terms" / "No terms match '…'"). 3) Deep-link `#<term>` scrolls + flash-highlights a card (`highlightFromHash`). 4) Read a term card.
- **Notes:** No external API — terms are a static inline object (~16+ terms: usdc, sol, solana, evm, wallet, x402, pay-per-call, on-chain, mint, bonding-curve, pump.fun, mainnet, base, nft, ipfs, mcp, a2a, erc-8004, metaplex-core, graduation, skills, brain, rig…). page.js polls up to 6s for the injected glossary data.

### Support — `/support`
- **Source:** `pages/support.html` (static).
- **Entry point:** `vercel.json` `/support → /support.html`.
- **Steps (5):** 1) Read intro/channels. 2) Copy a contact email via `.copy-btn` (support, security, partnerships, privacy, legal, dmca, abuse @three.ws) → clipboard, "Copied ✓" 1600ms; clipboard-blocked fallback opens `mailto:`. 3) Open a channel card (GitHub Issues / Discussions — new tab). 4) Use a `mailto:` link. 5) Hover channel cards (border/translate/arrow microinteractions).
- **Notes:** No contact form / no backend submission — email links + copy buttons only. No API.

### Events — Build 3D Agents Live — `/events/build-3d-agents-live`
- **Source:** `pages/events/build-3d-agents-live.html` (static + realtime; `/embed.js`, `/footer-newsletter.js`).
- **Entry point:** `vercel.json` `/events/([a-z0-9-]+) → /events/$1.html`.
- **Steps (5):** 1) Watch live countdown to start (event 2026-06-23 18:00 MT / 20:00 ET, 60 min, online; rAF tick → days/hrs/min/sec; switches to "LIVE NOW" then "Replay coming soon"). 2) Add to calendar (`#add-cal`/`#add-cal-2` build a Google Calendar render URL from EVENT_START/END). 3) RSVP email signup (`#rsvp-form`, `data-newsletter-form` → `POST /api/newsletter/subscribe`, aria-live result). 4) Interact with the lazy-loaded hero `<agent-3d>` (deferred via `requestIdleCallback` → `/embed.js`). 5) Scroll-reveal sections.
- **Notes:** Schema.org Event. Countdown is local (no API); only newsletter POSTs.

### Legal — Privacy & Terms — `/legal/privacy`, `/legal/tos`
- **Source:** `public/legal/privacy.html`, `public/legal/tos.html` (pure static).
- **Entry point:** `vercel.json` `/legal/privacy → /legal/privacy.html`, `/legal/tos → /legal/tos.html`.
- **Steps (1):** Read the document; follow cross-links (each links to the other, plus `mailto:` addresses; one IBM cloud external ref).
- **Notes:** No TOC/anchors, no dynamic behavior, no API. Privacy = 11 sections; Terms = 12 sections.

### Tutorials index — `/tutorials`
- **Source:** `pages/tutorials.html` (client-rendered from `public/tutorials-manifest.js` → `window.TUTORIALS`, 23 entries, 3 tiers).
- **Entry point:** `vercel.json` `/tutorials → /tutorials.html`.
- **Steps (4):** 1) Use hero jump-links (`.tut-jump`, 3 tiers) to scroll. 2) Browse 23 tutorial cards (Easy 8 / Middle 10 / Advanced 5), grouped with section headers. 3) Click a card → `/tutorials/<slug>`. 4) Bottom CTA: "Open docs →" → `/docs`; "Read source on GitHub" (new tab).
- **Notes:** Dynamic render from the manifest `<script>`, no fetch. Hover: translateY + accent-bar.

### Tutorial article template — `/tutorials/prompts-for-3d`, `/tutorials/generate-3d-api`
- **Source:** `pages/tutorial.html` (route `/tutorials/([a-z0-9-]+) → /tutorial.html`); content markdown in `docs/tutorials/<slug>.md` (`docs/tutorials/prompts-for-3d.md`, `docs/tutorials/generate-3d-api.md`); metadata from `public/tutorials-manifest.js`.
- **Entry point:** Slug parsed from URL via regex, metadata via `window.tutorialBySlug(slug)`.
- **Steps (5):** 1) Read hero (title/meta from manifest). 2) Hero CTA (manifest-driven, e.g. "Open the Forge"). 3) Read article — markdown fetched `GET /docs/tutorials/<slug>.md`, parsed with marked + highlight.js; per-`<pre>` **copy code** buttons ("Copy" → "Copied" 1700ms). 4) Use the sticky TOC (scroll-spy) and heading anchors. 5) Prev/Next pager (adjacent manifest entries); back-to-top button + top progress bar.
- **External calls:** `GET /docs/tutorials/<slug>.md`.
- **Success state:** Rendered article with working TOC, copy buttons, and pager.
- **Empty / error states:** "Page not found." on failed markdown fetch.
- **Step count:** 1 required (read) (+4 optional: CTA, copy, TOC nav, pager).
- **Notes:** text-to-3d & image-to-3d tutorials use this same template (covered elsewhere).

### Docs (index + all subpages) — `/docs`, `/docs/start-here`, `/docs/make-your-agent`, `/docs/share-and-embed`, `/docs/do-i-need-crypto`, `/docs/quick-start`, `/docs/agent-system`, `/docs/erc8004`, `/docs/embedding`, `/docs/web-component`, `/docs/mcp`, `/docs/skills`, `/docs/api-reference`, `/docs/sdk`, `/docs/listings` (and ~50 more)
- **Source:** Single SPA shell `docs/index.html` (served for `/docs`, `/docs/`, and `/docs/<slug>` per `vercel.json`); markdown content in `docs/*.md` and `docs/tutorials/*.md`. Marked + highlight.js via CDN.
- **Entry point:** `vercel.json` `/docs → /docs/index.html`, `/docs/([^./]+) → /docs/index.html` (the slug becomes a hash route). `currentPath()` reads `location.hash` (or `/docs/<slug>`), defaulting to `start-here`.
- **Steps (4):** 1) Land — sidebar (9 sections, NAV array) + `start-here.md` fetched & rendered. 2) Sidebar **search** input live-filters the nav by label. 3) Click a sidebar link → hash route → `GET /docs/<slug>.md` rendered (headings get anchor IDs; internal `.md` links rewritten to hash routes; code highlighted). 4) Per-page tools: "Copy page" (markdown to clipboard), "View as Markdown" (`/docs/<slug>.md` new tab), "Open in Claude" (`claude.ai/new?q=…`); Prev/Next pager; mobile sidebar FAB/overlay.
- **External calls:** `GET /docs/<slug>.md` per page (e.g. `do-i-need-crypto.md`, `quick-start.md`, `agent-system.md`, `erc8004.md`, `embedding.md`, `web-component.md`, `mcp.md`, `skills.md`, `api-reference.md`, `sdk.md`, `listings.md`, `make-your-agent.md`, `start-here.md`); marked + highlight.js CDNs.
- **Empty / error states:** Loading dots during fetch; "Page not found." on a missing slug.
- **Notes:** ALL `/docs/*` slugs (except `/docs/widgets`) share this one SPA — the route is one repeated pattern: navigate (hash/sidebar/search) → fetch markdown → render, with copy-page + pager + TOC behaviors. Real steps per page = 1 required (read) +3 optional (search, copy-page, pager). **Exception:** `/docs/widgets` is a separate standalone page (below).

### Docs — Widgets (standalone) — `/docs/widgets`
- **Source:** `public/docs-widgets.html` (static; `vercel.json` `/docs/widgets → /docs-widgets.html`, mapped *before* the generic `/docs/*` rule).
- **Steps (4):** 1) TOC anchor nav (`#quick-start`, `#widget-types`, `#urls`, `#embedding`, `#postmessage-api`, `#og-oembed`, `#csp-cors`, `#privacy`, `#faq`). 2) Read code blocks (iframe/script/oEmbed/postMessage). 3) Review reference tables (widget types, URL schemes, hash params, postMessage events, OG/oEmbed). 4) Follow links (`/studio`, `/widgets`, `/docs/deployment`, oembed.com); footer `<model-viewer>` demo (`/animations/robotexpressive.glb`).
- **Notes:** Pure static docs, no API. Distinct from the docs SPA.

### Blog index — `/blog`
- **Source:** `blog/index.html` (static; `vercel.json` `/blog → /blog/index.html`).
- **Entry point:** `/blog`.
- **Prerequisites / gates:** None.
- **Steps (2):** 1) Scan the hardcoded list of 26 post cards (each shows title, date, informational tag). 2) Click a post → `/blog/<slug>`. (Also: RSS link `/rss/announcements.xml`; X/GitHub external links.)
- **Decision points / branches:** 26 posts → 26 individual article routes; RSS / social out.
- **External calls:** None — fully static list (no fetch, no pagination, no filter/search). Tags are display-only, not filterable.
- **Success state:** User opens an article.
- **Empty / error states:** N/A (static).
- **Step count:** 1 required (click a post) (+ optional RSS/social).

### Blog posts (26) — `/blog/<slug>`
- **Source:** `blog/<slug>.html` — 26 routable static HTML files, all on **one shared template** (`.post-wrap`, `.post-meta`, `.post-tag`, shared nav/footer containers). Routed via `vercel.json` `/blog/([a-z0-9-]+) → /blog/$1.html`.
- **Slugs:** 2500-new-animations, 3d-ai-crypto-convergence, agent-3d-web-component, agent-builder-studio-launch, animation-emotion-control, how-to-embed-3d-onchain-agents, pumpfun-agent-payments-sdk, real-time-voice-interaction, see-your-3d-in-ar, solana-wallet-integration, text-to-3d-is-live, three-token-listings, three-ws-aws-partner, three-ws-dextools-social-boost-buyback, three-ws-featured-on-alibaba-cloud-marketplace-blog, three-ws-google-cloud-partnership, three-ws-hackernoon-partnership, three-ws-ibm-business-partner, three-ws-ibm-collaboration, three-ws-on-alibaba-cloud-marketplace, three-ws-on-anthropic-mcp-registry, three-ws-on-aws-marketplace, three-ws-on-bnb-chain-dappbay, three-ws-on-coinmarketcap, three-ws-speraxusd-integration, three-ws-x402-bazaar.
- **Steps (1):** Read the article; follow the "← Blog" back link, inline links, and the occasional primary CTA (e.g. text-to-3d post → "Try Forge — type a prompt →" → `/forge`).
- **Notes:** Repeated "read article" pattern. No embedded 3D demos / share / TOC / newsletter inside the post body in the sampled pages; copy-button CSS exists in the template but the sampled posts have no code blocks. No API.
- **Source not exposed:** Two `.md` files (`blog/decision-optimization-3d-ai-crypto.md`, `blog/internets-second-species.md`) are NOT routed (no rule maps `.md` blog slugs) and are not in the index — source material only, not live pages.

---

## Machine-Readable Endpoints

Agent/crawler endpoints — not user UX (0 user steps). All resolve via `vercel.json` rewrites.

| Endpoint | Route | Served by | Purpose |
|---|---|---|---|
| Sitemap | `/sitemap.xml` | `/api/sitemap` (function) | XML sitemap for crawlers (sub-sitemaps at `/sitemap/{core,agents,avatars,widgets,profiles}.xml`) |
| LLMs index | `/llms.txt` | `public/llms.txt` (static) | LLM site index |
| LLMs full | `/llms-full.txt` | `public/llms-full.txt` (static) | Full LLM corpus dump |
| Robots | `/robots.txt` | `public/robots.txt` (static) | Crawler directives |
| OpenAPI | `/openapi.json` | `/api/openapi-json` (function) | OpenAPI spec for the REST API |
| x402 discovery | `/.well-known/x402` | `/api/wk?name=x402` | x402 micropayment service discovery (`/.well-known/x402.json` → `name=x402-discovery`) |
| Agent attestation schemas | `/.well-known/agent-attestation-schemas` | `/api/wk?name=agent-attestation-schemas` | ERC-8004 attestation schema descriptors |
| OAuth AS metadata | `/.well-known/oauth-authorization-server` | `/api/wk?name=oauth-authorization-server` | OAuth 2.0 Authorization Server metadata |
| Chat plugin manifest | `/.well-known/chat-plugin.json` | `/api/wk?name=chat-plugin` | AI chat-plugin manifest |

All `/.well-known/*` and `/openapi.json` / `/sitemap.xml` responses are JSON/XML for machines (agents, wallets, crawlers, OAuth/MCP clients), not rendered UI. The `/.well-known/*` family is handled centrally by `api/wk.js`.
