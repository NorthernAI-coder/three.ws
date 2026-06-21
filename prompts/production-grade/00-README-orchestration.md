# Program: Road to $1B — production-grade three.ws

> **Read this file in full before starting any task in this folder.** Every numbered
> prompt (`01-*` … `20-*`) assumes the context below and does not repeat it. One agent
> chat per task file. When a task is truly done (including the self-improve pass and a
> changelog entry), the agent **deletes its own prompt file**. Leave this README until
> the whole program is complete.

## Why this program exists

three.ws is already a real, broad, working platform — the 2026-06-18 audit
([docs/audit/2026-06-18-codebase-audit.md](../../docs/audit/2026-06-18-codebase-audit.md))
found it "in strong, production-ready shape," with only hardening and consistency work
outstanding. This program is the gap between "strong and working" and **a product that
could credibly carry a billion-dollar valuation**: one that activates new users on first
visit, spreads itself, converts to revenue, never falls over, pays its creators visibly,
and reads as a real company to users, partners, and enterprise buyers.

Each task below was derived from a grounded survey of the actual codebase. The file paths
are real. The gaps are real. None of these are greenfield — every task is "this exists,
here's where it falls short of the bar, raise it." That's the work.

**The bar:** would a senior engineer demo this without apologizing? Would a degen who
trades for a living switch to three.ws because of it? Would someone screenshot it? If not,
it isn't done.

## The literal seed of this program

This program started from one request: the Forge engine picker lists its two free 3D
lanes by vendor — `nvidia: 'NVIDIA'` and `huggingface: 'Hunyuan3D'` in
[src/forge.js](../../src/forge.js) (`ENGINE_LABELS`, ~line 180), each rendered with a
`FREE` pill — and they should instead read as **three.ws's own** house engines, not a
vendor billboard. That relabel is the first concrete deliverable of task `20`. It's small;
it's also the spirit of the whole program — every surface should sell three.ws, not the
infrastructure underneath it.

## Hard rules (from [CLAUDE.md](../../CLAUDE.md) — non-negotiable, repeated so you don't skip them)

- **No mocks. No fake data. No placeholders. No sample arrays. No `setTimeout` fake
  loading.** Every number on screen and in every response traces to a real API, real RPC,
  real chain call, or real DB row. If a value is `0`, render a real `0`.
- **No TODOs, no stubs, no `throw new Error("not implemented")`, no commented-out code.**
  If you write it, finish it and wire it end-to-end so a real user/agent can reach it.
- **No errors without solutions.** Find the root cause, ship the correct fix with a real
  fallback. Lazy error propagation is not engineering.
- **The only coin is `$THREE`** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never
  name, hardcode, link, or recommend any other token anywhere — code, copy, tests,
  fixtures, commits, or conversation. The only exceptions are runtime-supplied mints (a
  user sniping an arbitrary launch; the `/launches` feed rendering platform launch
  records). Never hardcode or promote a specific non-$THREE mint. Tests use the $THREE CA
  or a synthetic placeholder (`THREEsynthetic1111…`).
- **Every state is designed:** loading (skeletons via [src/shared/state-kit.js](../../src/shared/state-kit.js),
  not spinners), empty (tell the user what to do next), error (actionable + retry),
  populated, overflow.
- **Accessibility is not optional:** semantic HTML, ARIA on interactive elements, keyboard
  nav, focus rings, contrast, `prefers-reduced-motion`.
- **Match the design system.** Tokens live in [public/tokens.css](../../public/tokens.css).
  Never hardcode hex/px when a token exists.

## Design system (use these, never invent values)

Source of truth: [public/tokens.css](../../public/tokens.css), imported globally.
Monochrome glass on near-black: `--bg-0`, surfaces `--surface-1/2/3`,
`--stroke`/`--stroke-strong`, `--accent`, text `--ink`/`--ink-dim`/`--ink-bright`/`--ink-faint`,
`--success`/`--danger`/`--warn`. Type: `--font-display` (Space Grotesk), `--font-body`
(Inter), `--font-mono` (JetBrains Mono — all addresses/amounts). Spacing: phi scale
`--space-*`. Radii `--radius-*`. Shadows `--shadow-*`. Blur `--blur-*`. Motion
`--duration-*`/`--ease-standard`. Shared UI states come from
[src/shared/state-kit.js](../../src/shared/state-kit.js); nav from
[public/nav.js](../../public/nav.js)/[public/nav-data.js](../../public/nav-data.js).

