# 🚀 Innovation Brief — Avatar Wallet Chat

> **Task file:** `prompts/feature-innovation/08_06_avatar-wallet-chat.md`
> **Surface:** `/avatar-wallet-chat`
> **Primary source:** `pages/avatar-wallet-chat.html` (self-contained inline module); avatar via `/avatar-embed.html` iframe (postMessage bridge); send via `/api/agent/send-sol`; governance via IBM Granite Guardian
> **Atlas reference:** `docs/ux-flows/08-coin-launch-wallets.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user wants to manage an agent's treasury by *talking to it* — "send 0.1 SOL to this address," "what's my balance," "fund me" — and watch the avatar actually do it, on-chain, with guardrails. The feature exists to make an agent's wallet **conversational and governed**: natural-language intent → a real SOL transfer via `/api/agent/send-sol`, with a server-side IBM Granite Guardian check that can block an unsafe or disallowed send before it ever signs.

"Gamechanging" here means treasury management that feels like delegating to a trusted, embodied assistant — fluid conversation, an avatar that speaks and gestures the outcome, real on-chain confirmation, and *visible governance* so the user trusts that the agent won't do something reckless. It's the human-friendly face of autonomous money: powerful, but never out of control.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (the conversational clarity of a great banking assistant, Stripe's confirmation UX, the trust of a hardware-wallet prompt, the charm of a well-animated avatar). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/avatar-wallet-chat` (avatar iframe + wallet chip showing balance/network/address + chat composer).
- **Source:** `pages/avatar-wallet-chat.html` (self-contained inline module); avatar rendered via `/avatar-embed.html` iframe with a postMessage bridge.
- **Current flow:** 6 required (+1 optional) — boot configures avatar iframe (`?id=`/`?handle=`/`?model=`, transparent, overlay), posts `v1.avatar.hello`, flushes queued speech/gestures on `v1.avatar.ready` (or 5s timeout) → `refreshWallet()` → `GET /api/agent/wallet` renders balance (SOL + USD), network badge, short address + explorer link → "Fund your wallet" hint when balance can't cover a $1 send + fee buffer → user chats; `ask()` streams a reply, avatar speaks/gestures, model may emit actions → on a `sendSol` action a payment card renders ("Signing & broadcasting…"); `POST /api/agent/send-sol {usd, to?}` → success card "Confirmed on-chain" (SOL amount, recipient, Solscan link), avatar celebrates, wallet refreshes → governance-blocked sends show a Granite Guardian chip (action already stripped server-side; client never gates).
- **What works today:** Conversational send intent; real on-chain SOL transfer; streamed assistant reply with avatar speech + gesture; live wallet chip; fund hint; server-side IBM Granite Guardian governance that strips disallowed sends before signing; optional `?token=` shared secret (`x-avatar-token` header); designed success/fail/governance-blocked states.
- **Real APIs / dependencies already wired:** `/api/agent/wallet`, `/api/agent/send-sol`, the chat/stream endpoint, `/avatar-embed.html`; Solscan (links). Real on-chain SOL transfer on success.
- **Where it's mediocre, thin, or unfinished:** There's no confirmation step before a real SOL send — intent goes straight to broadcast, which is fast but scary for a real-money action. The governance block is explained as a chip *after* the fact, not as a reassuring, understandable guardrail the user can see working. There's no transaction history in the conversation — past sends vanish. The wallet chip is informational but not interactive (no copy, no deposit flow inline). "Fund" is a hint, not a flow. The chat doesn't surface what the agent *can* do (send, check balance, fund) — discoverability is low.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **A confirmation that respects real money.** Before a send broadcasts, render an inline confirm card (amount in SOL + USD, resolved recipient, fee, remaining balance) the user approves in-conversation — fast for small amounts, deliberate for large. Trust without friction theater.
- **Make governance a feature, not a footnote.** Show the IBM Granite Guardian check working in real time — "checked for safety," with a clear, honest explanation when a send is blocked and what the user can do. Visible guardrails build trust in autonomy.
- **Conversational treasury history.** Persist sends in the thread so the conversation becomes a real ledger — past transfers with Solscan links, running balance, recurring recipients the user can reuse by name.
- **An interactive wallet chip.** Copy address, inline deposit (QR + address, the `/launch` pattern), network awareness, and a live low-balance state that offers funding right there — turn the static chip into a control surface.
- **Cross-feature wiring:** share the agent's wallet identity with `/play/agent-wallet` (x402 spend) and the launch flow's agent wallet so balance/history are one consistent treasury across the platform; let the user pick which of their agents (`/api/agents`) holds the conversation; and let "fund" reuse the deposit modal pattern from `/launch`.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: how does improving this unlock value in adjacent three.ws features? **Wire those connections.** The best platforms feel like everything is linked.

## 5. Hard rules (non-negotiable — from `CLAUDE.md`)

- **Real APIs, real data, real integrations. No mocks, no fake/sample arrays, no placeholders, no `setTimeout` fake-loading or fake progress.** If credentials are missing, find them in `.env` / `.env.example` / `vercel env` — then proceed. (Sends must stay real on-chain transfers — never simulate a confirmation.)
- **Wire 100%.** Every button works, every link goes somewhere, every reachable state exists. Design *every* state: loading (skeletons over spinners), empty (tell the user what to do next), error (actionable recovery), populated, and overflow (0 / 1 / 1000 items, very long strings, mid-operation network failure, expired session).
- **No TODO comments, no stubs, no `throw new Error("not implemented")`, no commented-out code.** If you write it, finish it.
- **No errors without solutions.** Every error has a root cause; every root cause has a fix. Ship failsafes, not lazy propagation. (Wallet offline, low balance, send failure, governance block must each have an honest, designed state.)
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never name, add, hardcode, link, render, or recommend any other coin anywhere — code, copy, tests, fixtures, commits. The only exceptions are coin-agnostic runtime plumbing (user supplies a mint) and platform launch records rendered at runtime.
- **Read before you write.** Match the existing patterns, naming, file organization, and the design tokens in `DESIGN-TOKENS.md`. Consistency compounds.
- **Accessibility + responsive (320 / 768 / 1440) + microinteractions** are part of done, not polish. Semantic HTML, ARIA, keyboard nav, focus rings, sufficient contrast. (Chat must be fully keyboard-operable; the avatar iframe must have an accessible, reduced-motion-aware fallback.)
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
4. **Delete this task file** — `prompts/feature-innovation/08_06_avatar-wallet-chat.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/08-coin-launch-wallets.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
