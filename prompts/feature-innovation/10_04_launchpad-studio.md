# 🚀 Innovation Brief — Launchpad Studio (Hosted Page Builder)

> **Task file:** `prompts/feature-innovation/10_04_launchpad-studio.md`
> **Surface:** `/launchpad` (publishes to `/p/<slug>`)
> **Primary source:** `pages/launchpad.html` → inline `<script type="module">` → `src/editor/launchpad-studio.js` (`mountLaunchpadStudio`)
> **Atlas reference:** `docs/ux-flows/10-chat-brain-labs.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user opens `/launchpad` to **build and publish a hosted page for their agent in minutes — no code**. They're an agent creator who wants a real landing page (a concierge, a showroom, a token launchpad) with their brand, their 3D avatar, and their payout wallet, living at a shareable `/p/<slug>` URL. This surface exists so anyone can go from "I have an agent" to "I have a live page people can visit and transact on" without touching HTML or a deploy pipeline.

"Gamechanging" here means a **no-code hosted page builder for agents** that rivals the polish of Linktree/Carrd/Framer but is purpose-built for living 3D agents: real-time WYSIWYG editing, beautiful templates, an embedded 3D avatar that *moves*, and one-click monetization (Pump.fun mint with creator-fee split — generic runtime mint, $THREE-compliant) baked in. The result should be a page the creator is proud to put in their bio.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Framer, Carrd, Linktree, Vercel/v0, Webflow). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new — a page builder where the live preview *is* the canvas, the agent avatar is alive on the page, and publishing to a real hosted URL with on-chain monetization is a single confident click.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/launchpad` (optional `?template=&slug=&wallet=&website=&avatar=` query hydration); publishes to `/p/<slug>`.
- **Source:** `pages/launchpad.html` → inline `<script type="module">` → `src/editor/launchpad-studio.js` (`mountLaunchpadStudio`). 3-pane layout: sidebar / live-preview stage / config rail, mounted into `#root`.
- **Current flow:** 6 required (+1 optional) steps — open with a default template (`token-launchpad`) and recent-projects from localStorage → pick a template card (Token Launchpad, Concierge, Showroom…) → fill the config form (slug, brand color, payout wallet, website, theme, avatar, monetization/chain) with the center stage updating live → (optional) attach a 3D avatar (agent-3d element) into the avatar-stage slot → add the payout wallet address (required for publish) → click Publish → `POST /api/launchpad/publish`; on success hosted at `/p/<slug>`, owner token kept in localStorage for re-edits.
- **What works today:** template picker; live-updating preview; config rail for slug/brand/wallet/website/theme/avatar/monetization/chain; 3D avatar slot; new-vs-edit via `?slug=` hydration; owner-only sections hidden on 401; recent-projects in localStorage; publish to `/p/<slug>` with owner token; Token Launchpad template wires a one-click Pump.fun mint with creator-fee split (generic runtime mint, $THREE-compliant).
- **Real APIs / dependencies already wired:** `POST /api/launchpad/publish`, `GET /api/launchpad/get` (hydrate existing), `/api/agents` (my-agents avatar picker), Pump.fun launch plumbing (runtime mint, creator-fee split), agent-3d / Three.js for the avatar preview.
- **Where it's mediocre, thin, or unfinished:** publishing is **blocked with a raw thrown string** ("Add your payout wallet address.") rather than inline guided validation; editing is a form-fills-a-preview model, not direct manipulation (no click-on-the-page-to-edit, no section reordering, no add/remove blocks). Template variety and per-template content depth are thin. No custom-domain, no SEO/OG-image control for the `/p/<slug>` page, no analytics for the page owner (visits, conversions, tips). No live publish status beyond an ok/err line, no preview-as-published, no versioning/unpublish/duplicate. The avatar on the page is a static preview, not the *talking* presence the platform already has.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Direct-manipulation editing:** click any element on the live preview to edit it in place; drag to reorder sections; add/remove content blocks (hero, bio, links, gallery, FAQ, tip jar, token chip). The preview becomes the canvas, not a mirror of a form.
- **Turn the page avatar into a living agent:** embed the Talking Head / agent-3d presence so the `/p/<slug>` page greets visitors and can *talk* — pulling the agent's persona from `/api/agents`. A landing page where the agent literally welcomes you is the screenshot moment.
- **Owner growth tools:** an OG-image generator for rich link previews, SEO controls, and a real owner analytics panel (visits, link clicks, tips, mint conversions) for the published page — give creators a reason to come back and iterate.
- **Robust publish lifecycle:** inline guided validation (never a thrown string), publish/unpublish/duplicate/version, "preview as published," slug-availability checking, and a clear share/QR step on success.
- **Cross-feature wiring (required):** the builder should pull avatars and personas from `/api/agents` and let "save as agent" round-trip — a page built here links to **`/chat?agent=<id>`** ("talk to this agent"), **`/agents/:id`** (full profile), and surfaces the agent's launched $THREE/pump token chip live via `/api/pump/by-agent`. The published `/p/<slug>` should be a first-class destination cross-linked from the agent's profile and the marketplace, so a creator's agent, page, chat, and token feel like one connected product.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed.
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint, e.g. the Token Launchpad template) and platform launch records rendered at runtime.
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
4. **Delete this task file** — `prompts/feature-innovation/10_04_launchpad-studio.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/10-chat-brain-labs.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
