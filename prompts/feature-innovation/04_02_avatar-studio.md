# 🚀 Innovation Brief — Avatar Studio (the appearance builder that feeds every embed)

> **Task file:** `prompts/feature-innovation/04_02_avatar-studio.md`
> **Surface:** `/avatar-studio`, `/create/studio` (edit mode `?edit=<id>`)
> **Primary source:** `pages/avatar-studio.html`, `src/avatar-studio.js` (+ `avatar-studio-utils.js`, `avatar-studio-optimize.js`, `avatar-sculpt.js`, `voice/talk-scene.js`, `agent-accessories.js`, `idle-animation.js`, `account.js`)
> **Atlas reference:** `docs/ux-flows/04-embed-widget-studio.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user wants their agent to *look* like them, their brand, or their character — and they want it without learning Blender. Avatar Studio is the **upstream appearance builder**: starting from a base GLB, the user recolors skin/hair/outfit, adds hats/glasses/earrings, sculpts the face with morphs, hides garment layers, and saves a re-editable, optimized GLB to their account. That avatar then becomes selectable in Widget Studio and embeddable through the SharePanel/`<agent-3d>` flows. It exists so that the identity at the center of every embed is *theirs*, not a stock mannequin.

"Gamechanging" here means **deep customization that feels effortless** — the depth of a character creator (RPM/MetaHuman ambition, scoped to GLB+morphs) with the friction of picking a profile photo. A first-time user should land on a great-looking default, make it unmistakably their own in under a minute, and never see a broken morph, a blown-out optimize, or a lost edit. The avatar that comes out should be the thing people want *talking on their site* in the talking-agent widget.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Ready Player Me's editor, Apple Memoji/Genmoji, MetaHuman Creator, Figma's color/property panels, Linear's instant-feel UI). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/avatar-studio` and `/create/studio` (create from `/avatars/default.glb`); `?edit=<id>` reloads a saved avatar's appearance.
- **Source:** `pages/avatar-studio.html`, `src/avatar-studio.js` (+ `avatar-studio-utils.js`, `avatar-studio-optimize.js`, `avatar-sculpt.js`, `voice/talk-scene.js`, `agent-accessories.js`, `idle-animation.js`, `account.js`). Title: "Avatar Studio".
- **Current flow:** 7 required steps (+4 optional) — boot loads `BASE_GLB_URL` into a `TalkScene` viewport with idle breathing/blinking + accessory presets → (edit mode hydrates saved colors/morphs/accessories/hidden layers) → customize via tabs (Color: skin/hair/outfit swatches + hex; Hats; Glasses; Earrings; Face sculpt morphs), each applied live to the scene graph → optional show/hide garment layers + accessory search → **Save** (GLTFExporter exports the live scene, `avatar-studio-optimize.js` optimizes/validates the GLB, `account.js` uploads to `/api/avatars`, PATCHes appearance JSON so it stays re-editable, uploads a snapshot thumbnail) → the avatar appears in Widget Studio's library + embed/share panels.
- **What works today:** Live scene-graph editing; undo/redo history (up to 50); single-select tabs (hat/glasses) vs multi (earrings); GLTFExporter save with optimize/validate; appearance JSON round-trip for re-editing; idle animation (breathing/blinking) via `idle-animation.js`; `TalkScene` viewport shared with the voice stack; snapshot thumbnail upload; unsaved-changes tracking via `appearanceEqual`; signed-out save routes to login.
- **Real APIs / dependencies already wired:** `/avatars/default.glb`, accessory preset assets, `/api/avatars` (save + PATCH), avatar-snapshot upload, GLTFExporter, `/api/auth/me` (via `account.js`). Hands off to `/studio`, SharePanel (`/agent/<id>/embed`), `/a-embed.html`.
- **Where it's mediocre, thin, or unfinished:** Customization is **shallow relative to the bar** — finite swatch/accessory presets, sculpt limited to whatever morphs the base GLB ships. There's **no path from a real person to an avatar** surfaced here (selfie/photo → avatar exists elsewhere in the platform but isn't wired in). No preset "looks"/outfits to start from, no randomize/"surprise me," no save-as-variant. No live "this is how it'll talk" — the `TalkScene` is right there but the user can't hear/see the avatar speak or emote before committing it to an embed. Queued ops "swallow + log failures" — meaning some failures are silent, violating designed-error-state rules. Optimize/validate failures surface but without guided recovery. Mobile ergonomics of a tab+swatch+viewport layout are unproven at 320px. No accessibility pass on the swatch grid / sculpt sliders.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Curated "Looks" you start from, not a blank mannequin.** Ship a gallery of opinionated complete presets (outfit + palette + accessories + face baseline) — "Founder," "Degen," "Support Agent," "Streamer," "On-brand from my color." One tap sets everything; the user refines from a great starting point. Add **"Surprise me"** (seeded-random, reproducible) and **save-as-variant** so one base spawns a wardrobe.
- **Talk-test the look in place.** The `TalkScene` already powers voice — let the user press-to-talk or type a line and watch the *avatar they're editing* speak/emote/lip-sync via the `v1.avatar.*` bridge, right in the editor. The appearance builder and the talking-agent embed share the same character; prove the look works *as a talking agent* before save. (Wire to the same provider plumbing the talking-agent widget uses.)
- **Photo / selfie → avatar, wired in.** Surface the platform's existing selfie/scan-to-3D path as a first-class "Start from a photo" entry into the editor (the Widget Studio empty state already links "Scan yourself to 3D →" / "AI selfie →"). Make Avatar Studio the place those flows *land and refine*, closing a loop that's currently split across surfaces.
- **Brand-aware theming + palette intelligence.** An eyedropper / hex that derives a harmonious skin/hair/outfit palette, plus contrast-aware accent suggestions so the avatar reads well against the embed backgrounds it'll live on. Tie the chosen palette to the Widget Studio theme presets so appearance and widget brand stay coherent.
- **Cross-feature wiring — Avatar Studio ↔ Widget Studio ↔ Share/Embed:** After save, don't just dump back to a library — offer explicit next actions: "Use in a Widget" (`/studio?avatar=<id>`), "Get embed snippet" (SharePanel / `/a-embed.html?avatar=<id>`), "Open agent profile." Make `?edit=<id>` a true round-trip from those surfaces so editing appearance never loses the user's place. Surface "where this avatar is embedded" (count + links) so the builder sees their identity in use.
- **Real history + autosave.** Promote the 50-step history into visible undo/redo with keyboard shortcuts (Cmd/Ctrl+Z / Shift), draft autosave to survive a refresh, and a "compare to saved" diff so the user always knows what's unsaved. Replace silent `queueOp` failure-swallowing with designed, retryable error states.

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
4. **Delete this task file** — `prompts/feature-innovation/04_02_avatar-studio.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/04-embed-widget-studio.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
