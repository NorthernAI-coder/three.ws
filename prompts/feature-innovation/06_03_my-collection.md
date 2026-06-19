# 🚀 Innovation Brief — My Collection (owned skills + subscriptions)

> **Task file:** `prompts/feature-innovation/06_03_my-collection.md`
> **Surface:** `/collection`
> **Primary source:** `pages/collection.html`, `src/collection.js`, backend `/api/users/me/purchased-skills`, `/api/subscriptions`, `/api/billing/receipts`
> **Atlas reference:** `docs/ux-flows/06-marketplace-skills.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user has spent money — unlocked skills, bought avatars, started trials, taken subscriptions — and `/collection` is where they come to see, and *act on*, everything they own. Today it's a receipt drawer. It should be a **living, actionable library of capability**: the place where you not only see what you own but immediately *use* it, manage it, prove it, and discover what to acquire next. Owned skills can come from two rails — the per-skill unlock (`/api/marketplace/purchase`) and free-install/x402 skills — plus subscriptions; many carry on-chain skill-NFT receipts.

"Gamechanging" here means the collection makes ownership *feel like power*: every owned item has a clear next action ("run it," "equip it to an agent," "renew," "download receipt," "view on-chain"), trials count down with urgency and a one-tap convert-to-owned, subscriptions never lapse by surprise, and the whole thing reads like a portfolio you'd show off rather than a billing history. Invent the post-purchase home that crypto digital-goods have never had.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Steam library, Apple's purchase/subscription management, Notion's organized workspaces, Linear's polish, a clean crypto wallet's owned-assets view). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/collection` → `pages/collection.html` (standalone page, not the marketplace SPA). `src/collection.js` auto-runs `load()` on script load.
- **Source:** `pages/collection.html`, `src/collection.js`. Backend `GET /api/users/me/purchased-skills`, `GET /api/subscriptions`, `GET /api/billing/receipts`.
- **Current flow:** ~4 required steps (+2 optional). `load()` renders skeleton grids → `Promise.all` fetches `/api/users/me/purchased-skills` and `/api/subscriptions` (both `credentials: include`) → **if both 401, reveal auth wall** (`#col-auth-wall`, "Sign in to see your collection," grids cleared) → on success render stats (skills count, active subscriptions, NFT-receipt count) → Skills panel renders owned/trial cards (thumbnail, skill name, agent, Owned/Trial badge, price, optional skill-NFT mint link to Solscan, purchase date, "View agent") → Subscriptions panel renders sub cards (Active/Expired badge, amount/period, renew/expiry date, "View agent"). Optional: tab switch Skills ↔ Subscriptions (counts in labels); "View agent" → `/marketplace/agents/:id` (→ `/agents/:id`).
- **What works today:** auth-gated load with auth wall; two-panel (Skills / Subscriptions) tabbed layout with live counts; stats header; Owned vs Trial and Active vs Expired badges; skill-NFT Solscan link when present; skeletons that don't linger; per-panel empty states ("No skills yet" → marketplace link; "No subscriptions"); `renderLoadError()` with Retry for network/HTTP/JSON failures.
- **Real APIs / dependencies already wired:** `GET /api/users/me/purchased-skills`, `GET /api/subscriptions`, `GET /api/billing/receipts` (receipt download is used elsewhere in the purchase flow), Solscan / Solana Explorer links, `/api/auth/me` (implied by the 401 auth wall).
- **Where it's mediocre, thin, or unfinished:** the page is read-only — you can *see* what you own but can't *do* anything with it from here (no "run skill," no "equip to agent," no "renew subscription," no "download receipt," no "convert trial → owned"); trials show a badge but no countdown, no remaining-uses urgency, no convert CTA; subscriptions show expiry but have no renew/cancel action and no lapse warning; there's no search/sort/filter even though a heavy buyer could own dozens of items (1000-item overflow undesigned beyond skeletons); receipts exist as an API but aren't surfaced as a satisfying owned artifact; the page is an island — it doesn't pull from the skills marketplace's installed-skills or feed back into the agents the user controls; no spend summary, no "you've invested $X across N capabilities" sense of a portfolio.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Every owned item gets a real action.** Make each card a launchpad: "Run it" (invoke the skill / open the x402 console from 06_02), "Equip to agent" (attach to one of the user's agents), "View on-chain," "Download signed receipt" (`/api/billing/receipts`). A library you can act from, not just admire.
- **Trials that convert.** Show a live countdown / remaining-uses ring on every trial, an urgency state as it nears expiry, and a one-tap "Keep it — unlock for $X" that drops straight into the existing purchase rail (06_01). Turning trials into purchases is direct revenue this page is leaving on the floor.
- **Subscriptions you actually manage.** Renew, cancel, and "expires in N days" warnings with a re-pay path; a unified upcoming-renewals timeline so nothing lapses by surprise.
- **A portfolio sense, not a ledger.** A header that reads "You own N capabilities across M agents · invested $X" and a shareable, signed "ownership card" (reuse the proof-of-ownership artifact from 06_01) — the collection as something a power user shows off.
- **Search, sort, filter, and overflow design.** For the heavy buyer: search by name/agent, sort by recency/price/usage, filter Owned/Trial/Subscription/has-NFT, and virtualized rendering so 1000 owned items stay smooth.
- **Close the loop to discovery.** "You own these research skills — agents who own them also use…" recommendations that route back into the marketplace, and surface co-installed skills from the skills marketplace (06_02) directly in the library.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: the collection should reflect installs from the skills marketplace (06_02), let owned capabilities be equipped onto the user's agents, convert trials through the purchase rail (06_01), and surface the same signed receipts the buy flow mints. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/06_03_my-collection.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/06-marketplace-skills.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
