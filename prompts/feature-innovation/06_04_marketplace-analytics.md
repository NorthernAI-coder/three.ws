# 🚀 Innovation Brief — Marketplace Analytics (creator growth engine)

> **Task file:** `prompts/feature-innovation/06_04_marketplace-analytics.md`
> **Surface:** `/marketplace/analytics`
> **Primary source:** `pages/marketplace-analytics.html`, `src/marketplace-analytics.js`, backend `/api/marketplace/analytics`
> **Atlas reference:** `docs/ux-flows/06-marketplace-skills.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is a creator trying to understand and grow their marketplace business — and a prospective buyer trying to gauge what's hot and trustworthy. Today `/marketplace/analytics` is a public, read-only aggregate dashboard: totals, a 30-day volume bar chart drawn on Canvas, and top-skills / top-agents lists. It informs; it does not *drive*. This surface should become a **creator growth engine** — the page a creator opens every morning because it tells them what's working, what's slipping, and exactly what to do next to earn more.

"Gamechanging" here means turning passive numbers into momentum: a creator sees their own performance broken out, gets concrete, ranked growth recommendations grounded in real `agent_revenue_events` and x402 settlement data, and can act on them without leaving the page. For buyers, the same data becomes a trust-and-discovery signal ("trending this week," "most-used skills") that feeds straight back into the marketplace. Invent the analytics surface that makes creators want to publish more.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Stripe's revenue dashboards, Vercel Analytics, Linear's insights, YouTube Studio's creator analytics, Plausible's clarity). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/marketplace/analytics` → `pages/marketplace-analytics.html` (standalone page). `src/marketplace-analytics.js` auto-runs `load()`.
- **Source:** `pages/marketplace-analytics.html`, `src/marketplace-analytics.js`. Backend `GET /api/marketplace/analytics` (the only call this surface makes).
- **Current flow:** 5 required steps (+0 optional). `load()` fetches `/api/marketplace/analytics` → stat cards render (total skill sales, total volume, unique buyers, creators with sales, NFT receipts minted) → a 30-day volume bar chart draws on a Canvas (no charting dependency, theme-aware colors, missing days zero-filled) → Top Skills ranked list (skill, agent, sales count, revenue) → Top Agents ranked list (agent, skill-sale count, net revenue).
- **Prerequisites / gates:** None — public aggregate stats, no auth.
- **What works today:** single-fetch load; five aggregate stat cards; dependency-free Canvas 30-day volume bar chart with dark/light theme palettes and zero-filled missing days; Top Skills and Top Agents ranked lists; has-data vs empty branches ("No sales yet." / "No agents yet."); fetch/parse failure → `#an-error` "Failed to load analytics. Please refresh." with all sections cleared.
- **Real APIs / dependencies already wired:** `GET /api/marketplace/analytics` only. Underlying data sources in the platform: `agent_revenue_events` (skill-purchase revenue) and x402 settlement records (per-call earnings from the skills marketplace).
- **Where it's mediocre, thin, or unfinished:** it's entirely global/anonymous — a creator can't see *their own* numbers, so it can't actually grow anyone's business; one chart, one metric (volume) — no breakdown by skill, by rail (unlock vs x402 per-call), by buyer cohort, no trend deltas ("+38% vs last week"); no time-range control (30 days is fixed); no actionable recommendations; the ranked lists don't link anywhere (dead-end data — clicking a top skill should go to its detail / buy path); no x402 per-call earnings dimension despite that being a core revenue rail (06_02); no export; the chart is static (no hover tooltips, no per-day values, no keyboard access); nothing here connects to the creator's own dashboard or to the buy paths it should be feeding.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **A "your business" lens.** When a creator is signed in, overlay their own performance on the global view: my revenue, my top skills, my conversion (views → unlocks), my x402 per-call earnings, and week-over-week deltas. The page stops being a leaderboard and becomes *their* dashboard. (Anonymous users still get the public aggregate.)
- **Ranked, real growth recommendations.** Mine `agent_revenue_events` + x402 settlements for concrete next actions: "Your skill X has high preview traffic but low unlocks — try a trial," "Skill Y earns most per call — feature it," "Buyers who unlock A also buy B — bundle them." Actionable, ranked, grounded in real data — not vanity metrics.
- **Make every number a doorway.** Top Skills / Top Agents rows link to their detail and buy paths (06_01/06_02); chart days expand into that day's sales; the dashboard becomes a navigation hub into the marketplace, not a dead-end report.
- **Two-rail revenue clarity.** Break revenue into unlock purchases vs x402 per-call earnings (06_02), with trend, so creators understand which monetization model is working for them. No competitor has a usage-metered-vs-unlock view because no one else runs both rails.
- **Richer, interactive charts — still dependency-free.** Add a time-range control (7/30/90/all), hover tooltips with per-day values, a secondary metric line (unique buyers / calls), and full keyboard + ARIA access to the Canvas data. Keep the zero-dependency, theme-aware approach.
- **Trending feeds discovery.** Expose a real "trending this week" signal that the main marketplace grid and the 3D hero (06_01) can consume — analytics becomes the engine behind discovery, not a sidebar.

> These are starting points, not a checklist. The best idea may not be listed — find it. Think second-order: per-call earnings here come from the skills marketplace (06_02); ranked items should link into the buy/unlock paths (06_01); a creator's "your business" view should connect to their dashboard; trending output should feed the marketplace grid and 3D hero. **Wire those connections.** The best platforms feel like everything is linked.

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
4. **Delete this task file** — `prompts/feature-innovation/06_04_marketplace-analytics.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/06-marketplace-skills.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
