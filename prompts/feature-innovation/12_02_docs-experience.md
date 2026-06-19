# 🚀 Innovation Brief — Developer Docs Experience

> **Task file:** `prompts/feature-innovation/12_02_docs-experience.md`
> **Surface:** `/docs` (SPA + all `/docs/<slug>`), `/docs/widgets` (standalone), API reference (`/docs/api-reference`, `/openapi.json`)
> **Primary source:** `docs/index.html` (docs SPA shell), `docs/*.md` + `docs/tutorials/*.md` (content), `public/docs-widgets.html` (standalone widgets page), `api/openapi-json.js` (OpenAPI spec)
> **Atlas reference:** `docs/ux-flows/12-home-and-content.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a developer evaluating three.ws: they want to embed a 3D agent, hit the API, wire up the SDK or MCP server, or understand ERC-8004 — and they want to do it *now*, ideally without leaving the docs. Docs exist to turn "interesting" into "integrated" with the least friction physically possible. Today's docs are a clean SPA that fetches markdown and renders it — competent, but passive: the developer reads, copies, and leaves to go try things elsewhere.

"Gamechanging" here means docs that are **interactive, runnable, and AI-native** — where the developer can run the embed code inline and see a live `<agent-3d>`, fire a real API request against `/openapi.json` from the page and inspect the response, copy a working snippet pre-filled with their own key, and hand the whole page to Claude with one click. The bar is "the best developer docs in web3 and 3D, full stop" — Stripe-grade clarity with live-playground depth, plus an AI-native layer no docs site has nailed yet. The existing "Open in Claude" button is the seed of something the rest of the industry hasn't built; make it the centerpiece.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world — Stripe API docs (the gold standard for clarity + try-it), Twilio/Supabase (runnable examples), Vercel/Cloudflare docs (speed + structure), and Mintlify/Scalar/Bruno (modern interactive API reference + AI search). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new: docs where reading and *doing* are the same action, and where an AI agent is a first-class reader, not an afterthought.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/docs`, `/docs/`, and `/docs/<slug>` all served by the SPA shell (`vercel.json` `/docs → /docs/index.html`, `/docs/([^./]+) → /docs/index.html`); slug becomes a hash route. **Exception:** `/docs/widgets` → `public/docs-widgets.html` (mapped *before* the generic `/docs/*` rule). Machine endpoint: `/openapi.json` → `api/openapi-json.js`.
- **Source:** SPA shell `docs/index.html`; content markdown in `docs/*.md` and `docs/tutorials/*.md`; standalone `public/docs-widgets.html`. Marked + highlight.js via CDN.
- **Current flow:** SPA = 1 required step (land → read) + 3 optional (sidebar search, copy-page, prev/next pager). `currentPath()` reads `location.hash` (or `/docs/<slug>`), defaulting to `start-here`. ~60+ slugs share this one SPA.
- **What works today:**
  - Sidebar with 9 sections (NAV array) + live **search** input that filters the nav by label.
  - Click a sidebar link → hash route → `GET /docs/<slug>.md` rendered: headings get anchor IDs, internal `.md` links rewritten to hash routes, code highlighted.
  - Per-page tools: **Copy page** (markdown to clipboard), **View as Markdown** (`/docs/<slug>.md` in a new tab), **Open in Claude** (`claude.ai/new?q=…`).
  - Prev/Next pager; mobile sidebar FAB + overlay.
  - `/docs/widgets` standalone: TOC anchor nav (`#quick-start`, `#widget-types`, `#urls`, `#embedding`, `#postmessage-api`, `#og-oembed`, `#csp-cors`, `#privacy`, `#faq`), code blocks (iframe/script/oEmbed/postMessage), reference tables, footer `<model-viewer>` demo (`/animations/robotexpressive.glb`).
- **Real APIs / dependencies already wired:** `GET /docs/<slug>.md` per page; marked + highlight.js CDNs; `/openapi.json` exists as a machine endpoint (not yet a rendered reference); `agent-3d` runtime + `model-viewer` available platform-wide.
- **Where it's mediocre, thin, or unfinished:**
  - **Docs are read-only.** Every code block is text. A developer can copy an embed snippet but cannot *run* it on the page — yet `<agent-3d>` and `model-viewer` are right there, used all over the platform. The single highest-leverage gap.
  - **No real API reference UI.** `/openapi.json` is a raw spec served to machines; `/docs/api-reference` is presumably a markdown page. There is no Stripe/Scalar-style three-pane, try-it, language-tabbed, request/response-explorer reference generated from the spec.
  - **"Open in Claude" is a single-page link.** It ships one page's text. It could ship structured, multi-page, task-scoped context ("set up the SDK," "embed + monetize") and become the defining AI-native docs feature on the web.
  - **Search is label-only.** It filters the sidebar nav by title — it does not search *content*, headings, or code. A developer searching "postMessage" or "x402" against the body gets nothing.
  - **No copy-code per block, no language tabs in the SPA** (the tutorial template has per-`<pre>` copy buttons; the docs SPA reportedly only has copy-*page*). No in-page TOC/scroll-spy for long pages.
  - **Two divergent doc systems.** The SPA and the standalone `/docs/widgets` page look and behave differently — inconsistent chrome, search, and AI affordances. The split is a seam users feel.
  - **No "last updated," versioning, or feedback ("was this helpful?")** signals.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Runnable code blocks.** Any fenced block tagged as an embed/web-component example gets a "Run" button that mounts a live `<agent-3d>` / `<model-viewer>` right under the code, sandboxed and editable — the developer edits attributes (animation, nameplate, background) and watches the live preview update. The embed docs become a mini-Playground. This is the read-and-do-are-the-same-action core.
- **A real, spec-driven API Reference.** Generate a three-pane interactive reference from `/openapi.json`: endpoint list, schema-typed parameters, language-tabbed snippets (cURL / JS / Python), and a **"Try it"** panel that fires the real request and renders the live response — pre-filling the developer's API key if present (link to `/dashboard/api` to get one). Stripe/Scalar-grade, generated from the source of truth so it never drifts.
- **AI-native docs, done right (the flagship).** Upgrade "Open in Claude" from one-page-text to **task-scoped context bundles**: a per-page "Ask Claude about this" plus curated "Start a build with Claude" bundles that package the right multiple pages (e.g. SDK + embed + monetize) into the `claude.ai/new?q=…` payload. Add an in-docs AI search/answer box grounded in the doc corpus (the platform already ships `/llms.txt`, `/llms-full.txt`, and worker LLM proxies — use them, no mocks). Make three.ws the docs site AI agents *prefer* to read.
- **Full-text content search with `⌘K`.** Replace label-only filtering with a real command-palette search across headings, body, and code across all slugs — keyboard-first, fuzzy, deep-linking to the matching heading anchor.
- **Per-block copy + language tabs + in-page TOC/scroll-spy** in the SPA, matching the tutorial template's polish so the two systems converge into one consistent experience. Fold `/docs/widgets` into (or visually unify it with) the SPA chrome.
- **"Was this helpful?" + last-updated + cross-links.** Lightweight feedback, freshness signals, and contextual "next steps" that wire docs into the rest of the platform: an embed doc links to the live Playground on `/`, the SDK doc to `/dashboard/api`, the MCP doc to the registry, the listings doc to `/launches`.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: the docs are where developers decide to adopt — wire runnable examples to the real Playground (home `#embed`), the API reference to `/dashboard/api` key issuance, and the AI bundles to the actual worker LLM proxies. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/12_02_docs-experience.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/12-home-and-content.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
