# 🚀 Innovation Brief — threews.sol Naming & $THREE Economy

> **Task file:** `prompts/feature-innovation/08_07_threews-naming.md`
> **Surface:** `/threews/claim` (SNS subdomain mint), `/three` ($THREE economy dashboard + rare-name studio)
> **Primary source:** `pages/threews-claim.html` (self-contained inline module; route `/threews/claim`) + `src/sns/pay-by-name.js`; `pages/three.html` → `src/three-economy.js` (`src/three-access.js` `getAccess`, `src/wallet.js` `initWalletButton`)
> **Atlas reference:** `docs/ux-flows/08-coin-launch-wallets.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user wants their agent to have a name a human can actually say and remember — `alice.threews.sol` instead of a 44-character base-58 string. The feature exists to make **human-readable agent identity** real: minting an on-chain SNS subdomain under `*.threews.sol`, with availability you can trust, rarity-based pricing in $THREE, and a `/three` economy dashboard that shows why the name (and the holder tier behind it) matters.

"Gamechanging" here means making a `*.threews.sol` name feel like a **must-have** — the difference between an anonymous wallet and a recognizable agent. Snappy availability checking, a rare-name studio that makes good names feel scarce and worth claiming, on-chain minting that's genuinely owned, and an economy dashboard that ties names, holder tiers, and the platform's $THREE flow into one coherent story of belonging.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (ENS's name search + rarity, Vercel's domain claim flow, Stripe's pricing clarity, Linear's instant feedback). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/threews/claim` (`#tw-label` input + `#tw-mint` button; `#tw-status` availability line; `#tw-result`) and `/three` ("The Flow" canvas viz, live stats, treasury/rewards wallets, holder-tier ladder, pricing explorer, rare-name studio).
- **Source:** `/threews/claim` rewrites to `pages/threews-claim.html` (self-contained inline module; no `pages/threews/` dir); pay-by-name plumbing `src/sns/pay-by-name.js`. `/three` → `pages/three.html` → `src/three-economy.js`; wallet/tier via `src/three-access.js` (`getAccess`) + `src/wallet.js` (`initWalletButton`).
- **Current flow:** `/threews/claim` — 4 steps: type label (lowercased, stripped to `[a-z0-9-]`) → debounced 350ms `GET /api/threews/subdomain?label=` (available vs claimed-by/owned-by) → Mint: `getCsrf()` (`GET /api/csrf-token`) → `POST /api/threews/subdomain {label}` + `x-csrf-token` → success "<full> minted" with showcase URL + Solscan tx link. `/three` — 1 required (+3 optional): boot fetches `/api/three/{catalog,stats,tier,access}` + `/api/token/price`, renders flow viz / stats / treasury+rewards wallets → optional connect wallet (`initWalletButton`, `wallet:changed` re-reads tier + applies discount) → optional rare-name studio (`GET /api/three/name-quote?name=` → free vs $THREE rarity price → links to `/threews/claim`) → optional tier ladder + pricing explorer.
- **What works today:** Debounced availability check; CSRF-gated on-chain SNS subdomain mint; rarity pricing surfaced via `/api/three/name-quote` ($THREE-denominated, common = free); holder-tier resolution from on-chain $THREE; live treasury/rewards wallet display; pricing explorer with connected-wallet tier discount; rare-name studio that hands off to `/threews/claim`.
- **Real APIs / dependencies already wired:** `/api/threews/subdomain` (GET check + POST mint), `/api/csrf-token`; `/api/three/{catalog,stats,tier,access,name-quote}`, `/api/token/price`; Solscan (tx link). On-chain SNS mint; wallet connect via global `initWalletButton`.
- **Where it's mediocre, thin, or unfinished:** The claim page is a single input + button — functional but it doesn't *sell* the name or make good ones feel scarce. Availability is a status line, not a search experience (no suggestions, no "this one's taken, try these," no rarity preview at the point of typing). The two surfaces (`/three` studio and `/threews/claim`) are loosely linked rather than one fluid name-discovery-to-mint journey. The minted name has no obvious afterlife — nothing shows where it lives, what it resolves to, or how to attach it to an agent. The economy dashboard explains the system but doesn't make the user *feel* the value of holding a tier or a name.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **A name search worth using.** Turn the claim input into a real search: live availability with rarity tier shown inline (free/common vs. short/dictionary/reserved priced in $THREE), smart suggestions when a name is taken, and a sense of scarcity that makes a good name feel like a find.
- **One fluid discovery-to-mint journey.** Fuse the `/three` rare-name studio and `/threews/claim` into a single flow — quote rarity, see the $THREE price (with the connected-wallet tier discount applied), and mint on-chain without losing context.
- **Give the name an afterlife.** After minting, show what it resolves to, where it lives, and a one-tap path to attach it to an agent — so a name is identity, not a trophy in a drawer.
- **Make the economy felt, not just shown.** Tie holder tier → name pricing → platform access so a connected holder sees concrete value (cheaper names, unlocked tiers) live, turning the dashboard into a reason to hold $THREE.
- **Cross-feature wiring:** offer name-claiming at the moment of agent creation and right after a `/launch` (a fresh coin-backed agent should get a fresh `*.threews.sol` name); resolve `*.threews.sol` identities in `/launches`, the Trader Card (`/claim-wallet`), and agent profiles so the name shows up everywhere the agent does; and apply the connected-wallet $THREE tier discount consistently across pricing surfaces.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed. (The mint must stay a real on-chain SNS subdomain mint; CSRF gating must remain.)
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation. (Not-signed-in CSRF failure, taken name, mint failure, network drop must each have a designed state.)
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime. ($THREE is the pricing/tier currency here — that is correct and intended; never introduce any other token alongside it.)
- **Read before you write.** Match the existing patterns, naming, file organization, and the design tokens in `DESIGN-TOKENS.md`. Consistency compounds.
- **Accessibility + responsive (320 / 768 / 1440) + microinteractions** are part of done, not polish. Semantic HTML, ARIA, keyboard nav, focus rings, sufficient contrast.
- **Performance by default:** lazy-load heavy modules, debounce input handlers, paginate large lists, animate with `transform`/`opacity`. Ship no jank. (Keep the 350ms availability debounce; do not hammer the subdomain endpoint.)
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
4. **Delete this task file** — `prompts/feature-innovation/08_07_threews-naming.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/08-coin-launch-wallets.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