## Repo orientation (read before exploring)

- [STRUCTURE.md](../../STRUCTURE.md) maps every product surface to its directory. Read it
  first — there are 60+ top-level dirs.
- Frontend: vanilla JS modules + Vite (`npm run dev`, port 3000). Pages in `pages/` +
  `src/`, static in `public/`.
- Backend: Vercel functions in `api/`, Cloudflare workers in `workers/`. Shared backend
  libs in `api/_lib/`.
- Data/DB: Neon via [api/_lib/db.js](../../api/_lib/db.js); migrations in
  `api/_lib/migrations/` applied with `npm run db:migrate` (dry-run by default).
- 3D: Three.js + glTF/GLB. Avatar animation is universal (no rig allowlist) — see CLAUDE.md.

## Working rules for THIS repo (traps that have bitten agents here)

- **Concurrent agents share this worktree.** Others commit on `main` while you work.
  **Stage explicit paths only** (`git add path/to/file`) — never `git add -A`/`git add .`.
  Re-run `git status` + `git diff --staged` right before committing. Expect files you
  didn't write to appear; don't stage them.
- **`npx vercel build` overwrites `api/*.js` in place** with esbuild bundles. If a large
  `api/` diff shows `__defProp`/`createRequire` at the top of a file, recover with
  `git restore -- api/ public/`. Prefer not to run it.
- **Two remotes.** `threews` (canonical) and `threeD` (push-only mirror). **Never pull,
  fetch, or merge from `threeD`.** Pull only from `threews`. Push to BOTH when asked.
- **Do not commit or push unless the user explicitly asks.** Leave clean, reviewed work.
- Run `npm run dev` and exercise UI work in a real browser. No console errors/warnings
  from your code. Confirm real API calls in the Network tab.
- Tests: `npm test` (vitest + playwright), `npm run test:core` (vitest, single worker).
  Verify the runner works in your environment; **write real vitest/playwright tests
  regardless** — CI runs them.

## Changelog (every user-visible change)

Append an entry to [data/changelog.json](../../data/changelog.json): date, holder-readable
title + summary (plain language, no commit jargon), tags from
`feature|improvement|fix|sdk|infra|docs|security`. Run `npm run build:pages` to validate
and regenerate. Do **not** run `changelog:push`. Internal-only chores (CI, refactors with
no visible effect) get no entry.

## Definition of done (per task)

1. Code written, wired into the UI/API/SDK, reachable by a real user/agent across **all**
   relevant surfaces — no dead paths.
2. UI exercised in a real browser via `npm run dev`. No console errors/warnings.
3. Network tab shows real API calls returning real data.
4. Every interactive element has hover/active/focus states; every state
   (loading/empty/error/populated/overflow) designed.
5. Logged-out / signed-in / owner / visitor states correct where relevant.
6. Real tests written; `npm test` passes. Changelog entry added. `git diff` self-reviewed —
   every changed line justified.
7. You would proudly demo this to a room of senior engineers **and** to a room of degens.

## Then: improve, then delete this task

After meeting the DoD, run the CLAUDE.md self-review protocol (lazy check, user check,
integration check, edge-case check — 0/1/1000 items, very long names, network failure
mid-op, expired session — pride check). Find the single biggest weakness and fix it now.
Then ask: does what you built unlock something adjacent? Wire that connection.

**Finally, when the task is complete (and committed, if the user asked), delete your own
prompt file** so the board reflects reality. Leave this README in place.

## Tracks & task index

