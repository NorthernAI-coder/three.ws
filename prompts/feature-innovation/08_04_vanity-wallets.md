# 🚀 Innovation Brief — In-Browser Vanity Wallets

> **Task file:** `prompts/feature-innovation/08_04_vanity-wallets.md`
> **Surface:** `/vanity-wallet` (Solana ed25519), `/eth-vanity` (EVM CREATE2 salt), `/evm-wallet` (EVM EOA secp256k1)
> **Primary source:** `public/vanity-wallet.html` + `src/solana/vanity/grinder.js` (`grindVanity`) + `src/solana/vanity/validation.js`; `public/eth-vanity.html` + `src/eth/vanity/grinder.js` (`grindCreate2Vanity`) + `src/eth/vanity/{validation,wordlist}.js`; `public/evm-wallet.html` + `src/eth/vanity/eoa-grinder.js` (`grindEoaVanity`); card variants `src/agent-eth-vanity-card.js`, `src/agent-vanity-grinder.js`
> **Atlas reference:** `docs/ux-flows/08-coin-launch-wallets.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user wants a memorable, branded crypto address — a wallet that starts with their name, ends with a word, or matches their agent — generated **entirely in their browser** so the private key never touches a server. Today this lives across three separate tools (Solana EOA, EVM CREATE2 contract salt, EVM EOA). The feature exists to give users custom on-chain identity safely, and to let them securely assign that identity to a three.ws agent.

"Gamechanging" here means unifying these into **the best in-browser vanity-address experience anywhere** — one coherent, trustworthy tool that handles Solana and EVM, EOA and contract, with grind performance, security clarity ("your key never leaves this device"), and a frictionless, safe path to assign the result to an agent. The cryptographic correctness already exists; the experience must become the reason people choose three.ws for this.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (vanity-eth/profanity-era tools but *safe*, Phantom's key-handling clarity, Linear's input ergonomics, the satisfaction of a fast progress meter). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/vanity-wallet` (Solana ed25519 EOA), `/eth-vanity` (EVM CREATE2 deterministic salt → contract address), `/evm-wallet` (EVM EOA secp256k1, pure self-custody).
- **Source:** `/vanity-wallet` → `public/vanity-wallet.html` inline module + `src/solana/vanity/grinder.js` (`grindVanity`) + `src/solana/vanity/validation.js`. `/eth-vanity` → `public/eth-vanity.html` + `src/eth/vanity/grinder.js` (`grindCreate2Vanity`) + `validation.js` + `wordlist.js`. `/evm-wallet` → `public/evm-wallet.html` + `src/eth/vanity/eoa-grinder.js` (`grindEoaVanity`). Embedded card variants: `src/agent-eth-vanity-card.js`, `src/agent-vanity-grinder.js`.
- **Current flow:** Solana — 3 required (+4 optional): prefix/suffix ≤6 + case-insensitive toggle + CPU-core slider → `grindVanity` Web Worker pool with live attempts/sec + ETA + scan line → result card (download Solana CLI JSON keypair, copy pubkey) → optional assign to agent (`GET /api/agents`; `POST/DELETE /api/agents/:id/solana` with `secret_key` + vanity prefix/suffix; 409 replace). CREATE2 — 4 (+2): hex prefix/suffix (EIP-55) + deployer/factory + init-code-hash (or raw init code → auto-keccak) → `grindCreate2Vanity` salt grind → result (predicted address + salt) → optional assign (`POST/DELETE /api/agents/:id/eth-vanity`; deterministic input set, no private key). EOA — 4 (+1): prefix/suffix → `grindEoaVanity` secp256k1+keccak pool → result (checksummed address + private key text + encrypted UTC keystore download); **no** server handoff, pure self-custody.
- **What works today:** Real client-side WASM/worker grinding (keys never leave device); difficulty meter + per-core ETA; pause/resume/stop via AbortController; downloadable keypair/keystore; secure agent-assign with replace + 409 handling for Solana and CREATE2; EOA stays fully self-custody.
- **Real APIs / dependencies already wired:** Grinding is fully client-side. Assign paths: `/api/agents`, `/api/agents/:id/solana` (POST + DELETE), `/api/agents/:id/eth-vanity` (POST + DELETE). Hashing via `@noble/hashes/sha3`; keystore via ethers `Wallet`.
- **Where it's mediocre, thin, or unfinished:** Three separate pages with separate UX, separate styling, and overlapping concepts — a user doesn't know which tool they need. The security story (key never leaves the browser) is stated, not *felt*. Performance telemetry is functional but not reassuring or impressive. Assign-to-agent is bolted on differently per tool. There's no unified entry that routes a user to the right grind (Solana vs EVM, EOA vs contract). No shared design language, no shared pattern library, and the embedded card variants drift from the standalone tools.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Unify into one vanity studio.** A single coherent surface that asks "what do you want — a Solana wallet, an EVM wallet, or an EVM contract address?" and routes to the right grinder, sharing one design language, one telemetry panel, one assign flow. Three tools become one product.
- **Make safety visible.** Turn "your key never leaves this device" into a designed, trustworthy element — an explicit local-only indicator, a download-and-back-up gate before the result can be dismissed, and a clear contrast between self-custody (EOA) and encrypted-server-custody (agent assign).
- **Grind as spectacle.** Elevate the attempts/sec + ETA + scan line into a satisfying, performant telemetry view that makes a long grind feel alive and worth waiting for — and honestly communicates difficulty so users pick achievable patterns.
- **Smart pattern guidance.** A shared difficulty/feasibility model + suggestion chips (wordlist-driven for EVM) so users choose patterns that will actually finish on their hardware, with case-insensitive nudges.
- **Cross-feature wiring:** make agent-assign first-class — pick an agent (`/api/agents`), grind a matching vanity address, assign it securely, and bounce straight to that agent's home page. Tie a Solana vanity wallet into the launch flow (`/launch`) so a freshly minted branded wallet can be the agent's launch wallet, and connect a `*.threews.sol` name (`/threews/claim`) so address + human-readable identity ship together.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed.
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime.
- **Read before you write.** Match the existing patterns, naming, file organization, and the design tokens in `DESIGN-TOKENS.md`. Consistency compounds.
- **Accessibility + responsive (320 / 768 / 1440) + microinteractions** are part of done, not polish. Semantic HTML, ARIA, keyboard nav, focus rings, sufficient contrast.
- **Performance by default:** lazy-load heavy modules, debounce input handlers, paginate large lists, animate with `transform`/`opacity`. Ship no jank. (Grinder worker pools must stay responsive and cancellable — never block the main thread.)
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
4. **Delete this task file** — `prompts/feature-innovation/08_04_vanity-wallets.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/08-coin-launch-wallets.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
