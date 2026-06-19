# 🚀 Innovation Brief — glTF Validator

> **Task file:** `prompts/feature-innovation/03_04_gltf-validator.md`
> **Surface:** `/validation`
> **Primary source:** `public/validation/index.html`, `src/validation-page.js`, `src/validation-ui.js`, `src/validator.js`, `src/gltf-inspect.js`, `src/components/validator-report.jsx`, `src/components/inspect-report.jsx`, `src/erc8004/validation-recorder.js`, `src/erc8004/agent-registry.js`
> **Atlas reference:** `docs/ux-flows/03-3d-editing-viewer.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a creator about to publish or deploy a 3D asset — and they need to know it's *good*: spec-valid, performant, and trustworthy. Validation runs the official Khronos `gltf-validator` and the glTF-Transform inspector fully client-side, surfaces errors/warnings by severity plus optimization suggestions, and can **pin the report to IPFS and sign an on-chain attestation** (ERC-8004 validation record) so the asset's quality is verifiable.

"Gamechanging" here means turning validation from a chore into a **delightful pre-publish gate** that creators *want* to run — because it doesn't just judge, it *fixes*. Today it reports problems and stops. The best version explains each issue in plain language, one-click-applies the optimization (compress, dedupe, resize textures) via glTF-Transform, shows the before/after, and hands a clean, signed asset straight to the deploy flow. Make passing validation feel like leveling up, and make the on-chain attestation a badge of honor.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Khronos glTF Validator + Sample Viewer, gltf.report by Don McCurdy, RapidCompact, Babylon Sandbox, Vercel/Lighthouse-grade pass/fail UX). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/validation` (`vite.config.js` → `public/validation/index.html` → `src/validation-ui.js` + `src/validation-page.js`, + `src/validator.js`).
- **Source:** module at index.html:1040-1042 imports `ValidationDashboard` (validation-ui.js) and `ValidationPage` (validation-page.js); constructs the dashboard then the page (page references the dashboard for the on-chain hand-off). On construct, `ValidationPage` renders the Khronos sample chips, binds inputs, restores the active tab from the URL hash (validation-page.js:32-46).
- **Current flow:** ~4 required steps — arrive → provide model → read Validate report → read Inspect report; plus ~5 optional (download JSON, lightbox, pin & sign on-chain, browse records, submit report file).
- **What works today:** Three tabs **Validate / Inspect / Records** (default `validate`, restored from `#validate|#inspect|#records`). One pipeline for four input sources: drag-drop GLB, file picker, paste URL (+Enter), or Khronos sample chip (Box/Duck/BoomBox/DamagedHelmet/Avocado from jsdelivr) (validation-page.js:78-118). `_run(bytes, name)` fires both analyses in parallel (validation-page.js:145-189): Khronos `Validator.validateBuffer` → `gltf-validator` `validateBytes` (validator.js:57-66) and glTF-Transform `inspectModel` + `suggestOptimizations`. Validate tab renders `ValidatorReport` (counts bucketed by severity, aggregated codes, generator/asset metadata); Inspect tab renders `InspectReport` (stats + suggestions). Each report downloads as JSON; standalone lightbox via `Validator.showLightbox`. **Pin & sign on-chain:** `_handOffToDashboard` switches to Records, opens the submit modal pre-filled with the in-memory report + its `hashReport` hash, then `ValidationDashboard.submitReport` connects wallet, pins to IPFS, records the attestation. Records tab: enter agent id + chain id (or `?agent=&chain=`), Load past records (`getLatestValidation`) or Submit a report JSON.
- **Real APIs / dependencies already wired:** `fetch(url)` for URL/sample inputs; `gltf-validator` `validateBytes` (in-browser); `src/gltf-inspect.js` glTF-Transform (in-browser). On-chain: IPFS pin (`pinFile`), `recordValidation`/`getLatestValidation` (validation-recorder.js), `ensureWallet`/ethers + `window.ethereum`. The Validate tab can read the GLTFLoader-cached ArrayBuffer when invoked from the viewer (validator.js:26-34).
- **Where it's mediocre, thin, or unfinished:** It *diagnoses but doesn't treat* — glTF-Transform can compress, dedupe, resize, prune, and Draco/Meshopt-pack, but the page only *suggests*; the user must leave to actually fix anything. No before/after preview, no visual model render alongside the report (you validate blind — no 3D view of what you're judging). No single pass/fail headline score a creator can act on at a glance. No "fix all and re-validate" loop. The on-chain attestation is powerful but buried behind a tab switch and feels like an afterthought, not a celebrated badge. No connection to where assets actually get published (no "now deploy this clean asset"). Reports vanish on reload — no history of what you've validated.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **One-click fixes that actually transform the asset.** Make every optimization suggestion an *action*: compress textures, resize oversized maps, dedupe/prune, Draco/Meshopt-pack via glTF-Transform in-browser, then re-run validation automatically. Show before/after size, draw calls, and the new score. This is the leap from gltf.report to a true editor.
- **A live 3D preview beside the report.** Render the model (the platform's viewer already exists) next to the findings so the creator sees *what* they're validating; click a mesh-related warning to highlight the offending node. Validation you can see beats validation you read.
- **A single headline pass/fail "publish score"** (Lighthouse-style ring) combining spec-validity + performance budget, with the most impactful fixes surfaced first — the screenshot-worthy moment.
- **Make the on-chain attestation a celebrated badge.** After a clean pass, a one-tap "Pin & sign" that mints the verifiable quality record and produces a shareable, embeddable **Verified Asset** badge linking to the on-chain record — turn ERC-8004 validation into social proof, not a hidden sub-flow.
- **Cross-feature wiring:** Position validation as *the* pre-publish gate — accept hand-offs from Scene Studio export, Composer, and the `/app` editor ("Validate before you deploy"), and on a clean pass route straight into deploy / save-to-account / agent creation. Surface the validation badge on the agent's on-chain card and marketplace listing so buyers trust the geometry.
- **Validation history** (persist past runs per user/asset) so a creator sees their assets improve over time, with re-validate on demand.

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
4. **Delete this task file** — `prompts/feature-innovation/03_04_gltf-validator.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/03-3d-editing-viewer.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
