# 🚀 Innovation Brief — Widget Studio (the embeddable 3D AI-agent builder)

> **Task file:** `prompts/feature-innovation/04_01_widget-studio.md`
> **Surface:** `/studio`, `/studio/` (deep links `?edit=<id>`, `?template=<id>`, `?type=<type>`, `?model=<url>`, `?avatar=<id>`)
> **Primary source:** `public/studio/index.html`, `public/studio/studio.js`, `public/studio/studio.css`, `public/studio/launch-panel.js`, `public/studio/knowledge-panel.js` (preview iframe = `/widget` → `src/app.js`)
> **Atlas reference:** `docs/ux-flows/04-embed-widget-studio.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a builder, founder, KOL, or community manager who wants a **living 3D AI agent on their own website** — a turntable of their token mascot, a talking on-brand support agent, a live trades canvas — without touching WebGL, shaders, or LLM plumbing. Widget Studio is where they assemble it: pick an avatar, pick one of 9 widget types, brand it, wire the agent's brain and voice, frame the camera, and walk away with an iframe + `<script>` snippet that drops onto any site. It exists to turn "I have a 3D agent somewhere" into "my agent is live on my homepage in 90 seconds."

"Gamechanging" here means the **single best embeddable-agent builder on the internet** — Stripe-Checkout-tier clarity, Intercom-Messenger-tier polish, Figma-tier live editing. A first-time anonymous visitor should configure a *talking, on-brand 3D agent* and see it respond in the preview before they ever sign in, then paste one line and have it live. The talking-agent AI widget specifically should feel like a product people screenshot: a 3D character that listens, speaks (voice in/out), knows the brand's docs (RAG), and can take actions — not a chatbot bubble with a mascot taped on.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Stripe Checkout/Elements config, Intercom Messenger customizer, Linear's settings craft, Figma live preview, Spline/Vercel embed flows, ElevenLabs voice agents). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/studio`, `/studio/` serving `public/studio/index.html`; preview iframe loads `/widget` (slim `src/app.js` shell); deep links `?edit=`, `?template=`, `?type=`, `?model=`, `?avatar=`.
- **Source:** `public/studio/index.html`, `studio.js`, `studio.css`, `launch-panel.js`, `knowledge-panel.js`.
- **Current flow:** 10 required steps (+5 optional) — boot/`fetchMe()` → render **9-type grid** (turntable, animation-gallery, talking-agent, passport, hotspot-tour, pumpfun-feed, kol-trades, live-trades-canvas, bonding-curve) + avatar list → pick avatar → pick type → live preview in `/widget` iframe via `postMessage({type:'widget:config'})` → configure Brand (name, bg, accent, caption, controls, auto-rotate, environment, public) with 200 ms debounced re-post → configure type fields → frame camera ("Use current view" reads `previewIfr.contentWindow.VIEWER.viewer.activeCamera`) → save draft (POST/PATCH `/api/widgets`) → generate embed modal (iframe + `<script async src="/embed.js" data-widget>` snippet, `/w/<id>` URL).
- **What works today:** All 9 types are `ready`; built-in **demo avatar (CZ, `/avatars/cz.glb`)** lets anonymous users configure + preview + generate a baked-fixture embed (`wdgt_demo_talking`) without sign-in; talking-agent supports agent name/title, greeting, system prompt, LLM provider (Anthropic/OpenAI/watsonx/Groq/OpenRouter/custom proxy), skills, voice in/out, rate limits, and a **Knowledge (RAG) panel** once saved; ⚡ Launch tab (`launch-panel.js`) can launch the agent's coin; device-frame switch (desktop/tablet/mobile); embed-modal include toggles emit `noAnimations=1`/`noChat=1`/`noControls=1`.
- **Real APIs / dependencies already wired:** `/api/auth/me`, `/api/auth/logout`, `/api/avatars`, `/api/avatars/public`, `/api/avatars/:id` (POST register), `/api/widgets` (GET/POST/PATCH/DELETE), `/api/widgets/:id/og` (poster), preview `/widget#…`, embed loader `/embed.js`, live `/w/<id>`, importmap `@solana/web3.js` + `@solana/spl-token` from esm.sh (Launch tab).
- **Where it's mediocre, thin, or unfinished:** Config is a long scroll of form fields, not a guided composition — no opinionated presets, no "remix this look." The talking-agent is configured *blind*: you write a system prompt and pick a provider but **can't actually talk to it inside the Studio before embedding** — the preview shows the model, not a live conversation/voice test. No way to test latency, voice, or a real RAG answer before paste. No theming beyond bg/accent (no font, radius, shadow, dark/light, glass). The embed modal hands over a snippet but offers **no framework-native code** (React/Vue/Svelte/WordPress) and **no post-embed analytics**. Camera framing is a single "use current view" with no presets. No undo/redo, no draft autosave, no shareable "studio session" link. Empty/error states exist but are utilitarian.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Live "talk to it" test bench, in-Studio.** Make the talking-agent widget *answer for real* inside the preview before embedding — a docked chat + push-to-talk (voice in/out) bar that hits the same LLM provider + RAG the embed will use, streaming the response and animating the 3D agent's lip/emote bridge (`v1.avatar.*` postMessage). Show live **latency, token, and cost** readouts per turn so the builder tunes the prompt/provider against reality, not vibes. "Sounds right → ship it."
- **Look presets + one-click remix.** Ship a curated set of opinionated **theme presets** (glass, neon-trade-desk, clean-light, brutalist, on-brand-from-accent) that set bg/accent/font/radius/shadow/environment/camera together. Add a brand-color eyedropper that derives an entire harmonious theme from one hex. Let the builder **"Remix"** any gallery widget or another public widget into a new draft (extends the existing `?template=` clone path) — composition over form-filling.
- **Smart camera director.** Replace single "use current view" with auto-suggested framing presets (hero portrait, three-quarter, full-body, orbit-start) computed from the GLB bounds, plus a recordable **intro orbit** the embed plays once on first paint. Screenshot-grade defaults so nobody ships an agent staring at the floor.
- **Embed analytics loop (cross-feature).** Every generated embed should report impressions, interactions, chats, and voice sessions back to a real endpoint, surfaced on a **"Live" tab** in the Studio for that widget (and on the agent profile / dashboard). Close the loop: the builder sees their agent working in the wild and tunes it. Wire this so `/dashboard` and the agent home page surface "your widgets" with real numbers.
- **Cross-feature wiring — Studio ↔ Avatar Studio ↔ Share/Embed:** Add an "Edit appearance" jump from any widget's avatar into `/avatar-studio?edit=<id>` and back (round-trip preserving the draft via `?edit=` on return). Surface the **SharePanel/`<agent-3d>`** snippet *inside* the Studio embed modal as a peer to the iframe/script options so the two embed systems converge. From a talking-agent draft, offer "Launch its coin" (⚡ Launch tab) and "Open agent profile" so a widget is never a dead end.
- **Paste-and-go magic moment.** The embed modal should feel like Stripe's: copy → a tiny "preview on a fake site" pane shows exactly how it'll look in-page; a "Send to my phone" QR; framework tabs (HTML / React / Vue / Svelte / WordPress shortcode) generated from the same canonical URL builder.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/04_01_widget-studio.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/04-embed-widget-studio.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
