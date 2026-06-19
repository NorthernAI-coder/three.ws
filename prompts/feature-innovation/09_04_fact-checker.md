# 🚀 Innovation Brief — Fact Checker (Attested AI Verification)

> **Task file:** `prompts/feature-innovation/09_04_fact-checker.md`
> **Surface:** `/fact-checker`
> **Primary source:** `pages/fact-checker.html` + `src/fact-checker-app.js`; backend `api/x402/fact-check.js` ($0.10, 7-day Redis cache); `public/x402.js`
> **Atlas reference:** `docs/ux-flows/09-x402-agent-commerce.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user has a claim — a headline, a stat, a viral tweet — and wants a fast, paid, *verifiable* verdict: is this true, with sources, and proof that the answer wasn't tampered with. `/fact-checker` charges $0.10 per check via x402 and returns a verdict (SUPPORTED / CONTRADICTED / MIXED / INSUFFICIENT) with a confidence score, a graded source grid, a cost breakdown, and a SHA-256 attestation — cached 7 days so identical claims return instantly.

"Gamechanging" means the result is not just an opinion but an *artifact you can prove and cite*: a tamper-evident, reproducible verdict with transparent sourcing that anyone can re-verify. In a world drowning in AI slop, a pay-per-check, cryptographically attested fact-check is genuinely novel — make the attestation the hero, not a footnote, and make the verdict feel like evidence, not a guess.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Community Notes, PolitiFact, Perplexity citations, Google Fact Check Explorer, Coinbase onchain receipts). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/fact-checker`.
- **Source:** `pages/fact-checker.html` + `src/fact-checker-app.js`; backend `api/x402/fact-check.js` ($0.10, 7-day Redis cache); shared `public/x402.js`.
- **Current flow:** 4 required (+3 optional) — enter a claim (or example chip; live char counter, ≤1000 chars) → (optional) pick strictness Low/Medium(default)/High → click **Check This Fact** (validate → skeleton + "Searching sources…") → `POST /api/x402/fact-check` `{ claim, strictness }` → on `402` payment panel (Base USDC $0.10 / Solana USDC $0.10 + "Connect wallet to pay →" to `/marketplace`); on `200` verdict banner + sources grid (stance/authority) + cost breakdown + expandable SHA-256 attestation.
- **What works today:** full pipeline (3 search queries → multi-source retrieval → LLM stance → weighted verdict → attestation; optional vision for image evidence, fail-open); 7-day Redis cache returns identical claims instantly at `200`; verdict banner with confidence; graded source grid; cost breakdown; expandable attestation; `429`/`5xx`/retry handling; example chips as empty state.
- **Real APIs / dependencies already wired:** `/api/x402/fact-check` (search → retrieval → LLM stance → weighted verdict → attestation, optional vision), Base/Solana USDC settlement, Redis cache (7-day TTL).
- **Where it's mediocre, thin, or unfinished:** the attestation is *shown* but not independently *verifiable* by the user — there's no public verify endpoint, no permalink to re-open a past verdict, no way to prove "this exact verdict existed at this time". Sources are listed but the *reasoning* from source→stance→verdict isn't traceable. There's no history of your checks, no shareable verdict card/OG image, no embeddable badge a publisher could drop next to a claim. Image/URL claims aren't first-class (paste a tweet URL and it should fetch + check). Strictness changes the verdict silently with no explanation of what it changed.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Public verify endpoint + permalink.** Every verdict gets a shareable `/fact-checker/v/<hash>` permalink with an OG image, and a "Verify this attestation" tool that recomputes the SHA-256 over the canonical payload and shows ✓/✗ — making the proof real, not decorative.
- **Reasoning trace.** Show the chain from each source's stance and authority weight to the final confidence math, so a skeptic can see *why* it's SUPPORTED at 82%, not just that it is. Let users challenge a source and re-weight.
- **Embeddable verdict badge.** A tiny `<script>`/iframe badge publishers can place beside a claim that shows the live verdict + confidence and links to the attested permalink — distribution that spreads the proof.
- **URL & image claims first-class.** Paste a tweet/article URL or drop an image; the checker extracts the claim, runs vision evidence, and attributes the source — turning "fact-check this thing I saw" into one paste.
- **Strictness diff.** When strictness changes the verdict, show the delta ("at High, 2 weak sources dropped → INSUFFICIENT") so the knob teaches instead of confusing.
- **Cross-feature wiring:** offer fact-checking as a callable capability in `/bazaar` and a step `/shopper` can buy; let `/play/arena` and `/agent-economy` agents cite an attested check; surface a "checks you've run" history reusing the receipt/permalink pattern from `/pay/calls`; feed high-confidence contradictions into the alert engine.

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
4. **Delete this task file** — `prompts/feature-innovation/09_04_fact-checker.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/09-x402-agent-commerce.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
