# 🚀 Innovation Brief — Animation Gallery

> **Task file:** `prompts/feature-innovation/05_03_animation-gallery.md`
> **Surface:** `/animations`
> **Primary source:** `pages/animations.html`, `src/animations-gallery.js`, `/api/animations/clips`, `/avatar-embed` (preview iframe), `/pose`
> **Atlas reference:** `docs/ux-flows/05-discovery-social.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a creator who wants their avatar to *move* — to find a community animation clip (a dance, a wave, a walk cycle, an emote), see it play on a real avatar, and apply it to their own. `/animations` is the browsable library of community motion, with in-place previews on a live avatar and a payoff into `/pose`.

"Gamechanging" here means turning a clip catalog into a **motion try-on studio**: preview any clip on *your* avatar (not a default one), blend/sequence clips into a routine, scrub frames, and apply with one tap — making motion as remixable as a model. The payoff is creators who can choreograph their agents, and a library that feels like a living dance floor rather than a list of files.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Mixamo's animation browser, Adobe's motion library, Cascadeur, TikTok effect previews, Figma component playground). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/animations`.
- **Source:** `pages/animations.html`, `src/animations-gallery.js`; API `GET /api/animations/clips`; preview iframe `/avatar-embed`; payoff `/pose`.
- **Current flow:** 2 required (+3 optional) steps — module runs `load(true)` on import → shows loading → fetches `GET /api/animations/clips?include_public=true&visibility=public&limit=24` → renders animation cards (thumbnail or 🎬 placeholder, loop/once badge, duration, optional price/tags). Optional: search (280ms debounce → `syncUrl()` + reload), filter chips (loop / once → `kind=loop|animation`), hover/click/key a card preview → lazy `<iframe>` to `/avatar-embed?model=/avatars/cz.glb&anim=<id>` (mouseleave hides), scroll sentinel infinite-load. Payoff: "Open in Studio" → `/pose?anim=<id>`.
- **What works today:** In-place live-avatar preview via sandboxed iframe; loop/once filter; query (`?q=`, `?filter=loop|once`) hydration; designed empty / empty-search (echoes query + clear) / error+retry states; cursor infinite scroll.
- **Real APIs / dependencies already wired:** `GET /api/animations/clips` (`credentials: 'include'`), `/avatar-embed` iframe, `/pose` nav.
- **Where it's mediocre, thin, or unfinished:** Every preview plays on a **hardcoded default avatar** (`/avatars/cz.glb`) — never the user's. No way to preview your own avatar dancing. No sequencing/blending — clips are atomic; you can't preview "wave then walk." No scrub/timeline; you watch a loop or nothing. No sort by popularity/most-applied. Tags exist but aren't a navigable taxonomy. The card-to-pose payoff carries only the clip id, not any preview state (avatar choice, speed). Price/tags rendered but no economic loop wired.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Preview on *your* avatar.** When signed in (or via an avatar picker), swap the iframe model param to the user's GLB so every clip previews on the avatar they'll actually apply it to. Persist the chosen avatar across the session.
- **Routine builder.** Let users queue multiple clips into a sequence (drag to reorder, set per-clip speed/loop count), preview the whole choreography on a live avatar, and "Open in Studio" with the full routine prefilled — motion becomes composable.
- **Scrub + speed controls in-card.** A timeline scrubber and speed slider on the active preview so users can inspect a specific pose/beat, not just watch a loop.
- **Most-applied / trending motion.** Sort and a "popular this week" lane based on real apply counts, turning the library into a motion leaderboard creators want to land on.
- **Tag taxonomy as navigation.** Make tags first-class filters (dance / idle / combat / gesture…) with counts, deep-linkable, so motion is browsable by intent.
- **Apply-anywhere routing.** From a clip, route into `/pose`, or directly emote it in `/walk` (G + emote slot) / `/irl` — wire motion into the live 3D surfaces.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: animations feed `/pose`, `/walk` emotes, `/irl` agent behavior, and avatar profiles; a routine could be saved to an avatar; trending motion overlaps with `/discover`. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/05_03_animation-gallery.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/05-discovery-social.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
