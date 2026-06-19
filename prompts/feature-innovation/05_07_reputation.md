# 🚀 Innovation Brief — Reputation Explorer

> **Task file:** `prompts/feature-innovation/05_07_reputation.md`
> **Surface:** `/reputation`
> **Primary source:** `public/reputation/index.html`, `public/reputation/reputation.js`, `src/erc8004/{chain-meta,abi,reputation}.js`
> **Atlas reference:** `docs/ux-flows/05-discovery-social.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is someone deciding whether to *trust an agent* — to pay it, delegate to it, or build on it — and wants verifiable, tamper-proof evidence rather than a star count someone could fake. `/reputation` reads on-chain attestations (EAS / ERC-8004) for an address and renders a profile: aggregate score, star ratings, categorized reviews, and a wallet-signed flow to write a new review.

"Gamechanging" here means making **on-chain reputation legible and trustworthy at a glance** — turning raw attestations into a credibility story a non-crypto user instantly understands, while making the *trust math* transparent (who attested, when, with what stake, on what chain) so it can't be gamed. The bar: a profile you'd cite to justify wiring money to an autonomous agent. Verifiable trust as a first-class, beautiful surface — not a block-explorer dump.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Gitcoin Passport, Karma3/OpenRank, the legibility of a Stripe Radar score, Linear's clarity, EAS's own explorer but actually usable). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/reputation` (params `?address=`, `?chain=`, legacy `?agent=N:M`).
- **Source:** `public/reputation/index.html`, `public/reputation/reputation.js`, `src/erc8004/{chain-meta,abi,reputation}.js`; EAS (Ethereum Attestation Service) EASScan GraphQL (read), EAS SDK + ethers (write).
- **Current flow:** 4 required (+2 optional write) — land with no `?address` → search form (address/ENS input, chain select, example chips) → submit → navigate to `?address=…&chain=…` → resolve ENS if needed (public RPC) → `fetchAttestations` (EASScan GraphQL) + `getReputation` (ERC-8004 on-chain) → render profile (aggregate score bar color-coded, star ratings, tabbed review list all/by-category, copy-address + copy-share-link). Optional write: "Connect wallet to review" → `eth_requestAccounts` → star + comment → "Sign & submit review" → `wallet_switchEthereumChain`/`wallet_addEthereumChain` → encode `address agent, uint8 score, string comment` → `EAS.attest(...)` → success card with explorer + EASScan links.
- **What works today:** Wallet-free reading (EASScan GraphQL + public RPC); ENS resolution; legacy `agent=N:M` path (resolves owner, redirects); color-coded score + stars + categorized review tabs; full wallet write flow with chain switch/add; copy address + share link; designed states for unsupported network, invalid address, ENS-not-found/failed, no-attestations ("Be the first to review!"), no wallet, tx cancelled (4001), tx failure.
- **Real APIs / dependencies already wired:** EASScan GraphQL per chain (Base / Ethereum / Optimism / Arbitrum / Polygon / Base Sepolia), public RPC for ENS + ERC-8004 reads, injected wallet (`window.ethereum`), EAS SDK `attest`, ERC-8004 helpers `getReputation`/`submitReputation`.
- **Where it's mediocre, thin, or unfinished:** Reputation is shown as a flat average — no defense against gaming (one address spamming reviews, sybil ratings, wash-trust all weigh the same). No *who* behind a review (attester identity, their own reputation, whether they actually transacted with the agent). No trend over time (is trust rising or falling?). No cross-chain unification (the same agent across chains is separate profiles). No discovery — you must already know an address; there's no "top-rated agents" leaderboard. Not wired into the rest of the platform (a `/discover` or `/characters` agent doesn't show or link its reputation). The write flow is generic (score + comment) with no proof-of-interaction.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **A legible trust score, not a flat average.** Compute and *show the math*: weight reviews by attester credibility, recency, and whether the attester has on-chain history with the agent; visibly down-weight likely sybil/duplicate sources. Render a transparent breakdown ("based on 24 attestations from 19 distinct addresses, 7 with prior transactions") so the score is defensible and un-gameable-feeling.
- **Reputation over time.** A sparkline/timeline of the score and review volume so a viewer sees momentum (trust building vs eroding), not just a snapshot.
- **Attester provenance.** For each review, surface the attester's own reputation and a verified/unverified badge, with a link to *their* profile — turn reviews into a web of trust, not anonymous stars.
- **Cross-chain unified profile.** Aggregate the same agent's attestations across supported EAS chains into one profile with per-chain breakdown, so reputation isn't fragmented by deployment chain.
- **Top-rated leaderboard + discovery.** Add a discovery view of the highest-trust agents (read across attestations) so `/reputation` becomes a destination, not just a lookup tool — deep-linkable and shareable.
- **Reputation everywhere.** Wire a compact reputation badge/score into `/discover`, `/characters`, `/agents`, and agent profiles that deep-links here — so trust is visible at the moment of decision, not only when someone seeks it out.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: reputation should gate/inform payments ($THREE x402 in `/irl` and the payments SDK), surface on every agent card across the discovery cluster, and link to `/lookup`. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/05_07_reputation.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/05-discovery-social.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
