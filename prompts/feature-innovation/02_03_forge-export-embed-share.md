# 🚀 Innovation Brief — Forge Delivery (export · embed · AR · showcase · pay-gate)

> **Task file:** `prompts/feature-innovation/02_03_forge-export-embed-share.md`
> **Surface:** `/forge` (delivery: get the model out, on a site, in a room, in the community)
> **Primary source:** `src/forge-export.js`, `src/forge-embed-panel.js`, `src/forge-embed-snippets.js`, `src/forge-ar.js`, `src/forge-showcase.js`, `src/forge-pay.js`
> **Atlas reference:** `docs/ux-flows/02-forge-text-to-3d.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user has a finished GLB and now wants to *do something with it in the world* — download it in the right format, drop it on their website, see it on their desk in AR, share a link, or get discovered in the community feed. Generation is worthless if delivery is clumsy. This surface is the last mile: it decides whether a forged model becomes a file in a downloads folder or a live asset embedded on a portfolio, scanned into a living room, and remixed by the next visitor. It also houses the **$THREE pay-gate** for High generations — the moment where a non-holder either holds, pays per-generation, or steps down.

"Gamechanging" here means making the forged model *travel*: a one-line embed that looks pro on any site, a desktop→phone AR handoff that just works, a share link that previews beautifully, and a community showcase that turns delivery into a discovery flywheel. And it means making the pay-gate feel like a fair, instant, on-chain perk — not a paywall ambush.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Sketchfab embeds + AR, model-viewer's `<model-viewer>` showcase, Polycam/Luma share pages, Stripe/Linear for the clarity of a pay flow). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/forge` result panel; `/forge/embed?src=<glb>` (zero-dep viewer page used by iframe embeds + AR handoff); community showcase strip on `/forge`. (`vercel.json` rewrites to `pages/forge.html`.)
- **Source:**
  - `src/forge-export.js` (~307 lines) — in-browser format menu beside Download: **OBJ** (geometry+UVs), **STL** (binary, print), **PLY** (binary, scan/point-cloud), **USDZ** (textured AR for iPhone/Vision Pro). three.js + exporters load lazily; parsed scene cached per model URL. No worker, no upload. (GLB Download anchor itself is owned by `src/forge.js`.)
  - `src/forge-embed-panel.js` (~270 lines) + `src/forge-embed-snippets.js` (~95 lines) — two real embeds: **iframe** → `/forge/embed?src=<glb>` (orbit + AR + branding, no scripts/CORS), and **web component** → a `<model-viewer>` snippet. Reads the live GLB URL off the result bar's Download link; size presets + escaping + absolute-URL helpers live in the snippets module. Uses `src/shared/modal.js`.
  - `src/forge-ar.js` (~208 lines) — desktop shows a **QR to `/forge/embed`** (scan → opens on phone → one tap to AR); touch devices launch AR straight from the page viewer. Reuses the zero-dep QR encoder (`src/erc8004/qr.js`) + shared Modal. No network calls.
  - `src/forge-showcase.js` (~415 lines) — "Fresh from the Forge" community feed (`GET /api/forge-gallery?scope=community`). Each card: click → opens in the main viewer via the `forge:open-creation` hook; **Remix** → copies the prompt into the composer. Thumbnail fallback chain (`preview_image_url` → captured model-viewer frame). Hidden when the store is empty.
  - `src/forge-pay.js` (~308 lines) — pay-per-use for **High** in **$THREE**: drives quote → sign → settle (`src/token-pay.js` → `/api/token/quote` + `/api/token/settle`) behind a designed status modal (pricing → approve → confirming → verifying), returns `{ paymentId, refId }` so the caller retries generation with the proof. Every recoverable state designed (no wallet, sign-in, cancelled, not enough $THREE → Get $THREE, settlement failure → Retry).
