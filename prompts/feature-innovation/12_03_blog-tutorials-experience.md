# 🚀 Innovation Brief — Blog & Tutorials Experience

> **Task file:** `prompts/feature-innovation/12_03_blog-tutorials-experience.md`
> **Surface:** `/blog` (index + 26 posts), `/tutorials` (index + articles), newsletter capture
> **Primary source:** `blog/index.html`, `blog/<slug>.html` (26 shared-template posts), `pages/tutorials.html`, `pages/tutorial.html`, `public/tutorials-manifest.js`, `docs/tutorials/<slug>.md`, `POST /api/newsletter/subscribe`
> **Atlas reference:** `docs/ux-flows/12-home-and-content.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a reader who arrived from search, social, or the changelog — a curious developer, a $THREE holder, or a prospective builder — who wants to learn something (how to embed 3D on-chain, how to prompt for 3D, what the AWS/IBM/Google partnerships mean) and, ideally, to *act* on it. Blog and tutorials exist to turn readers into builders and subscribers: they are the platform's top-of-funnel content engine. Today they are honest but static — the blog index is a hardcoded list of 26 cards with no search or filter, posts are read-only templates with no related content or in-body conversion, and tutorials are well-built articles whose "steps" are prose, not runnable.

"Gamechanging" here means content that is **discoverable, delightful to read, and quietly relentless at conversion** — a fast search across all posts and tutorials, related-content that keeps readers moving, *runnable* tutorial steps (a tutorial about prompting for 3D should let you forge a model right there via real `/api/forge`), and newsletter capture that feels earned, not bolted on. The bar is the best technical content experience in web3/3D — Stripe's blog polish, Josh Comeau / Smashing-grade interactive tutorials, and the discovery of a great docs/blog hybrid.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world — the Stripe and Vercel blogs (typography, motion, share affordances), Josh Comeau / Smashing Magazine / web.dev (interactive, runnable tutorials), and Linear's changelog/blog (clarity + momentum). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new: tutorials where the reader builds a real 3D agent inside the article, and a content layer where every post is one keystroke from the next thing worth reading and one scroll from subscribing.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):**
  - `/blog` → `blog/index.html`; `/blog/<slug>` → `blog/<slug>.html` (`vercel.json` `/blog/([a-z0-9-]+) → /blog/$1.html`).
  - `/tutorials` → `pages/tutorials.html`; `/tutorials/<slug>` → `pages/tutorial.html` (`vercel.json` `/tutorials/([a-z0-9-]+) → /tutorial.html`).
- **Source:**
  - **Blog index:** `blog/index.html` — static, hardcoded list of 26 post cards (title, date, informational tag); RSS `/rss/announcements.xml`; X/GitHub links.
  - **Blog posts:** 26 routable static HTML files on **one shared template** (`.post-wrap`, `.post-meta`, `.post-tag`, shared nav/footer). Slugs include `text-to-3d-is-live`, `how-to-embed-3d-onchain-agents`, `see-your-3d-in-ar`, `agent-3d-web-component`, plus partnership announcements (AWS, IBM, Google Cloud, Alibaba, BNB Chain, CoinMarketCap, Anthropic MCP registry, etc.).
  - **Tutorials index:** `pages/tutorials.html` — client-rendered from `public/tutorials-manifest.js` (`window.TUTORIALS`, 23 entries, 3 tiers: Easy 8 / Middle 10 / Advanced 5); hero jump-links per tier; cards link to `/tutorials/<slug>`.
  - **Tutorial article:** `pages/tutorial.html` — slug from URL regex, metadata via `window.tutorialBySlug(slug)`, content `GET /docs/tutorials/<slug>.md` parsed with marked + highlight.js; per-`<pre>` **copy code** buttons; sticky TOC + scroll-spy; heading anchors; prev/next pager; back-to-top + top progress bar; manifest-driven hero CTA.
- **Current flow:** Blog index = 1 required step (click a post) + optional RSS/social. Blog post = 1 step (read). Tutorials index = 4 steps (jump-links, browse, open, bottom CTA). Tutorial article = 1 required (read) + 4 optional (CTA, copy, TOC, pager).
- **What works today:** Tutorial articles are genuinely solid (TOC scroll-spy, copy-code, pager, progress bar, error state "Page not found."). The newsletter form (`data-newsletter-form` → `POST /api/newsletter/subscribe`, aria-live result) is already wired and used on other pages (features, events).
- **Real APIs / dependencies already wired:** `GET /docs/tutorials/<slug>.md` (tutorial body); `POST /api/newsletter/subscribe` (newsletter, used elsewhere); marked + highlight.js CDNs; `agent-3d` + `model-viewer` available platform-wide; `POST/GET /api/forge`, `GET /api/forge-gallery`, `GET /api/explore` available for embedding live demos.
- **Where it's mediocre, thin, or unfinished:**
  - **Blog index has no search, no filter, no pagination.** 26 cards, hardcoded; tags are display-only, not filterable. Discovery is "scroll and hope."
  - **Blog posts are dead ends.** No related posts, no "next read," no share buttons, no TOC, no newsletter capture *in the post*, no embedded 3D demos — even posts literally about embedding 3D / AR / the web component show no live agent. Copy-button CSS exists in the template but sampled posts have no code blocks. A reader finishes and leaves.
  - **Two unrelated content systems.** Blog (static HTML files) and tutorials (manifest + markdown SPA-ish template) don't share search, related-content, chrome, or discovery. They should feel like one content library.
  - **Tutorial steps are prose, not runnable.** A tutorial on prompting for 3D or the generate-3D API explains the call but never lets the reader *run* it inline — despite `/api/forge` being free and already wired into the home Mini-Forge.
  - **No cross-surface wiring.** Blog/tutorials don't surface in each other, don't link to the matching docs page, and don't feed the changelog reader or the home content strip. Two unrouted `.md` files exist (`blog/decision-optimization-3d-ai-crypto.md`, `blog/internets-second-species.md`) as source-only material, not live pages.
  - **Newsletter capture is absent from the two highest-intent surfaces** (blog post end, tutorial completion) where a reader has just gotten value.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **One unified content library with instant search + filters.** Replace the hardcoded blog index (and unify with the tutorials index) with a fast client-side `⌘K`/typeahead search and tag/tier/type filters across all 26 posts + 23 tutorials. Drive it from a generated manifest (extend the tutorials-manifest pattern; generate a posts manifest via the existing `build:pages` pipeline so it never drifts from the HTML files). Keyboard-first, deep-linkable, with designed empty/no-results states.
- **Runnable tutorial steps — the reader builds in the article.** For tutorials about prompting/forging/embedding, embed a real, sandboxed mini-widget inline: a prompt bar that calls the real free `/api/forge` and renders the result with `<model-viewer>`, or a live `<agent-3d>` whose attributes update as the article's code is edited. The reader *completes* the tutorial by doing it, not reading it. This is the read-and-do-are-the-same-action core. (This is also the ≥1 cross-feature wiring idea: tutorials drive the real Forge/embed pipeline.)
- **Living blog posts.** Give the shared post template a designed reading layer: scroll progress, in-body TOC for long posts, share buttons (X, copy-link, "Open in Claude" for the post text), an author/date/reading-time meta strip, and — for posts about embed/AR/web-component — a live `<agent-3d>`/`<model-viewer>` demo so the post *shows* what it describes.
- **Related content + "next read" everywhere.** End every post and tutorial with algorithmically-related items (shared tags/topics) spanning *both* blog and tutorials and the matching docs page (`/docs/embedding`, `/docs/api-reference`, etc.). Keep the reader in motion across the whole content graph.
- **Earned newsletter capture at the moment of value.** Add the already-wired `data/newsletter-form` → `POST /api/newsletter/subscribe` block to the end of every post and to tutorial completion, with copy tuned to what they just read ("Get the next 3D-agent build guide"). Designed success/error/duplicate states; respect prior subscribers.
- **Activate the two orphaned `.md` files** (`decision-optimization-3d-ai-crypto`, `internets-second-species`) by routing and rendering them through a markdown-driven post path so good source material becomes live, discoverable content — and consider migrating the blog from 26 hand-maintained HTML files toward the markdown+template model the tutorials already use, eliminating the divergence.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: blog + tutorials are the funnel into Forge, the SDK, and $THREE — wire runnable steps to real `/api/forge`, related-content into docs, and newsletter capture at peak intent. Surface fresh content on the home content strip and the changelog. **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed.
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime.
- **Read before you write.** Match the existing patterns, naming, file organization, and the design tokens in `DESIGN-TOKENS.md`. Consistency compounds.
- **Accessibility + responsive (320 / 768 / 1440) + microinteractions** are part of done, not polish. Semantic HTML, ARIA, keyboard nav, focus rings, sufficient contrast.
- **Performance by default:** lazy-load heavy modules, debounce input handlers, paginate large lists, animate with `transform`/`opacity`. Ship no jank.
- **Changelog:** append a holder-readable entry to `data/changelog.json` for any user-visible change, then run `npm run build:pages` to validate.
- **Concurrent agents share this worktree.** Stage explicit paths only — **never** `git add -A` / `git add .`. Re-check `git status` + `git diff --staged` immediately before any commit. Never commit `api/*.js` esbuild bundles (check `head -1` for `__defProp` / `createRequire`).

## 6. Definition of done

- [ ] Feature is built, wired into navigation, and reachable by a real user.
- [ ] Exercised in a real browser via `npm run dev`; **no console errors or warnings** from your code.
- [ ] Network tab shows real API calls succeeding with real data.
- [ ] Every interactive element has hover / active / focus states; fully keyboard-navigable.
- [ ] Loading, empty, error, populated, and overflow states all designed and reachable.
- [ ] Existing tests pass (`npm test`); add tests for new logic you introduce.
- [ ] `git diff` self-reviewed — every changed line justified.
- [ ] Changelog updated if the change is user-visible.
- [ ] You would be proud to demo this to a room of senior engineers.

> Note: do **not** run `npm install` in this codespace (the cache is corrupted and it hangs the box). Use the already-installed dependencies.

## 7. Self-improvement loop (REQUIRED before you finish)

When you think you're done: **STOP.** Re-read §2.

1. Find the single weakest aspect of what you built and make it excellent. Repeat until nothing obvious remains.
2. Run the self-review protocol: **lazy check** (any shortcut, any half-wire, any hardcoded value where dynamic belongs?), **user check** (first-time user — does it make sense, is it findable, does it feel polished?), **integration check** (connects to the rest of the platform, navigable to/from?), **edge-case check** (0 / 1 / 1000, long names, network failure, expired session), **pride check** (portfolio-worthy? if not, fix what's stopping you).
3. Update `data/changelog.json` if user-visible.
4. **Delete this task file** — `prompts/feature-innovation/12_03_blog-tutorials-experience.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/12-home-and-content.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