Six tracks. Tasks within a track are mostly independent and can run in parallel chats;
note the few dependencies. There is no hard global ordering, but the suggested sequencing
front-loads activation/growth (revenue-facing) and reliability (won't-fall-over), since
those gate everything else.

### Track A — Activation & onboarding (turn first visits into first success)
- `01-first-run-and-feature-tour.md` — auto-launch the feature tour for new visitors;
  build/repair the `/start` wizard; wire onboarding to real progress.
- `02-funding-and-free-to-paid-upsell.md` — "get USDC" funding step + quota-hit
  instrumentation and upgrade CTAs before any 403.

### Track B — Virality & distribution (make the product spread)
- `03-dynamic-og-and-social-proof.md` — per-agent/per-coin/per-avatar OG images, share
  buttons in detail heroes, real social-proof counts on cards.
- `04-referral-program-surfaced.md` — surface the existing referral engine: share card,
  leaderboard, `ref=` propagation, incentive copy.
- `05-programmatic-seo.md` — crawlable/prerendered agent, skill, and marketplace pages +
  structured data + high-intent content.

### Track C — Revenue & creator economy (prove creators earn)
- `06-creator-dashboard.md` — self-serve creator UI: price editor, live earnings, payout
  history, analytics.
- `07-skill-reviews-and-revenue-attribution.md` — ship the reviews/ratings system (schema
  exists) and the full purchase→revenue→payout analytics funnel.
- `08-checkout-completion-and-unified-pricing.md` — complete checkout (EVM, receipts,
  retry, abandonment tracking) + one coherent pricing surface.

### Track D — Reliability & hardening (a $1B platform does not fall over)
- `09-resilience-external-calls.md` — wrap every external call (Solana RPC, pump.fun,
  forge providers, x402 facilitator, LLMs) in timeout + retry + circuit breaker.
- `10-payments-integrity.md` — idempotency everywhere, settlement reconciliation, refund
  path, queryable audit log.
- `11-rate-limit-and-abuse-caps.md` — per-principal spend caps and global concurrency
  ceilings on every expensive endpoint.
- `12-observability-and-status.md` — structured logging + request tracing + server-side
  Sentry + secret scrubbing + a `/api/status` that probes live dependencies.
- `13-cron-hardening.md` — distributed locks, run-history/last-success, failure alerting,
  surfaced in status.

### Track E — Engineering excellence (ship safely, stay fast)
- `14-e2e-tests-and-ci-gate.md` — Playwright E2E for checkout/signup/forge/avatar; move
  E2E into the CI merge gate; add coverage reporting.
- `15-ci-security-and-quality-gates.md` — dependency/vuln scanning, blocking typecheck,
  bundle-size budget.
- `16-performance-and-assets.md` — lazy-load heavy GLBs, move the 200MB+ animation set to
  CDN out of git, add Core Web Vitals monitoring.

### Track F — Trust, legal, docs & polish (read as a real company)
- `17-company-and-brand-surfaces.md` — About/team/careers/press-kit/brand assets.
- `18-compliance-and-trust-pages.md` — cookie consent, accessibility statement,
  disclosure/bug-bounty, incident history.
- `19-i18n-activation.md` — run the translation pipeline for all configured locales, add a
  language switcher, RTL support.
- `20-design-system-and-a11y-polish.md` — **relabel the free Forge lanes (the seed task)**,
  tokenize stray hex/px, keyboard-navigable 3D viewers, modal focus management.

### Suggested sequencing

1. **First wave (revenue + safety, run in parallel):** `01`, `03`, `09`, `11`, `14`.
2. **Second wave:** `02`, `04`, `06`, `10`, `12`, `15`.
3. **Third wave:** `05`, `07`, `08`, `13`, `16`.
4. **Fourth wave (credibility + polish):** `17`, `18`, `19`, `20`.

Dependencies are called out inside each file. Coordinate only on shared modules
(`src/shared/*`, `api/_lib/*`, [src/analytics.js](../../src/analytics.js),
[public/tokens.css](../../public/tokens.css)).

## The invention bar (read twice)

Table stakes are the floor, not the goal. The ceiling is what is **only possible because
three.ws welds a funded, self-custodial wallet to a rigged, talking, ownable 3D agent**.
When a task offers a choice between "what every SaaS has" and "what only we can do," build
ours. Every feature should answer "why can only three.ws do this?" — if the answer is
"anyone could," raise it until someone would switch platforms for it.
