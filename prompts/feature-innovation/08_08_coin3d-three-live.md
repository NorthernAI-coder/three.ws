# 🚀 Innovation Brief — Coin 3D & $THREE Live

> **Task file:** `prompts/feature-innovation/08_08_coin3d-three-live.md`
> **Surface:** `/coin3d` (`?mint=` token in 3D) and `/three-live` ($THREE protocol pulse)
> **Primary source:** `pages/coin3d.html` → `src/coin3d/main.js` (deep-linked from `/launches`, MCP tool `pumpfun_token_3d`); `/three-live` → `pages/three-live.html` (self-contained Three.js inline module; empty-state helper `src/shared/state-kit.js` `emptyStateHTML`)
> **Atlas reference:** `docs/ux-flows/08-coin-launch-wallets.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user wants to *feel* a token's state, not read a table of numbers. `/coin3d` turns any mint into a living 3D object — a medallion, a galaxy of holders, a graduation ring that fills with bonding-curve progress. `/three-live` turns the $THREE protocol itself into a breathing organism that pulses with every real on-chain trade. The feature exists to make **token state a living thing** — discovery and conviction through embodiment, not spreadsheets.

"Gamechanging" here means a 3D representation so legible and alive that a glance tells you more than a chart would — holder concentration you can *see*, graduation progress you can watch fill, trade momentum you can feel as motion. It should be the most shareable way to look at a coin, and the most visceral way to watch a protocol's heartbeat.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (the awe of a great data-viz like Stripe's globe, the legibility of DexScreener mapped into space, the craft of a AAA real-time scene, Three.js showcase quality). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/coin3d` (full-screen Three.js scene seeded by `?mint=<base58>` & optional `&network=`) and `/three-live` (full-screen 3D "living organism" of the $THREE protocol + live trade ticker + hero badge).
- **Source:** `/coin3d` → `pages/coin3d.html` → `src/coin3d/main.js` (deep-linked from `/launches` cards and the MCP tool `pumpfun_token_3d`). `/three-live` → route `/three-live` → `pages/three-live.html` (self-contained Three.js inline module); empty-state helper `src/shared/state-kit.js` (`emptyStateHTML`).
- **Current flow:** `/coin3d` — 3 required (+1 optional): boot reads `mint`+`network`, shows loading overlay → parallel MCP calls `POST /api/pump-fun-mcp` (`getTokenDetails`, `getBondingCurve`, `getTokenHolders` top 12; logo from metadata URI, IPFS→HTTP, 6s timeout) → render spinning logo-textured medallion + holder galaxy (spheres sized by balance, tinted by concentration) + graduation ring filled to bonding-curve progress, OrbitControls → optional watchlist toggle (localStorage `ld_watchlist`, shared with `/launches`). `/three-live` — 1 (read-only/ambient): boot fetches `GET /api/three-token/stats` (no-store) + opens SSE `GET /api/agents/pumpfun-feed?kind=trades&mint=<$THREE>` → each trade emits a particle burst, whales send shockwaves, ticker prepends the trade → hero badge tracks connection state (connecting → live/quiet → reconnecting, auto-reconnect); stats refresh on interval.
- **What works today:** `/coin3d` renders a real interactive token scene from live pump.fun MCP data (medallion, concentration-tinted holder galaxy, graduation ring) with designed loading/error/empty overlays and IPFS logo fallback. `/three-live` streams real $THREE trades over SSE into a 3D organism with whale shockwaves, a live ticker, connection-state hero badge, auto-reconnect, and a reduced-motion-aware path.
- **Real APIs / dependencies already wired:** `/coin3d` → `/api/pump-fun-mcp` (pump.fun MCP), IPFS gateway for logo. `/three-live` → `/api/three-token/stats`, `/api/agents/pumpfun-feed` (SSE, fixed $THREE mint). All on-chain/live.
- **Where it's mediocre, thin, or unfinished:** `/coin3d` is a snapshot — it renders state once and doesn't *live*; there's no real-time trade motion the way `/three-live` has, no time dimension, no legend explaining what the user is seeing (sphere size, tint, ring fill). The holder galaxy is visually rich but not interactive enough (no per-holder detail on click, no Solscan link from a sphere). The two surfaces share a 3D language but don't share components — `/three-live`'s live-trade energy never reaches `/coin3d`. Neither makes it easy to share the exact view they're looking at.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Make `/coin3d` live.** Bring `/three-live`'s real-time energy to any mint: stream trades for the viewed token (the same pump.fun feed pattern) so the medallion pulses, the graduation ring climbs, and the holder galaxy shifts as real activity happens. Snapshot becomes heartbeat.
- **A legible holder galaxy.** Make every sphere interactive — click for the holder's balance, share, and a Solscan link — and add a clear legend (size = balance, tint = concentration, ring = graduation) so the visualization *teaches* what it shows.
- **Shareable views.** Let users capture and share the exact 3D state (a designed snapshot or a deep-linked camera angle) — the most screenshot-worthy way to show off a coin.
- **Shared 3D component language.** Extract the common primitives (particle bursts, shockwaves, connection-state badge, trade ticker) so `/coin3d` and `/three-live` feel like one cinematic system, not two pages.
- **Cross-feature wiring:** make `/coin3d` the canonical detail view linked from every `/launches` card and the `/launches/:mint` dossier; let a coin's `/coin3d` link to its 3D world (`/communities/:mint`) and its launching agent's profile; share the `ld_watchlist` so starring in 3D reflects in the feed; and from `/three-live`, deep-link the $THREE mint into `/coin3d` so the protocol pulse and the token object connect.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed. (All token/trade data must stay live from the pump.fun MCP and the real SSE feed.)
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation. (Missing `?mint=`, MCP failure, no holders, SSE disconnect, devnet must each have a designed state.)
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime. `/coin3d` is generic plumbing — it renders whatever mint the user passes via `?mint=`; never hardcode or recommend any specific non-$THREE mint. `/three-live` is fixed to the $THREE CA by design.
- **Read before you write.** Match the existing patterns, naming, file organization, and the design tokens in `DESIGN-TOKENS.md`. Consistency compounds.
- **Accessibility + responsive (320 / 768 / 1440) + microinteractions** are part of done, not polish. Semantic HTML, ARIA, keyboard nav, focus rings, sufficient contrast. (The 3D scenes must be reduced-motion-aware and offer an accessible, legible non-motion fallback.)
- **Performance by default:** lazy-load heavy modules, debounce input handlers, paginate large lists, animate with `transform`/`opacity`. Ship no jank. (Three.js scenes must hit a steady frame rate; dispose geometries/materials; cap particle counts.)
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
4. **Delete this task file** — `prompts/feature-innovation/08_08_coin3d-three-live.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/08-coin-launch-wallets.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
