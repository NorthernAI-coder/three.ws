# 🚀 Innovation Brief — Characters Directory

> **Task file:** `prompts/feature-innovation/05_04_characters.md`
> **Surface:** `/characters` (+ `/character/:id` detail/chat)
> **Primary source:** `public/characters.html`, `src/characters.js`, `/api/characters`, `src/shared/agent-wallet-chip.js`
> **Atlas reference:** `docs/ux-flows/05-discovery-social.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is someone who wants to *meet an AI character* — to chat with it, watch its token, or be inspired to create their own. `/characters` is the directory of AI characters on three.ws: each has a creator, a personality, chat/holder stats, and (when launched) a $-token block and Solana wallet. They are deciding which character is worth talking to or backing.

"Gamechanging" here means turning a card grid into a **casting room where characters feel alive**: previewable personality (a taste of how it talks before you commit to chat), real-time signals of which characters are *being talked to and traded right now*, and a frictionless leap from "interesting" to "in conversation." Make discovering an AI character feel like discovering a creator you'll follow — something no static NFT or token list delivers.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Character.AI's discovery, Poe's bot directory, the best creator-economy profiles, Linear's polish, pump.fun's live momentum). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/characters`; card click → `/character/:id` (detail / chat).
- **Source:** `public/characters.html` (root-level dest in `vercel.json`), `src/characters.js`; API `GET /api/characters`; `walletChipHTML` from `src/shared/agent-wallet-chip.js`.
- **Current flow:** 1 required (+3 optional) steps — `init()` on import → `fetchCharacters(true)` renders 6 skeleton cards + fetches `GET /api/characters?limit=24&sort=new` → renders character cards (avatar image or color-hash placeholder, creator handle, description, chat-count / holders stats, optional `$`token block with symbol / market cap / 24h change, wallet chip if a Solana address exists). Optional: search (300ms debounce → reload with `q`), sort buttons (`data-sort`), "Load more" cursor pagination. Payoff: card click → `/character/:id`.
- **What works today:** Skeletons; color-hash placeholder for missing avatars; token block + 24h change; Solana wallet chip; image-URL validation (http(s) vs placeholder); reset-vs-append render; designed empty ("No characters found.") and error ("Failed to load characters. Please try again.") states.
- **Real APIs / dependencies already wired:** `GET /api/characters`, `walletChipHTML`.
- **Where it's mediocre, thin, or unfinished:** Characters are flat 2D images — on a Three.js platform, no 3D avatar preview. No *taste of personality* before clicking through (you can't tell how it talks). Token block is static at render — no live price/holder movement despite being on-chain. No sense of activity ("who's being chatted with right now"). Sort is unlabeled `data-sort` buttons with no clear taxonomy (new / popular / trending / has-token). No filter by has-token vs not, or by creator. The wallet chip is informational only — no quick-action ($THREE tip / view holdings).

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **Personality preview on the card.** A tap/hover that streams a one-line in-character "hello" or a rotating sample line from the character's real persona/config, so users feel its voice before committing — turn a card into an audition.
- **3D avatar where available.** This is a Three.js platform; render the character's 3D model (lazy `<model-viewer>`) when it has one, falling back to image → color-hash. Make the directory feel native to the medium.
- **Live momentum.** Real-time-ish refresh of chat counts, holders, and 24h token movement (poll/SSE) with subtle motion, plus a "trending now" lane — surface which characters the community is actively engaging.
- **Quick chat from the grid.** A "Say hi" affordance that opens a lightweight chat sheet inline (or deep-links into `/character/:id` with an opening prompt prefilled) so the gap between discovery and conversation is one tap.
- **Real filter/sort taxonomy.** Labeled, accessible controls: New / Trending / Most chatted / Has $token, plus filter by creator — deep-linkable.
- **$THREE-aware wallet actions.** From a character's wallet chip, enable a quick $THREE tip / view-on-explorer action (coin-agnostic plumbing; $THREE is the platform coin), wiring discovery into the payment rails.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: characters connect to `/discover`, agent profiles, the payments SDK, and `/walk`/`/irl` (a character could be embodied and driven); a creator filter links to creator pages. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/05_04_characters.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/05-discovery-social.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
