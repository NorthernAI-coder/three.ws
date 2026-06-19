# 🚀 Innovation Brief — Embed snippet flow (SharePanel + AgentEmbedModal + `<agent-3d>` + `/embed.js`)

> **Task file:** `prompts/feature-innovation/04_03_embed-snippet-flow.md`
> **Surface:** Share button on agent profile/home (`SharePanel`); Agent Hub "Embed" (`AgentEmbedModal`); Dashboard avatar/agent "Embed" (`openAvatarEmbedModal`); embed targets `/agent/<id>/embed`, `/embed/avatar/<handle>`, `/a-embed.html`; scripts `/embed.js`, `/embed-sdk.js`, `/dist-lib/agent-3d.js`
> **Primary source:** `src/share-panel.js`, `src/share-panel-builders.js`, `src/share-panel.css`, `src/agent-embed-modal.js`, `src/agent-home-orphans.js`, `src/dashboard/dashboard.js`, `public/embed.js`, `/dist-lib/agent-3d.js`, `src/avatar-embed.js`
> **Atlas reference:** `docs/ux-flows/04-embed-widget-studio.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user has an agent or avatar on three.ws and wants it **live on their own site, blog, docs, Notion, WordPress, or React app** — fast, free, and looking great. This is the cross-cutting *embed experience*: the moment they click "Share" / "Embed," choose a look, copy one snippet, and paste it somewhere it instantly renders a living 3D agent. The `<agent-3d>` web component is the core primitive; `/embed.js` is the script-tag loader; SharePanel and the embed modals are the surfaces that hand it over. This feature exists to make three.ws **spread** — every embed is a billboard for the platform and a working product for its owner.

"Gamechanging" here means embedding a three.ws agent is the **easiest, most magical paste-and-go in the industry** — Stripe-Buy-Button / Tally / Cal.com / Spline-tier. One line, framework-native (React/Vue/Svelte/WordPress), themeable, accessible, performant, and *measurable*: the owner pastes it and later sees real analytics on how their agent performed in the wild. No build step, no API key for the basic embed, no jank, no layout shift.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Stripe Buy Button / Pricing Table embeds, Cal.com embed builder, Tally, Spline embed, Typeform, Intercom snippet install, Sentry/PostHog install flows). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s) / surfaces:** **Share** button on an agent profile/home (`agent-home-orphans.js` injects it → `new SharePanel({ agent }).open()`); **Agent Hub** "Embed" → `AgentEmbedModal` (`agent-hub-actions.js`); **Dashboard** avatar/agent "Embed" → `openAvatarEmbedModal` / `openAgentEmbedModal` (`dashboard.js`). Embed targets: `/agent/<id>/embed` (CSP `frame-ancestors *`), `/embed/avatar/<handle>`, `/a-embed.html?avatar=<id>`. Scripts: `/embed.js`, `/embed-sdk.js`, `/dist-lib/agent-3d.js`.
- **Source:** `src/share-panel.js` (`SharePanel`) + `src/share-panel-builders.js` (`buildEmbedUrl`, `buildIframeSnippet`, `buildWebComponentSnippet`) + `src/share-panel.css`; `src/agent-embed-modal.js`; `src/dashboard/dashboard.js`; `public/embed.js`; `/dist-lib/agent-3d.js`; runtime `src/avatar-embed.js`.
- **Current flow (SharePanel, 6 steps +3 optional):** Share → modal with permalink `/a/<slug|id>`, live preview iframe (`/agent/<id>/embed?preview=1`), pre-rendered snippets → optional copy link / open → customise (Background transparent/dark/light, Name plate on/off, Size small 320×420 / medium 420×520 / large 520×680; each re-renders snippets + reloads preview) → choose format + copy (**iframe** `<iframe src="/agent/<id>/embed?…">` or **Web component** `<script src="/dist-lib/agent-3d.js">` + `<agent-3d agent-id name-plate background>`) → optional OG preview (`/api/a-og?id=<id>`) + QR (canvas, SVG fallback) → paste anywhere; the embed page runs `src/avatar-embed.js` exposing the `v1.avatar.*` postMessage bridge.
- **What works today:** Three working embed entry points; iframe + `<agent-3d>` + SDK (`/embed-sdk.js` + `Agent3D.connect()`) snippet generation; default options omitted from URL to keep it canonical/short; `embed.js` reads `data-widget`/`data-widget-url`, `data-width/height/radius/border`, `data-reveal`, `data-poster`, `data-priority`, `data-motion` and supports multiple embeds per page with a sandboxed iframe at the script position; `<agent-3d>` observes `agent-id`/`background`/`name-plate`; `avatar-embed.js` bridge supports speak/emote/morphs/lookAt/mocap/idle/hotkeys/mic/state + RPM-compatible event aliases + same-origin BroadcastChannel; QR + OG card; "Free to embed — no wallet or on-chain deployment required."
- **Real APIs / dependencies already wired:** `/agent/<id>/embed` (preview + final), `/dist-lib/agent-3d.js`, `/embed-sdk.js`, `/embed.js`, `/api/a-og?id=<id>`, `/a/<slug|id>`, `/a-embed.html`, QR via `src/erc8004/qr.js`.
- **Where it's mediocre, thin, or unfinished:** **Three different embed surfaces** (SharePanel, AgentEmbedModal, dashboard modal) with **divergent options, copy, and snippet builders** — inconsistent and confusing; they should share one canonical builder and feel like one product. **No framework-native snippets** — React/Vue/Svelte/WordPress users must hand-translate an iframe (the gallery has a crude inline-style JSX iframe; nothing first-class). **No theming depth** beyond bg + name-plate + 3 sizes — no accent, radius, border, font, light/dark-auto, or "match my site." **No analytics** — owners get zero feedback on impressions/interactions/chats after pasting. Snippet quality details (lazy reveal, aspect-ratio to prevent CLS, `loading`/`title`/`sandbox`/ARIA on the iframe, reduced-motion) are uneven across the three surfaces. No "test paste" sandbox to see it render before committing. No install-verification ("we detected your embed is live"). SDK tab is example-only with no copy polish.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **One canonical embed engine, many surfaces.** Unify SharePanel / AgentEmbedModal / dashboard embed onto a **single snippet builder + options model** (extend `share-panel-builders.js`) so every surface produces identical, correct, accessible snippets. Same options, same copy, same QR/OG, same a11y — three entry points, one polished product.
- **Framework-native snippet tabs.** Generate first-class **HTML iframe / `<agent-3d>` / React / Vue / Svelte / WordPress shortcode / SDK** from one canonical URL+options builder, each idiomatic (JSX with proper attrs and an aspect-ratio wrapper, a Vue SFC fragment, a Svelte snippet, a WP shortcode/block) — copy-perfect, with a one-line "install" note per framework. Make pasting into *anything* trivial.
- **Real "test paste" + install verification.** A mini fake-website preview pane shows exactly how the embed looks in-page (light card / dark blog / docs column) before copy — and after, a lightweight **"is it live?"** check (via the embed's existing analytics ping) that tells the owner "your agent is live on example.com." Magic-moment confirmation, no guesswork.
- **Theming that matches the host site.** Extend options to accent, corner radius, border, font inheritance, name-plate style, and **light/dark/auto** (respects host `prefers-color-scheme`), with safe canonical-URL omission of defaults. Bonus: a "paste your brand color" that themes the embed coherently — and shares the same theme tokens as Widget Studio so an agent looks identical whether embedded via Studio widget or `<agent-3d>`.
- **Embed analytics loop (cross-feature, high value).** Ship a real, privacy-respecting analytics beacon from `/embed.js` + `<agent-3d>` (impressions, interactions, chats, voice sessions, referrer host) to a real endpoint, surfaced back in the dashboard / agent profile as "where your agent is embedded and how it's performing." Every other improvement is cosmetic next to closing this loop — embeds become a measurable growth channel.
- **Cross-feature wiring — converge with Widget Studio + Avatar Studio:** Surface the **Widget Studio `/embed.js` script snippet** and the **`<agent-3d>` web component** as peers in the *same* embed UI, so users discover both embedding systems from one place. From any embed modal, offer "Open in Studio" (full customization), "Edit appearance" (`/avatar-studio?edit=<id>`), and "Open agent profile." Make the `v1.avatar.*` bridge a first-class, documented, copyable capability ("make your embedded agent speak on scroll / on click") so embeds become interactive, not static.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed.
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime.
- **Read before you write.** Match the existing patterns, naming, file organization, and the design tokens in `DESIGN-TOKENS.md`. Consistency compounds.
- **Accessibility + responsive (320 / 768 / 1440) + microinteractions** are part of done, not polish. Semantic HTML, ARIA, keyboard nav, focus rings, sufficient contrast.
- **Performance by default:** lazy-load heavy modules, debounce input handlers, paginate large lists, animate with `transform`/`opacity`. Ship no jank. (Embeds especially: lazy reveal, aspect-ratio to prevent layout shift, respect reduced-motion.)
- **Changelog:** append a holder-readable entry to `data/changelog.json` for any user-visible change, then run `npm run build:pages` to validate.
- **Concurrent agents share this worktree.** Stage explicit paths only — **never** `git add -A` / `git add .`. Re-check `git status` + `git diff --staged` immediately before any commit. Never commit `api/*.js` esbuild bundles (check `head -1` for `__defProp` / `createRequire`).

## 6. Definition of done

- [ ] Feature is built, wired into navigation, and reachable by a real user.
- [ ] Exercised in a real browser via `npm run dev`; **no console errors or warnings** from your code.
- [ ] Network tab shows real API calls succeeding with real data.
- [ ] Every interactive element has hover / active / focus states; fully keyboard-navigable.
- [ ] Loading, empty, error, populated, and overflow states all designed and reachable.
- [ ] Existing tests pass (`npm test`); add tests for new logic you introduce (snippet builders especially).
- [ ] `git diff` self-reviewed — every changed line justified.
- [ ] Changelog updated if the change is user-visible.
- [ ] You would be proud to demo this to a room of senior engineers.

> Note: do **not** run `npm install` in this codespace (the cache is corrupted and it hangs the box). Use the already-installed dependencies.

## 7. Self-improvement loop (REQUIRED before you finish)

When you think you're done: **STOP.** Re-read §2.

1. Find the single weakest aspect of what you built and make it excellent. Repeat until nothing obvious remains.
2. Run the self-review protocol: **lazy check** (any shortcut, any half-wire, any hardcoded value where dynamic belongs?), **user check** (first-time user — does it make sense, is it findable, does it feel polished?), **integration check** (connects to the rest of the platform, navigable to/from?), **edge-case check** (0 / 1 / 1000, long names, network failure, expired session), **pride check** (portfolio-worthy? if not, fix what's stopping you).
3. Update `data/changelog.json` if user-visible.
4. **Delete this task file** — `prompts/feature-innovation/04_03_embed-snippet-flow.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/04-embed-widget-studio.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
