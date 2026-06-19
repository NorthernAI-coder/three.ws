# 🚀 Innovation Brief — Marketplace & the Buy/Unlock Critical Path

> **Task file:** `prompts/feature-innovation/06_01_marketplace-and-purchase.md`
> **Surface:** `/marketplace`, `/marketplace/(tools|skills|animations|onchain)/:id`, `/marketplace/agents/:id` (301 → `/agents/:id`), `/marketplace/avatars/:id` (301 → `/avatars/:id`)
> **Primary source:** `src/marketplace.js`, `src/marketplace-lobby.js`, `src/marketplace-detail.js`, `src/payment-modal.js`, `pages/marketplace.html`, backend `api/marketplace/[action].js`, `api/marketplace/purchase.js`, `api/marketplace/buy-asset.js`, `api/marketplace/_lib/services/MonetizationService.js`
> **Atlas reference:** `docs/ux-flows/06-marketplace-skills.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is someone who wants to buy a capability for their agent — a skill, an avatar, a whole onchain agent — and feels the same hesitation everyone feels before a crypto purchase: *Is this real? Will it work? What am I actually getting? Can I get my money back if it doesn't?* This surface exists to dissolve that hesitation completely and make acquiring agent capabilities feel like the most trustworthy, fluid commerce experience on the web. Two purchase rails run beneath it: `/api/marketplace/purchase` (individual skills, creator + platform-fee split, Solana-Pay-by-reference, optional gasless sponsorship) and `/api/marketplace/buy-asset` (whole avatars/agents/plugins, single full-amount leg, EVM/USDC-on-Base fallback). The modal lives in `src/payment-modal.js`.

"Gamechanging" here means: **the moment between "I want this" and "it's mine and working" is so fast, so legible, and so confidence-inspiring that buying onchain feels safer than buying on Stripe.** Previews you can actually try before you pay, an unlock that lands instantly and visibly, receipts that feel like proof of ownership rather than a toast that disappears. Invent the trust layer that crypto commerce has never had.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Stripe Checkout's trust and speed, Apple's instant-purchase confidence, Linear's transitions, Vercel's polish, Gumroad/Lemon Squeezy for digital-goods clarity). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/marketplace` and `/marketplace/` → `marketplace.html` SPA; `/marketplace/(tools|skills|animations|onchain)/:id` render inline via the SPA; `/marketplace/agents/:id` and `/marketplace/avatars/:id` are **301 redirects** to canonical `/agents/:id` and `/avatars/:id` (vercel.json). `?tab=` selects agents | avatars | onchain | skills | tools | memory | earn | purchases | mine.
- **Source:** `src/marketplace.js` (8.4k lines; entry `init()` ~L7730 → `bindEvents()` → `loadCategories()` → `loadList(true)` → `loadTheme()` → `loadCurrentUser()` → `fetchUserPurchases()` → `render()`). Detail: `loadDetail()` ~L4581, `loadAvatarDetail()` ~L4717. Skill purchase: `openPurchaseFlow()` ~L6824, `createPendingPurchase()` ~L6872, `buildSplTransferWithReference()` ~L7258, `pollConfirm()` ~L7299. Asset purchase: `openAssetPurchaseFlow()` ~L6890, `pollAssetConfirm()` ~L6936. 3D hero `src/marketplace-lobby.js` (`mountLobby()`), detail stage/preview/creator-modal `src/marketplace-detail.js`, embed widget `src/payment-modal.js` (`SkillPaymentModal` / `PaymentChip`).
- **Current flow:** ~9 required steps on the skill rail — browse → open detail → click "Unlock" → modal quote (`preparePurchaseTransaction`) → optional gasless pre-build → build SPL transfer with reference key → pre-flight balance check → wallet sign/send → on-chain confirm → poll `/:reference/confirm` (2.5s, 60s) → receipt → ownership refresh. Asset rail is ~7 steps via `buy-asset`.
- **What works today:** parallel initial fetches with skeletons; 3D lobby podium (max 5 featured, auto-rotates 8s, pauses on hover/focus); weekly theme strip; category/search(250ms debounce)/sort/price filters; IntersectionObserver infinite scroll; live SSE chat preview on detail (`/api/marketplace/agents/:id/preview`); creator modal (`/api/creators/:id`); gasless fee-payer sponsorship; already-owned short-circuit; insufficient-funds "Add funds" branch; signed receipt with Solscan link; tipped (409) / expired (410) verification branches; owner price editor (`/api/marketplace/asset-price`).
- **Real APIs / dependencies already wired:** `api/marketplace/[action].js` (categories, agents, theme, agents/:id, /versions, /similar, /preview), `/api/explore?source=avatar|onchain`, `/api/auth/me`, `/api/users/me/purchased-skills`, `POST /api/marketplace/purchase` (+`/:ref`, `/:ref/confirm`), `POST /api/marketplace/buy-asset` (+`/:ref`, `/:ref/confirm`), `GET /api/marketplace/check-skill-access`, `/api/billing/receipts`, `/api/creators/:id`, Solana RPC via `/api/solana-rpc`, `@solana/web3.js` + `@solana/spl-token` (lazy), `@solana/pay` (server `findReference`/`validateTransfer`), gasless tx builder `_lib/solana/gasless-tx.js`, EVM verifier `_lib/evm-payment-verify.js` (USDC on Base), `MonetizationService.js`.
- **Where it's mediocre, thin, or unfinished:** previews exist but you can't *try the skill you're about to buy* — only chat with the agent generally; there's no "what exactly do I get" manifest (tools, sample outputs, version history surfaced as value); trust signals are thin (no verified-creator, no refund/guarantee story, no live "X bought this today"); the 60s confirm poll is a blocking wait with little reassurance design; receipts vanish into a tab instead of feeling like a collectible proof-of-ownership; there is no cart / bundle / "buy this agent + these 3 skills" path; gift purchase exists in the API (`recipient`) but is barely surfaced; the 3D hero is decorative, not a discovery engine; no post-purchase "what now" moment that drives the user into actually *using* what they bought.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Try-before-you-buy, for real.** For every paid skill, let the buyer run the *actual skill* once against a sandboxed input directly in the detail panel (route a single metered invocation through the existing x402 / preview infra), then show the real output beside the Unlock button. Nobody else lets you watch the thing work before you pay for it. The "Unlock" CTA should read the buyer's own try-result back to them: "You just generated this. Unlock to keep it."
- **A "proof-of-ownership" receipt that's worth keeping.** Turn the post-confirm receipt into a shareable, signed ownership card (creator, skill, tx, date, on-chain reference) with an OG image and a `/collection`-deep-link — a thing a buyer screenshots because it looks like they own something, not because a toast appeared. Wire it to `/collection` (06_03) so the same artifact lives in their library.
- **Live trust rail in the modal.** Replace dead waiting with momentum: real "N people unlocked this in the last 24h" (from `agent_revenue_events`), verified-creator badge, escrow/guarantee language tied to the tipped/mismatch failsafes you already have, and a confirm-progress experience that narrates the on-chain steps (found tx → validating transfer → minting access) instead of a spinner.
- **One-tap bundles.** "Buy this agent + its 3 most-loved skills" as a single intent that fans out to the two rails and reports a unified result. Cross-sell from the detail page's skill list. This is the basket the marketplace is missing.
- **Gift & gating as first-class.** Surface the existing `recipient` gift path as a real "Gift this skill" flow with a claimable link, and let creators offer the first unlock free to a connected follower. Second-order: gifting drives new-wallet onboarding.
- **3D hero as a discovery engine.** Make the lobby podium reflect *what's selling right now* (top movers from analytics) and let selecting a podium avatar deep-link to its buy path — turn decoration into a conversion surface.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: a confirmed purchase should ripple into `/collection` (06_03), the creator's analytics (06_04), the agent's revenue events, and the buyer's notifications. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/06_01_marketplace-and-purchase.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/06-marketplace-skills.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
