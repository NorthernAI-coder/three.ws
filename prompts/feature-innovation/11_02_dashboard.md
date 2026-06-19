# 🚀 Innovation Brief — Dashboard (command center)

> **Task file:** `prompts/feature-innovation/11_02_dashboard.md`
> **Surface:** `/dashboard`, `/dashboard/account`, `/dashboard/analytics`
> **Primary source:** `pages/dashboard-next/index.html`, `pages/dashboard-next/account.html`, `pages/dashboard-next/analytics.html`, `src/dashboard-next/pages/home.js`, `src/dashboard-next/pages/account.js`, `src/dashboard-next/pages/analytics.js`, `src/dashboard-next/shell.js`, `src/dashboard-next/api.js`
> **Atlas reference:** `docs/ux-flows/11-account-dashboard.md` (current UX, traced step-by-step)

---

## 0. How to use this brief

You are **one agent in a fleet**. This one feature is yours to make world-class. Read this entire brief, then read the referenced source so you are changing reality and not a guess. Execute completely. When you are genuinely done (§6–7), **delete this task file**.

You are not a task-completing machine. You are a senior engineer and product thinker who happens to write code. Act like it.

## 1. Mission

The end user is an **agent owner** — someone who has created AI agents/avatars on three.ws and is trying to run them like a business: earn revenue, watch usage, spot what's working, and act fast when something changes. The dashboard (`dashboard-next`) is where they live. `/dashboard` is the overview (KPIs, hero avatars, trading + world-health, quick actions, directory, activity feed), `/dashboard/account` is identity/wallets/keys/delegation/audit, and `/dashboard/analytics` is the revenue and performance deep-dive (revenue-over-time chart, revenue-by-skill bars, agent-performance table, recent payments).

This feature exists to be the **daily command center an agent owner can't live without** — the tab they leave open. "Gamechanging" means the dashboard doesn't just *display* state, it *drives action*: it surfaces what changed since last visit, what's earning, what's broken, and what to do next — and it lets them act without leaving. Today it polls KPIs and activity every 30s and renders solid panels; the leap is turning a reporting surface into a living operations console that feels like Linear's home, Stripe's dashboard, and Vercel's project view had a child.

## 2. The bar

Build the version that makes someone screenshot it and share it. Benchmark against the best in the world (Stripe Dashboard, Vercel project overview, Linear home, Mixpanel/Amplitude analytics, Phantom portfolio). **If your result merely matches what already exists, you have failed this brief.** Invent something true and new that creates real, obvious value for the user. The bar: an agent owner glances at the dashboard for five seconds and knows exactly what made or lost them money since yesterday — and the one thing worth doing right now.

## 3. Current state — ground truth (verify in source before you touch anything)

- **Route(s):** `/dashboard` → `pages/dashboard-next/index.html` → `src/dashboard-next/pages/home.js`; `/dashboard/account` → `account.html` → `account.js`; `/dashboard/analytics` → `analytics.html` → `analytics.js`. Shell (sidebar/topbar/live-event drawer/command palette) from `src/dashboard-next/shell.js`; data helpers from `src/dashboard-next/api.js`. Heavy 301 consolidation: `/dashboard-classic/*` and many legacy slugs (`/dashboard/wallets`, `/actions`, `/sns`, `/delegation`, `/usage`, etc.) redirect to canonical pages (mirrored in `vercel.json` + Vite dev middleware).
- **Source:** see above. All three pages are gated by `requireUser()` (in `api.js`), which calls `getMe()` → `GET /api/auth/me`; on 401 it navigates `/login?return=<path>` and returns a never-resolving promise so the page halts cleanly.
- **Current flow:**
  - `/dashboard` (8 required +2 optional): `mountShell()` → `requireUser()` → greeting ("Welcome back, <name>.") with new-account (<30 days) + dismissal-flag (`twx_onboarding_dismissed`, `twx_forge_announce_dismissed`) banner logic → skeletons across hero/KPI/activity → parallel `Promise.allSettled` fetch of `GET /api/avatars?limit=50`, `GET /api/widgets`, `GET /api/agents?limit=20` (each degrades independently) → render hero 3D avatar strip, KPI row (revenue/views/transcripts/avatars with 7-day sparklines), trading + world-health sections, 2×2 quick-actions grid, agent/avatar directory, recent-activity feed (stitched transcripts + revenue events) → onboarding guide (`getting-started.js`) reconciled against server state → **KPIs + activity re-poll every 30s**, relative timestamps tick every 60s → optional sidebar nav / command palette / live-event drawer / banner dismissal / `claimPendingReferral()`.
  - `/dashboard/account` (2 required +7 optional): boot + render sections (Profile, AI Provider Keys, Linked Wallets, SNS/.sol, Vanity Wallets, Delegation console, Action Log/audit). Mutations: `PATCH /api/auth/profile`, `PATCH /api/user/provider-keys`, `GET /api/auth/wallets` + `POST /api/auth/wallets/primary` + `DELETE /api/auth/wallets/{address}`, `POST /api/agent-delegate`, `GET /api/audit-log` (CSV export + paginate), `POST /api/auth/logout`.
  - `/dashboard/analytics` (5 required +1 optional): boot → skeletons (4 KPI + 3 panel bones) → parallel fetch for range (default 30d): `GET /api/billing/revenue?from&to&granularity`, `GET /api/agents?limit=50`, `GET /api/widgets`, `GET /api/billing/summary`, `GET /api/monetization/revenue?period=…` → secondary per-widget `GET /api/widgets/{id}/stats` (≤20) and `GET /api/agents/{id}/payments?direction=received&limit=5` (top 5) → render range bar (7d/30d/90d/12mo), KPI cards (Total Revenue, Total Callers, Avg Price/Call, Top Agent), Revenue-Over-Time canvas line chart (animated, hover tooltip), Revenue-by-Skill horizontal bars (top 8), Agent-Performance table (Views/Chats/Conv.%), Recent-Activity table (latest 20 payments, Settled/Failed/Pending badges) → optional range switch refetch + chart re-animation.
