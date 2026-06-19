# 🚀 Innovation Brief — Skills Marketplace (free install + x402 per-call)

> **Task file:** `prompts/feature-innovation/06_02_skills-marketplace.md`
> **Surface:** `/skills` → client-redirects to `/marketplace?tab=skills`; `/marketplace/skills/:id`
> **Primary source:** `pages/skills.html` (redirect shell), `src/marketplace.js` skills tab (`skillsState` ~L2128, `loadSkillsTab()`, `renderSkillsGrid()`/`renderSkillCard()` ~L2229, skill detail ~L2348, `toggleSkillInstall()` ~L2582), runtime gate `src/skills/index.js`, backend `/api/skills`, `/api/skills/categories`, `/api/skills/:id`, `/api/skills/:id/install`, `/api/skills/:id/rate`, `/api/x402/skill-call`
> **Atlas reference:** `docs/ux-flows/06-marketplace-skills.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a builder giving their agent new capabilities — and the developer on the other side authoring those capabilities and getting paid for them. This surface is fundamentally different from the agent-skill *unlock* purchase (06_01): here **installing a community tool pack is FREE, and payment happens per-call via x402** (`/api/x402/skill-call`), settling micro-payments straight to the author's wallet. It's an App Store where the apps are agent tools, the pricing is usage-metered, and the rails are crypto-native.

"Gamechanging" here means reinventing how an autonomous agent *acquires and pays for capability on its own*. The web has no precedent for an agent that browses a catalog, installs a tool for free, and then pays the author a fraction of a cent each time it actually uses that tool — autonomously, with a real on-chain settlement. Make that loop feel inevitable: trivial to install, transparent to meter, irresistible to publish into. The buyer should see exactly what each call will cost and what they got; the author should watch usage and revenue accrue call by call.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (the iOS/VS Code extension marketplaces for discovery and trust, Stripe's usage-based billing clarity, Replit/Vercel for developer onboarding, OpenRouter/Helicone for per-call cost transparency). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/skills` → `pages/skills.html` client-redirects (preserving `?q=`, `?category=`) to `/marketplace?tab=skills`; the SPA renders the skills grid. Skill detail at `/marketplace/skills/:id`.
- **Source:** `src/marketplace.js` skills tab — `skillsState` ~L2128, `loadSkillsTab()`, `renderSkillsGrid()` / `renderSkillCard()` ~L2229, skill detail ~L2348, `toggleSkillInstall()` ~L2582. Runtime gate `src/skills/index.js`. Backend `/api/skills`, `/api/skills/categories`, `/api/skills/:id`, `/api/skills/:id/install` (POST/DELETE), `/api/skills/:id/rate`, per-call `/api/x402/skill-call`.
- **Current flow:** ~3 required steps (+5 optional). Load skills tab → `GET /api/skills?limit=24&q=&category=&sort=&cursor=` + `/api/skills/categories` → skeletons then cards (name, price-per-call or "free", description, category pill, x402 badge for paid, install/tool counts, rating, "Installed ✓") → click card → `GET /api/skills/:id` detail (header, meta pills, description, tool schemas, full content, related skills) → "Install" → `POST /api/skills/:id/install` (DELETE to remove), 401 → `/login?next=…`, success flips button to "Installed ✓ — Remove".
- **What works today:** free install/uninstall toggle; category chips; debounced search; client-side Free/Paid filter (`isPaidSkill`); cursor pagination; 1–5 star rating (`POST /api/skills/:id/rate`); detail panel with tool schemas + full content + related skills; x402 panel on paid skills (endpoint `GET /api/x402/skill-call?skill=:slug`, price `$X.XXX/call`, copy-paste `@three-ws/x402-fetch` snippet); author modal via `/api/creators/:id`. Marketplace skills (community tool packs with schema/content) are distinct from built-in agent skills in `src/agent-skills*.js`.
- **Real APIs / dependencies already wired:** `/api/skills`, `/api/skills/categories`, `/api/skills/:id`, `/api/skills/:id/install`, `/api/skills/:id/rate`, `/api/x402/skill-call`, `/api/creators/:id`, `/api/auth/me` (gate install/rate).
- **Where it's mediocre, thin, or unfinished:** the x402 panel hands the developer a snippet and walks away — there's no "run it right here" tester, no live cost meter, no proof the call works before they wire it; install is a flat toggle with no sense of *which agent* gets the skill or what it now can do; there's no usage/spend visibility for the buyer (how much have I paid this skill this week?) and no earnings visibility for the author from this surface; discovery is a flat grid — no trending, no "works well with," no bundles, no collections; ratings exist but there are no reviews, no verified-usage signal, no leaderboards; nothing closes the loop from "installed" to "my agent actually used it and here's what happened."

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **An in-browser x402 call console.** On every paid skill detail, ship a real "Run this call" panel: the user signs a single x402 micro-payment from their connected wallet through `/api/x402/skill-call`, sees the live response, and watches the exact cost settle to the author — the developer-onboarding moment that turns "interesting" into "wired into my agent in 60 seconds." No code-paste required to prove it works.
- **A per-call spend & usage meter for both sides.** Give the buyer a running "this skill cost you $X across N calls this week" view, and the author a live earnings-by-call stream — reading real x402 settlements. Wire the author view into marketplace analytics (06_04) so publishing a skill has an obvious growth dashboard.
- **Install means "equip" — pick the agent.** Make install explicit about *which* of the user's agents gains the capability, show the agent's tool roster updating, and surface "your agent can now: …" in plain language. Second-order: this links the skills marketplace to the user's agents and to `/collection` (06_03).
- **Skill collections & "works well with."** Curated and algorithmic bundles ("the research stack," "the trading stack") and per-skill compatibility suggestions driven by real co-install data — turn a flat grid into a graph of capability.
- **Reviews with proof-of-use.** Let only wallets that have actually paid for ≥1 call leave a review; badge those reviews "verified usage." Crypto-native, un-gameable social proof no app store has.
- **One-click publish path.** A real "Publish a skill" flow (name, schema, content, price-per-call, payout wallet) so the catalog grows from this surface — the supply side of the marketplace, not just the demand side.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: an installed skill should show up on the user's agents and in `/collection` (06_03); per-call earnings should feed the creator growth engine in `/marketplace/analytics` (06_04); the x402 meter should connect to the user's wallet/billing. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/06_02_skills-marketplace.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/06-marketplace-skills.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
