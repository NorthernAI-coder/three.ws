# Production-Ready — road to $1B program

> **Read this file in full before starting any prompt in this folder.** Every prompt
> here (`01-*` … `40-*`) assumes the context below. Do not re-derive it. Each prompt
> is self-contained and meant to be run in its own fresh chat.

## What this is

A sequenced program of work to take **three.ws** from "feature-rich but uneven" to
**production-grade and ready to scale to a $1B platform**. Each numbered file is a
single, self-contained task you can paste into a new agent chat. They are grouped
into phases. Run them roughly in order — later phases assume earlier ones are done —
but any single prompt can be run independently.

This is not a feature-invention program (that lives in the sibling folders:
`feature-innovation/`, `moonshots/`, `inventions/`, etc.). This program is about
**finishing, hardening, and polishing what already exists** so the platform is
correct, reliable, fast, accessible, secure, observable, and conversion-optimized.

## The bar (non-negotiable — applies to every prompt)

Every prompt inherits the operating rules in **`/CLAUDE.md`**. Re-read it. The rules
that matter most for this program:

- **No mocks, no fake data, no placeholders, no TODOs, no stubs.** If you touch it,
  finish it. Real APIs, real endpoints, real data.
- **No "good enough."** Fix mediocrity the moment you see it.
- **No errors without solutions.** Every error has a root cause; find it and fix it.
  Ship working fallbacks and failsafes, never lazy propagation.
- **Every state is designed** — loading, empty, error, populated, overflow.
- **The only coin is `$THREE`** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference any other coin anywhere. See `/CLAUDE.md` for the two
  runtime-data-only mechanical exceptions.
- **Definition of done**: the checklist in `/CLAUDE.md` must be true. If you can't
  verify a step, say so explicitly — do not claim done.

## How to run a prompt

1. Open a fresh chat in this repo.
2. Paste the contents of the prompt file (or reference it: "Execute
   `prompts/production-ready/NN-*.md`").
3. Let the agent work end-to-end. It should use `TodoWrite` for multi-step work,
   exercise the feature in a real browser for UI work, and run the relevant tests.
4. When it reports done, spot-check against the prompt's **Acceptance** section.
5. Commit + push when satisfied (the agent will push to **both** remotes —
   `threeD` and `threews` — per `/CLAUDE.md`).

## Repository orientation (so every prompt starts from truth)

- **`STRUCTURE.md`** maps every product surface to its directory. Read it before
  exploring the ~60 top-level dirs.
- Frontend: vanilla JS modules + Vite (`npm run dev`, port 3000).
  `pages/*.html` (125 pages), `src/`, `public/`.
- Backend: Vercel functions in `api/` (~960 handlers), Cloudflare workers in
  `workers/`. Config in `vercel.json` (routes, functions, crons, env).
- Shared backend libs live in **`api/_lib/`** — know these before adding new ones:
  resilience `resilience.js` (cockatiel) + `db-retry.js`; rate limiting
  `rate-limit.js` + `redis.js` + `redis-usage.js`; HTTP helpers `http.js` +
  `http-params.js`; auth `auth.js`/`account-auth.js`/`zauth.js`/`skill-access.js`;
  data `db.js` + `schema.sql` + `migrations/`; env `env.js`; observability
  `sentry.js` + `usage.js`; health `forge-health.js`/`llm-health.js`/
  `provider-health.js` (+ `api/healthz.js`); the x402 family
  (`x402-paid-endpoint.js`, `x402-spending-cap.js`, `x402-spending-ledger.js`,
  `x402-solana-confirm.js`, `x402-errors.js`, …). **Reuse these, don't reinvent.**
- 3D: Three.js + glTF/GLB. Avatar/animation pipeline under `public/animations/`,
  `src/glb-canonicalize.js`, `src/animation-retarget.js`.
- Tests: `npm test` = `vitest run && playwright test`. `npm run test:all` also runs
  `test:pages`. `npm run lint` (eslint), `npm run typecheck` (tsc on jsconfig).
- Changelog: user-visible changes get an entry in `data/changelog.json`, then
  `npm run build:pages` regenerates `CHANGELOG.md` + `public/changelog.{json,xml}`.
- Existing audit tooling you should lean on, not reinvent:
  `npm run audit:deploy`, `audit:pages`, `audit:handlers`, `audit:web`, `audit:mcp`,
  `check:images`, `seo:meta`, `verify`, `verify:solana`, `verify:onchain`,
  `smoke:onchain`, `smoke:mcp`.
- Resilience policy (memory): prefer vetted OSS (cockatiel) over hand-rolling; add
  hardening to new/unprotected paths rather than refactoring working code.

## Phases

**Phase 0 — Foundation (stop the platform from lying about "done")**
- `01` Test suite green + CI gate
- `02` Dead paths & broken links — every button works, every link resolves
- `03` Zero console errors/warnings across all pages
- `04` No-mocks / no-placeholders sweep (~400 marker files)
- `05` Secrets & env hygiene

**Phase 1 — Cross-cutting production hardening**
- `06` Error handling & resilience (api/ + workers/)
- `07` Security hardening (authz, input validation, headers)
- `08` Rate limiting & abuse prevention
- `09` Accessibility (WCAG 2.2 AA)
- `10` Performance & Core Web Vitals
- `11` Mobile responsiveness (320 / 768 / 1440)
- `12` Every state designed (loading / empty / error)
- `13` Design-system consistency (tokens, spacing, typography)
- `14` SEO & structured data

**Phase 2 — Product surface completeness (each end-to-end)**
- `15` Forge (text/image → 3D)
- `16` Marketplace
- `17` Agent profiles & economy
- `18` Wallet & x402 payments
- `19` Walk companion & feature tour
- `20` Scene Studio
- `21` Avatar creator / Character Studio
- `22` Pump.fun launch & $THREE surfaces
- `23` MCP servers (production-ready)
- `24` SDK publishing & docs

**Phase 3 — Scale, infra, observability**
- `25` Observability (logging, metrics, error tracking)
- `26` Database integrity & migrations
- `27` Deploy pipeline & rollback safety
- `28` Uptime monitoring & public status page
- `29` Load & stress testing

**Phase 4 — Growth to $1B**
- `30` Onboarding & activation funnel
- `31` Home / landing conversion
- `32` Pricing & monetization surfaces
- `33` Growth analytics instrumentation
- `34` Developer experience & docs site
- `35` Referral & virality loops
- `36` Trust, safety & moderation
- `37` Legal, compliance, ToS & privacy
- `38` i18n completion
- `39` PWA & notifications
- `40` Launch-readiness review (the final gate)

## Prompt anatomy

Each file has: **Why this matters for $1B**, **Mission**, **Map** (where things
live), **Do this** (ordered steps), **Must-not** (guardrails), and **Acceptance**
(a checklist that must be all-true before claiming done). Trust the Map but verify —
files move; if a path is stale, find the real one and proceed. Never stop because a
path was wrong.

> Note: this folder was authored alongside a parallel set under `prompts/road-to-1b/`.
> If both exist, reconcile to a single canonical folder before running the program.
