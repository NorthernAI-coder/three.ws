# 🚀 Innovation Brief — Pay-As-You-Learn Tutor

> **Task file:** `prompts/feature-innovation/09_05_tutor.md`
> **Surface:** `/tutor`
> **Primary source:** `public/tutor.html` + `public/tutor.js`; backend `api/x402/tutor.js` ($0.01/question) + `api/tutor/session.js` (free resume); `public/x402.js`
> **Atlas reference:** `docs/ux-flows/09-x402-agent-commerce.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user wants to learn something — a concept, a piece of code, a topic — and pay only for the answers they actually use, one cent at a time, with proof of what they paid for. `/tutor` is a chat tutor that charges $0.01 per answer, accrues a session total, and ends with an itemized, SHA-256-attested invoice. It makes "pay-as-you-learn" a real, frictionless transaction instead of a $20/month subscription you forget to cancel.

"Gamechanging" means the tutor *proves its value as you go*: every answer is worth a penny because it's measurably good, the running tab is always visible and fair, and the final attested invoice is something you could file as an expense or share as proof of study. The combination of micro-priced learning + verifiable per-question billing doesn't exist elsewhere — make the penny feel like a bargain and the invoice feel like a receipt from the future.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Khan Academy, Duolingo, ChatGPT study mode, Stripe invoices, Notion's clean reading UX). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/tutor`.
- **Source:** `public/tutor.html` + `public/tutor.js`; backend `api/x402/tutor.js` ($0.01/question, server-side session accrual + attestation) + `api/tutor/session.js` (free resume); shared `public/x402.js`.
- **Current flow:** 4 required (+4 optional) — (optional) click a suggestion chip or type a question (`#q`, live char counter, 5–2000 chars) → (optional) pick level Beginner/Intermediate(default)/Expert → send (or Cmd+Enter; spinner; question added to thread) → `window.X402.pay({ endpoint:'/api/x402/tutor', body:{ sessionId, question, level }, merchant:'three.ws Tutor', action:'Explain' })` (first time → paywall connect + sign + settle) → on success tutor bubble with answer + key points + example + follow-up + meta row (cost · level · model); session tab updates total + count → (optional) click a follow-up (cost stacks); (optional) **End & invoice** → modal with per-question line items + running total + SHA-256 session attestation.
- **What works today:** real per-question x402 charge with server-side session accrual; session id auto-minted to `localStorage three-tutor-session-id`; lazy wallet connect on first paid question; structured answers (key points + example + follow-up); level selector; reload resumes session via free `GET /api/tutor/session`; itemized attested invoice; suggestion chips as empty state; payment cancel/fail/retry handling.
- **Real APIs / dependencies already wired:** `/api/x402/tutor` (per-question charge + accrual + attestation), `/api/tutor/session` (resume), `/x402.js`, Base/Solana settlement.
- **Where it's mediocre, thin, or unfinished:** it's a flat Q&A list — no notion of a *learning path*, topic, or progress, so the value compounds poorly. The attested invoice is the climax but there's no permalink/verify, no export (PDF/CSV), no proof-of-study artifact to share. Answers don't render rich content well (no code highlighting/diagrams/3D for spatial topics despite the platform being 3D-native). No spaced-repetition or "quiz me on what I paid to learn" loop, so knowledge leaks. No way to pre-fund a session balance (every question re-hits the modal flow unless the modal caches). No history across sessions.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Learning paths with a live value meter.** Let the user pick or auto-generate a path (e.g. "Solana programs in 10 questions"); show progress, mastery, and a "value delivered" meter so the penny-per-answer feels like compounding investment, not a meter running.
- **Attested, shareable proof-of-study.** Give every invoice a verifiable permalink + exportable PDF/CSV with the SHA-256 attestation, and a public "Verify invoice" check that recomputes the hash — a credential you could attach to a bounty or expense report.
- **Quiz-me retention loop.** After N paid answers, offer a free spaced-repetition quiz drawn from your own session; getting it right marks mastery, getting it wrong suggests the next paid question — turning the tutor into a teacher.
- **Rich, 3D-native answers.** Render code with syntax highlighting and, for spatial/geometry/3D topics, an inline `<model-viewer>` or canvas diagram — lean into three.ws being a 3D platform.
- **Prepaid session balance.** Let a user fund a small balance once (one x402 settle) and spend it across many questions, with the live balance shown — fewer modal interruptions, same on-chain truth.
- **Cross-feature wiring:** offer the tutor as a `/bazaar` capability and a step `/shopper` can buy; let answers cite an attested `/fact-checker` verdict; surface a learning-path badge on the user's profile; reuse the invoice permalink pattern from `/pay/calls`; let `/play/arena` spectators ask the tutor to explain a strategy they just watched.

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
4. **Delete this task file** — `prompts/feature-innovation/09_05_tutor.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/09-x402-agent-commerce.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
