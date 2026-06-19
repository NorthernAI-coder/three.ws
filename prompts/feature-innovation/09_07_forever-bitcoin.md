# 🚀 Innovation Brief — Forever (Etch a Message into Bitcoin)

> **Task file:** `prompts/feature-innovation/09_07_forever-bitcoin.md`
> **Surface:** `/forever`
> **Primary source:** `public/forever.html` + `public/forever.js`; backend `api/forever/inscribe.js` (real OrdinalsBot Taproot text inscription on Bitcoin **mainnet**) + `api/forever/status.js` (polling)
> **Atlas reference:** `docs/ux-flows/09-x402-agent-commerce.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user wants to write something down *forever* — a vow, a memorial, a name, a manifesto — and have it etched onto a single satoshi on the Bitcoin blockchain, permanent and unerasable. `/forever` composes a message, takes native Bitcoin (or Lightning) payment to a generated charge address, and creates a real OrdinalsBot Taproot text inscription on Bitcoin **mainnet**. This is the one **non-x402** flow in the cluster — real BTC, real permanence, no take-backs.

"Gamechanging" means permanence feels *profound and safe* — the gravity of "this can never be undone" is honored by the UI, the cost and finality are crystal clear before a single sat moves, and the moment of inscription feels like a ceremony, not a checkout. Most "write to the blockchain" tools feel like crypto toys; this should feel like carving stone. Make people pause, feel the weight, and trust it completely.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Apple's considered confirmation flows, museum/memorial design, Stripe's clarity, the reverence of a signing ceremony). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/forever`.
- **Source:** `public/forever.html` + `public/forever.js`; backend `api/forever/inscribe.js` (creates a real OrdinalsBot Taproot text inscription on Bitcoin mainnet) + `api/forever/status.js` (polling). **Not** an x402/USDC flow — payment is native BTC to a generated charge address (Lightning invoice offered too).
- **Current flow:** 6 required (+6 optional) — type the message (live char + byte counters; orange warning > 1500 bytes) → (optional) enter a Taproot `bc1p…` receive address → (optional) select fee rate 3/8/20/50 sats/vB → live fee estimate (`#feeEstimate`) sats/BTC/≈USD (CoinGecko best-effort) → click **Inscribe forever** → native `confirm()` showing estimated BTC cost + address ("payment is final once broadcast. Continue?") → `POST /api/forever/inscribe` `{ message, receiveAddress, feeRate }` → OrdinalsBot order returns charge address, amount (sats), Lightning invoice, mempool URL; persisted to `sessionStorage forever:order` → **pay view** (QR BIP-21, amount, pay-to/Lightning/receive/order-id rows, "Open in wallet"/"View on mempool"/"Cancel") → user sends BTC → auto-poll `GET /api/forever/status?id=<orderId>` every 6s (`waiting-payment → payment-received → inscribing → inscribed`) → **win view** (large message, Inscription link ordinals.com, reveal-tx link mempool.space, receive address, "Bitcoin mainnet"; share to X / copy permalink / inscribe another).
- **What works today:** real OrdinalsBot mainnet Taproot inscription; live byte/char counting with the 1500-byte limit; optional Taproot receive address (else platform vault `BTC_INSCRIPTION_RECEIVE_ADDRESS`); fee-rate selection + live sats/BTC/USD estimate; final-cost `confirm()` before order; QR + Lightning + "Open in wallet"; 6s status polling through all states; `resumeIfAny()` restores pay view + polling on reload; win view with ordinals.com + mempool.space links + share; validation + order-create + `failed` error states.
- **Real APIs / dependencies already wired:** `/api/forever/inscribe` + `/api/forever/status` → OrdinalsBot (`api.ordinalsbot.com`, Bitcoin mainnet Taproot), CoinGecko (USD, best-effort), QR server, mempool.space + ordinals.com.
- **Where it's mediocre, thin, or unfinished:** the gravity of permanence is under-designed — a native `confirm()` dialog is the *opposite* of ceremony, the QR/pay view is a utilitarian invoice screen, and there's no preview of how the inscription will actually look on-chain. The CoinGecko USD is "best-effort" so price can silently vanish. Only plain text is supported (no styled message, no provenance like "inscribed by", no occasion framing). The win view is a one-off — no gallery of public inscriptions, no permalink that renders beautifully, no way to browse what others etched. No wallet deep-links beyond a generic BIP-21. No notification when inscription completes if the user navigated away.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **A ceremony, not a checkout.** Replace the native `confirm()` with a designed, deliberate finality step — a typed re-confirmation or hold-to-confirm, the message shown as it will be etched, the cost and irreversibility stated plainly and beautifully. Make the user *feel* the weight before they commit.
- **True inscription preview.** Show exactly what will land on-chain (the satoshi, the Taproot reveal, the ordinals.com rendering) before payment, so there are zero surprises about what "forever" looks like.
- **Public Forever gallery + beautiful permalinks.** A browsable, paginated gallery of completed public inscriptions (opt-in), each with a stunning shareable `/forever/i/<id>` permalink + OG image rendering the message, mempool/ordinals proof, and date — turning one-off etchings into a collective monument.
- **Occasion framing + provenance.** Optional context (memorial, vow, milestone) and an "inscribed by" handle baked into the on-chain payload, so the message carries meaning and authorship forever.
- **Resilient pricing + completion notice.** Make the USD estimate robust (cache + fallback, never blank) and offer a browser notification / copyable status link so a user who walks away learns the moment it's `inscribed`.
- **Cross-feature wiring:** let any platform artifact be immortalized here — a `/fact-checker` attestation hash, a `/tutor` proof-of-study, a `/pay/calls` receipt, or a launch record — "etch this into Bitcoin forever"; surface the user's inscriptions on their profile; share the win view to the same social surfaces other features use.

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
4. **Delete this task file** — `prompts/feature-innovation/09_07_forever-bitcoin.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/09-x402-agent-commerce.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
