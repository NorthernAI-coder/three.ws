# 🚀 Innovation Brief — Claim Wallet (Trader Card)

> **Task file:** `prompts/feature-innovation/08_03_claim-wallet.md`
> **Surface:** `/claim-wallet`
> **Primary source:** `pages/claim-wallet.html` → `src/claim-wallet.js`
> **Atlas reference:** `docs/ux-flows/08-coin-launch-wallets.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a Solana trader with a real pump.fun track record who wants to *own* that reputation publicly — to prove "this wallet, with these wins, is me." The feature exists to turn an anonymous wallet's on-chain history into a **verified, shareable Trader Card**, claimed by cryptographic proof of keypair control (SIWS, gasless, no transaction). The proof matters: anyone can paste an address, but only the keypair holder can claim it.

"Gamechanging" here means making verified reputation **viral and trustworthy** — a card good enough that traders want it on their profile and in their bio, and credible enough that others trust the badge. Proving control should feel like minting credibility, not filling out a form. The shareable artifact is the growth loop.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Stripe's verified badges, GitHub's contribution graph, Linear's profile cards, the polish of a Phantom signing prompt). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/claim-wallet` (`#cwInput` address field + `#cwBtn` Preview; results render in `#cwResult`).
- **Source:** `pages/claim-wallet.html` → `src/claim-wallet.js`.
- **Current flow:** Preview path is 3 steps; full claim is 8 — boot warms `/api/auth/me` (`?wallet=` pre-fills + auto-previews) → paste base-58 wallet (validated by `WALLET_RE`) → Preview `GET /api/traders/preview` renders the Trader Card (label, win rate / early-win / smart-money score / net PnL / dumps + up to 15 recent pump.fun coins) → CTA branches by state → claim: detect provider → `connect()` → abort if pubkey ≠ previewed wallet → `nonce-solana` → `signMessage` (gasless) → `link-solana` (409 takeover via `window.confirm` + `takeover:true`) → re-read linked wallets → claimed state.
- **What works today:** Public preview; SIWS proof of keypair control; connected-wallet-must-match guard; 409 takeover; claimed/unclaimed/signed-out CTA branching; share via Web Share API or Twitter intent; claimed status verified against `/api/auth/wallets` (chain_type=solana).
- **Real APIs / dependencies already wired:** `/api/auth/me`, `/api/traders/preview`, `/api/auth/wallets`, `/api/auth/wallets/nonce-solana`, `/api/auth/wallets/link-solana`. Wallet providers: Phantom/Solana/Backpack/Solflare.
- **Where it's mediocre, thin, or unfinished:** The Trader Card is a stats block, not a *trophy* — it doesn't feel like something you'd pin to a profile or paste in a bio. The share path uses a text intent rather than a designed, screenshot-worthy card image. The `notFoundHtml` ("wallet not yet indexed") is a dead end with no next step. There's no celebratory claim moment, no sense of scarcity or rank, and the verified state isn't visually distinct enough to read as *trust* at a glance. The proof ceremony (the most trustworthy part) is buttons, not a guided, reassuring flow.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **The Trader Card as a shareable artifact.** Generate a designed, OG-image-ready card (real stats baked in) so a share produces a beautiful preview in Twitter/Discord/Telegram — the viral surface. The card *is* the marketing.
- **A verified-claim moment.** When SIWS succeeds, make it feel earned: a designed confirmation, the verified badge animating in, "this reputation is now provably yours." Trust signals deserve celebration.
- **Rank and scarcity.** Contextualize the stats — percentile win rate, smart-money standing, early-win streaks — so the card reads as a leaderboard position, not isolated numbers. Make people want a better card.
- **Rescue the not-found state.** When a wallet isn't indexed, give a real next step (request indexing, preview a connected wallet instead, link to claim a different address) instead of a dead end.
- **Cross-feature wiring:** link the claimed card to the public `/trader/:wallet` profile and to that wallet's coins on `/launches`; if the wallet launched coins through three.ws, surface them; offer to mint a matching `*.threews.sol` identity (`/threews/claim`) so a verified trader gets a human-readable name to match their proven track record.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed.
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime. A wallet's real pump.fun trade history rendered from `/api/traders/preview` is live on-chain data, not a coin endorsement — never single out or recommend any specific non-$THREE mint in copy.
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
4. **Delete this task file** — `prompts/feature-innovation/08_03_claim-wallet.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/08-coin-launch-wallets.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