- **What works today:** Gated boot, shell chrome (sidebar/topbar/live-event drawer/command palette), per-slot skeletons, `Promise.allSettled` degradation, 30s KPI/activity polling, live 3D hero avatars, sparklines, animated canvas revenue chart with hover tooltip, range-driven granularity, account mutations with toasts, audit CSV export, delegation console, panel-level empty states with deep links to `/dashboard/monetize` and `/dashboard/agents`, global error + Reload fallback when all primary analytics fetches fail.
- **Real APIs / dependencies already wired:** `GET /api/auth/me`, `GET /api/avatars`, `GET /api/widgets`, `GET /api/agents`, `/api/billing/revenue`, `/api/billing/summary`, `/api/monetization/revenue`, `/api/widgets/{id}/stats`, `/api/agents/{id}/payments`, `PATCH /api/auth/profile`, `PATCH /api/user/provider-keys`, `GET /api/auth/wallets`, `POST /api/auth/wallets/primary`, `DELETE /api/auth/wallets/{address}`, `POST /api/agent-delegate`, `GET /api/audit-log`, `POST /api/auth/logout`; shared `tour.js`, `crypto-optional.js`, `log.js`, `state-kit`.
- **Where it's mediocre, thin, or unfinished:** The overview *reports* but doesn't *prioritize* — there's no "what changed since your last visit," no anomaly/spike detection, no single recommended next action. KPIs poll every 30s but the user can't tell *why* a number moved or click it to drill in. The live-event drawer pulses but the events aren't woven into the KPIs or activity feed as a coherent story. Analytics is a strong static report but has no comparison-to-previous-period, no per-agent drilldown from the overview, no export of the charts, no annotations. Account, overview, and analytics feel like three separate apps rather than one console — the agent table on `/dashboard` doesn't link cleanly into the analytics agent-performance row for the same agent. There's no command-palette-driven "jump to agent X's revenue" flow even though the palette exists. Empty/new-user state leans on the onboarding guide but doesn't show *aspirational* preview of what a populated command center looks like.

## 4. Innovation directions (seeds — you are expected to go beyond them)

- **"Since you last visited" intelligence.** On load, diff current server state against a stored snapshot (last-seen revenue total, payment count, new transcripts) and lead with a human summary: "+$42 across 3 agents, your top earner shifted to <Agent>, 2 new chats need a reply." Make the dashboard answer "what happened?" before the user asks.
- **Live KPI cards that explain and drill.** Each KPI becomes interactive: click revenue → inline mini-chart + the payments that drove it (reuse `/api/billing/revenue` + `/api/agents/{id}/payments`); period-over-period delta with up/down coloring; sparkline that animates on poll-update. Tie the 30s poll to a subtle "live" pulse and a "data updated just now" affordance so the user trusts it's real-time.
- **One recommended action.** Surface a single, computed "do this next" card from real state — e.g. an agent with views but zero conversions ("price too high?"), an unconfigured provider key blocking a feature, a wallet not set primary, revenue that dropped vs last period. Make it deep-link to the exact fix (`/dashboard/account`, `/dashboard/monetize`, the agent editor).
- **Unify the three surfaces into one console.** Make the overview agent directory rows link straight into that agent's analytics drilldown; make the command palette support "jump to <agent> revenue / open <agent> settings / link a wallet"; make the live-event drawer events click through to the relevant KPI or activity item. The user should never feel they left the command center.
- **Period comparison + annotations in analytics.** Add previous-period overlay on the revenue chart, a delta summary on every KPI card, and the ability to hover any point to see the exact payments behind it. Add chart export (PNG/CSV of the rendered series).
- **Cross-feature wiring:** pull the same identity/auth-hint set at login into a personalized greeting and recognized-returning-visitor treatment; wire revenue numbers to the monetization surfaces (`/dashboard/monetize`); wire the agent directory to the agent editor and to `/dashboard/analytics`; feed the live-event drawer from the real-time alert/automation engine if present; let "Top Agent" on analytics open that agent's profile and its $THREE-linked monetization.

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
4. **Delete this task file** — `prompts/feature-innovation/11_02_dashboard.md`.
5. Report: what you shipped, what you *invented*, and the single best next idea you'd pursue.

---

## Reference shelf

- **This feature's current UX:** `docs/ux-flows/11-account-dashboard.md`
- **Repo map:** `STRUCTURE.md` · **Operating rules:** `CLAUDE.md` · **Design tokens:** `DESIGN-TOKENS.md`
- **Credentials / endpoints:** `.env`, `.env.example`
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000); Three.js (glTF/GLB); Vercel functions in `api/`; Cloudflare workers in `workers/`; Solana / agent SDKs in `sdk/`, `solana-agent-sdk/`, `agent-payments-sdk/`.
