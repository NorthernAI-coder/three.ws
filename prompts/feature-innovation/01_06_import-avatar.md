# 🚀 Innovation Brief — Import Avatar (`/import/rpm`)

> **Task file:** `prompts/feature-innovation/01_06_import-avatar.md`
> **Surface:** `/import/rpm` (import-rpm) — import any GLB/glTF by URL or file
> **Primary source:** `pages/import-rpm.html` (inline `<script type="module">`) + `src/account.js` (`saveRemoteGlbToAccount`)
> **Atlas reference:** `docs/ux-flows/01-onboarding-creation.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

People already have avatars — a Ready Player Me character, a VRoid model, a Mixamo rig, a GLB exported from Blender. This is the on-ramp that says "bring what you have, we'll give it a brain." The mission is to make importing an external avatar trustworthy and *delightful*: the user pastes a URL or drops a file and instantly sees their model, validated, normalized, previewed, and one tap from becoming a living, walleted agent — with zero anxiety about whether it "worked."

"Gamechanging" here means: import isn't a file-upload form, it's a red carpet for the broader 3D ecosystem. We accept the formats people actually have, we fix the common problems (bad bone names, wrong scale, missing materials) automatically, and we show the user exactly what they're getting before they commit. The best import experience in the avatar space, full stop.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best asset-import experiences (Figma import, Sketchfab upload, Unity package import, Cloudinary/Uploadcare flows, Ready Player Me's hub). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/import/rpm` (vercel route → `import-rpm.html`). The page loads anonymously; import is auth-gated at action time.
- **Source:** `pages/import-rpm.html` (inline module) + `src/account.js#saveRemoteGlbToAccount`.
- **Current flow:** 2 required + 1 optional. Two tabs — **Import from URL** (paste an `http(s)` GLB URL, validated; optional name) and **Upload file** (drag-drop/pick `.glb` ≤100 MB, validated by extension + size; optional name). Click Import/Upload → `runImport(...)` calls `saveRemoteGlbToAccount(source, { name, visibility:'public', tags:['rpm','imported'], source:'rpm_import', source_meta })` with staged progress callbacks (Fetching → Normalizing bones → Uploading → Saving) and a live progress bar. On success, `showSuccess(avatar)` swaps in a card "<name> is ready" linking to `/avatars/<id>`. A `not_signed_in`/401 redirects to `/login?return=<here>`.
- **What works today:** Real URL and file import; server-side source fetch; bone normalization; R2 presign/upload/commit; staged progress UI; friendly error mapping by `err.code`/`err.stage` (fetch / presign / commit / upload_blocked / size_mismatch); auth round-trip on 401.
- **Real APIs / dependencies already wired:** `saveRemoteGlbToAccount` (account.js — presign + remote GLB fetch/normalize + R2 upload + commit).
- **Where it's mediocre, thin, or unfinished:** No 3D preview before *or* after import — the user never sees the model on this page (success is just a text card + link). Only `.glb` is accepted; `.gltf`/`.vrm`/`.fbx`/Mixamo and RPM share-links aren't handled despite the route name implying RPM. No inspection of what was imported (poly count, bones, animations, has-rig, materials). No "import from a known source" helpers (paste an RPM avatar id/link, a Sketchfab URL). Defaults to **public** visibility silently. No batch import. The "Normalizing bones" step is opaque — the user can't tell if their rig survived.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Preview before commit.** Render the model in a live `model-viewer` the moment a URL/file is provided — orbit it, see materials, play any embedded animations — *before* the user clicks import. WYSIWYG import removes all the anxiety.
- **An import inspector that builds trust.** After fetch/normalize, show a report: poly count, texture count, bone count, rig status ("riggable / already rigged / static"), embedded animations, file size, and any auto-fixes applied (rescaled, renamed bones, regenerated materials). Make the "Normalizing bones" black box transparent.
- **Accept what people actually have.** Broaden beyond `.glb`: handle `.gltf` (+ companion bin/textures), RPM share-links/avatar IDs (resolve to GLB), and degrade gracefully with clear guidance for unsupported formats — turning the route's RPM name into a real promise. Detect humanoid rigs and offer auto-retargeting to the platform's animation set.
- **Visibility and licensing as a deliberate choice.** Don't silently default to public — present a clear private/public toggle with a plain-language explanation, plus a source/attribution field so imported community work is credited.
- **Cross-feature wiring:** the success state should offer one tap to "give it a brain" → `/agent/new?avatar_id=...&avatar_name=...`, "preview animations" in the studio, and "list on marketplace" — so import flows directly into the agent and discovery surfaces instead of dead-ending at `/avatars/<id>`. Surface this route prominently inside the `/create` hub as the "I already have a model" path.

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
4. **Delete this task file** — `prompts/feature-innovation/01_06_import-avatar.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/01-onboarding-creation.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
