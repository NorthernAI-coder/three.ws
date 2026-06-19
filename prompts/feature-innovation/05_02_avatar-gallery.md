# 🚀 Innovation Brief — Avatar Gallery

> **Task file:** `prompts/feature-innovation/05_02_avatar-gallery.md`
> **Surface:** `/gallery`
> **Primary source:** `public/gallery/index.html`, `public/gallery/gallery.js`, `public/gallery/gallery.css`, `/api/avatars/public`, `/api/forge-gallery`, `/api/avatars`
> **Atlas reference:** `docs/ux-flows/05-discovery-social.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a creator browsing the community's public 3D avatars, accessories, items, scenes, and creatures — looking for something to *use*: a model to drop into the studio, an accessory to equip on their own avatar, a creature to remix, or inspiration from what others forged. `/gallery` is the showroom for everything 3D the community has made public, plus a "From the Forge" community section of prompt-generated models.

"Gamechanging" here means turning a thumbnail grid into a **3D try-before-you-take experience**: spin, inspect, and *equip accessories onto your own avatar live in the browser* before committing, see what's being forked and remixed most, and make the path from "I like this" to "it's on my avatar" a single fluid motion. The gallery should feel like a living wardrobe and prop room for the agent economy — something you can't get from a flat NFT gallery.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Sketchfab's 3D browsing, Ready Player Me's avatar wardrobe, Figma Community remix culture, Roblox's catalog try-on, Vercel templates). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/gallery`.
- **Source:** `public/gallery/index.html`, `public/gallery/gallery.js`, `public/gallery/gallery.css`; APIs `GET /api/avatars/public`, `GET /api/forge-gallery`, `GET /api/avatars` (equip modal), `GET /api/auth/me` (chip).
- **Current flow:** 2 required (+6 optional) steps — land → `renderCats()` + `resetAndLoad()` fetches `GET /api/avatars/public?limit=24&totals=1`, renders cards; then `loadForgeSection()` fetches `GET /api/forge-gallery?scope=community&limit=16` (deduped by prompt). Optional: search (250ms debounce), category chips (Avatars / Accessories / Items / Scenes / Creatures), tag chips, sort (newest / alpha), infinite scroll or Load more, per-card Embed modal, accessory "Equip" modal.
- **What works today:** Lazy auto-rotating `<model-viewer>` per card (poster = thumbnail) or `<img>`; tag chips, onchain badge, fork count; URL-param hydration; Equip flow (fetches user's avatars via `/api/avatars`; 401 → sign-in CTA; else lists ≤12, choose → `/avatars/:id/edit?equip-glb=…&equip-bone=Head`); payoff links — thumbnail → `/app#model=<glb>`, "Use" → `/studio?avatar=<id>`, "Animate" → `/pose?avatar=<id>`, "View avatar" → `/avatars/<id>`.
- **Real APIs / dependencies already wired:** `/api/avatars/public`, `/api/forge-gallery`, `/api/avatars`, `/api/auth/me`, `model-viewer` CDN, `onchain-badge.js`, `template-picker.js`, clipboard API.
- **Where it's mediocre, thin, or unfinished:** The forge section swallows errors silently (no empty/error UX). Equip is a *redirect* to the editor — there is no live preview of the accessory on your avatar before you commit; bone target is hardcoded to `Head`. Cards are isolated — no remix lineage / "forked from" visualization despite a fork count existing. No way to compare or favorite. Inspection is auto-rotate only; no manual orbit/zoom hero view. Sort is thin (newest/alpha) with no "most forked/used."

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Live in-browser equip preview.** Before redirecting, load the user's selected avatar GLB + the accessory GLB in a `<model-viewer>`/Three.js mini-stage, let them pick the bone (Head / Hand / Back / Hip…) and nudge position, and *see it attached live*. Only then "Apply" → editor with the chosen transform. Kill the hardcoded `Head` assumption.
- **Remix lineage graph.** The fork count is dead data. Make each model show "forked from →" and "N remixes" as clickable lineage, so a creature's family tree is browsable. Surface a "Most remixed this week" lane that turns the gallery into a creative leaderboard.
- **Wardrobe try-on hero.** A pinned "your avatar" silhouette (when signed in) that any accessory card can be dragged/tapped onto for an instant preview — turn the gallery into a dressing room.
- **Compare tray.** Select 2–4 models into a side-by-side 3D compare view (synchronized orbit) before deciding — invaluable for accessories/creatures.
- **Finish the Forge section properly.** Real loading skeletons, designed empty ("No community forges yet — be the first") and error+retry states, and wire Remix → the forge with the source prompt prefilled.
- **Favorites + "use in" routing.** Heart a model; from a favorite, one tap routes it into `/studio`, `/pose`, `/walk` (as avatar), or `/irl` (as placed agent).

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: the gallery feeds `/studio`, `/pose`, `/walk`, `/irl`, and avatar edit; remix lineage overlaps with the forge and agent profiles; equipping touches the avatar editor. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/05_02_avatar-gallery.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/05-discovery-social.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
