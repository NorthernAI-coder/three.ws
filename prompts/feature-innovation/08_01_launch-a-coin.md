# 🚀 Innovation Brief — Launch a Coin-Backed Agent

> **Task file:** `prompts/feature-innovation/08_01_launch-a-coin.md`
> **Surface:** `/launch`
> **Primary source:** `pages/launch.html` → `public/launch/launch.js` (`mountLaunchCoin`) → `public/studio/launch-panel.js` (`mountLaunchPanel`) → `public/studio/fees-panel.js`; vanity stamp `src/solana/vanity/grinder.js` + `src/solana/vanity/brand.js` (`THREE_WS_VANITY`)
> **Atlas reference:** `docs/ux-flows/08-coin-launch-wallets.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a creator who wants to launch a coin-backed agent on Solana — a person who picks an agent, names a token, and walks away with a tradable mint that lives on pump.fun and inside three.ws. They are nervous: this spends real SOL, signs a real transaction, and is irreversible. The feature exists to make that leap feel **safe, fast, and unmistakably theirs** — the smoothest, most trustworthy coin-launch flow that exists anywhere, with a `3ws`-stamped mint address as a built-in proof of origin.

"Gamechanging" here means: a launch that a first-timer completes without fear and a pro completes in seconds. The vanity stamp, the dual signing models (connected client-signs vs. agent server-signs), the SIWS link ceremony, and the 75s confirm window are not friction to hide — they are trust signals to *celebrate*. Make the user feel they did something irreversible and got it exactly right.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (pump.fun's launch, Stripe Checkout's confidence, Linear's command surface, Phantom's signing clarity). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/launch` (`pages/launch.html`, `#launch-root` two-column shell: agent picker left + launch panel right).
- **Source:** `public/launch/launch.js` (`mountLaunchCoin`), `public/studio/launch-panel.js` (`mountLaunchPanel` — the real flow, shared with `/studio` and the avatar page), `public/studio/fees-panel.js` (post-launch). Vanity grind: `src/solana/vanity/grinder.js`, brand mark `src/solana/vanity/brand.js` (`THREE_WS_VANITY`).
- **Current flow:** 15 required steps (+5 optional) — boot (`fetchMe` → `fetchAvatars`) → pick agent (deep-link `?avatar=`) → auto-check existing mint (`/api/pump/by-agent`) → edit image/name/symbol/description → pick coin type (Regular/Mayhem/Agent/USDC/Reward) → optional buyback slider + initial buy → choose wallet source → launch → build metadata → stamp `3ws` mint → sign → confirm (75s poll) → success card.
- **What works today:** Dual signing models (connected wallet client-grinds + client-signs vs. custodial agent wallet server-grinds + server-signs); SIWS link ceremony with 409 takeover; live cost line; per-phase status; confirmation-timeout escape hatch; `friendlyError()` mapping; vanity `3ws` stamp with live k/s + ETA; success card with pump.fun/Solscan/agent links + share copy.
- **Real APIs / dependencies already wired:** `/api/auth/me`, `/api/avatars`, `/api/pump/by-agent`, `/api/auth/wallets`, `/api/auth/wallets/nonce-solana`, `/api/auth/wallets/link-solana`, `/api/pump/agent-wallet`, `/api/pump/build-metadata`, `/api/pump/launch-prep`, `/api/pump/launch-confirm`, `/api/pump/launch-agent`, `/api/solana-rpc` (Connection RPC). External: `esm.sh/@solana/web3.js@1.98.4`, `esm.sh/qrcode@1.5.3`, pump.fun (mint target), Solscan.
- **Where it's mediocre, thin, or unfinished:** The flow is correct but transactional — it reads like a form, not a launch event. The `3ws` stamp grind shows numbers but no *anticipation*. There is no pre-flight "this is exactly what will happen and cost" confirmation surface that consolidates coin type + buyback + buy-in + fee model into one reviewable summary. The success moment is a card, not a moment. Coin-type selection asks users to understand Regular/Mayhem/Agent/USDC/Reward with little guided help. No post-launch "what now" path beyond external links. The confirm window is a passive wait, not a designed experience.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **The pre-flight confirmation.** Before the irreversible click, render a single Stripe-grade review surface: token identity, coin-type plain-English explanation, exact SOL/USDC cost broken into base + buy-in + network, the wallet that will sign, and the `3ws` mark preview. One glance, total confidence, then commit.
- **Make the `3ws` grind a launch sequence, not a progress bar.** Turn the vanity stamp into a designed anticipation moment — the address materializing character by character with the `3ws` prefix locking in last, k/s and ETA as ambient telemetry. The wait *becomes* the wow.
- **Coin-type as a guided decision, not a dropdown.** Each type (Regular / Mayhem / Agent buyback+burn / USDC / Reward) gets a one-line "who this is for" and a live preview of its fee/buyback mechanics. Recommend a default based on the selected agent.
- **Designed confirmation window.** Replace the passive 75s poll with a live tx-status timeline (submitted → propagating → confirmed) sourced from real `/api/solana-rpc` status checks, with the escape hatch always one tap away.
- **Cross-feature wiring:** on success, deep-link straight into `/coin3d?mint=` (the new mint as a living 3D object), prepend it to the user's view of `/launches`, and offer a one-tap path to mint the matching `*.threews.sol` name (`/threews/claim`) so the coin, its 3D form, and its human-readable identity ship together. Surface the new mint in the agent's profile launch history immediately.

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
4. **Delete this task file** — `prompts/feature-innovation/08_01_launch-a-coin.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/08-coin-launch-wallets.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