- **Current flow (post-result, optional):** result lands → **Download GLB** (stamps attribution, reports `downloaded:true`) or pick a format from Export → open **Embed** (copy iframe / web-component snippet) → **View in AR** (QR on desktop, native on phone) → **Share** → showcase auto-lists finished public creations for others to open/remix. High-tier gate (`402 three_hold_required`) → upsell → hold $THREE or pay-per-generation via `forge-pay.js`.
- **What works today:** Real client-side multi-format export (no upload); real zero-dependency iframe + web-component embeds against a real `/forge/embed` viewer; real desktop→phone AR via QR; real community feed with remix; real on-chain $THREE quote/settle pay rail with fully designed states. Poster capture (`POST /api/forge-poster`) for thumbnails; galleries (`GET /api/forge-gallery`, `GET /api/forge-creation?id=`).
- **Real APIs / dependencies already wired:** `GET /api/forge-gallery?scope=community&limit=24` (showcase), `GET /api/forge-gallery?limit=24` (your creations), `GET /api/forge-creation?id=`, `POST /api/forge-poster`, `POST /api/forge-feedback` (downloaded/verdict). Pay: `src/token-pay.js` → `POST /api/token/quote` + `POST /api/token/settle` ($THREE). `src/shared/glb-attribution.js` (stamping), `src/shared/modal.js`, `src/erc8004/qr.js`. model-viewer 4.0.0 (CDN), `ORIGIN = https://three.ws`.
- **Where it's mediocre, thin, or unfinished:** Delivery is **five disconnected modal/menus** with no unified "Publish/Share" hub. The share link previews are not guaranteed to render rich OG cards per-creation. The embed page (`/forge/embed`) is functional but bland — no theming, no custom controls, no analytics for the embedder. AR is QR-only on desktop with no fallback if the camera/phone path fails. The showcase is a flat reverse-chron strip — no filtering by category, no trending, no creator attribution links. The pay-gate is solid but **isolated from the holder economy** — it doesn't reinforce *why* holding $THREE beats paying each time, and post-payment there's no receipt/history.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **One "Publish" hub.** Collapse export + embed + AR + share into a single, sequenced delivery panel that reads like a destination chooser: *Download* (format-aware), *Put it on a site* (embed), *See it in your space* (AR), *Share a link* (rich OG card), *Post to the Forge* (showcase). One coherent surface beats five scattered menus and is the thing people screenshot.
- **A share page worth sharing.** Make every `/api/forge-creation?id=` open render a genuinely beautiful, fast, OG-rich share page (real per-creation poster from `forge-poster`, prompt, engine, remix CTA) — so a pasted Forge link in Discord/X looks as good as a Sketchfab link, and "Remix" pulls a stranger straight into the composer.
- **Themed, smarter embeds.** Upgrade `/forge/embed` with optional theming (accent/background/auto-rotate/AR-on params already plumbable through `forge-embed-snippets.js`) and a "copy a styled snippet" flow, so an embedder's site never looks like a generic gray box.
- **Discovery showcase, not a strip.** Add category filters (reuse the auto-category taxonomy: Avatar/Creature/Item/Accessory/Scene/Vehicle), a "Trending / Newest" toggle, and creator attribution that links onward — turning delivery into a flywheel where shared models pull new users into Forge.
- **Hold-vs-pay clarity + receipts.** At the pay-gate, show the honest math (one pay-per-use now vs. holding $THREE for unlimited High) with a live link to `/three`, and after a successful settle, persist a receipt the user can see in their creations/history. Keep $THREE the only coin — never reference any other.
- **Cross-feature wiring (required ≥1):** wire delivery into the rest of three.ws — "Embed on your agent profile" / "Set as agent avatar", showcase remix → composer (already hooked, deepen it), and a "Launch this as a collectible" path that respects the platform's launch records. Make a forged model a first-class asset across avatars, profiles, compose, and the launch feed — not a one-off download.

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
4. **Delete this task file** — `prompts/feature-innovation/02_03_forge-export-embed-share.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/02-forge-text-to-3d.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
