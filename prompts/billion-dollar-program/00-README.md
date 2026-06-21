# three.ws — Production → $1B Program

> **Read this file in full before running any prompt in this folder.** Every prompt
> here (`01-*` … `44-*`) assumes the context below — do not re-derive it. Each prompt
> is a single, self-contained task meant to be pasted into its own fresh agent chat.

> **Note on this folder.** This is one complete, deduplicated, coherent 44-prompt
> program. Sibling folders under `prompts/` (e.g. `road-to-1b/`, `production-1b/`,
> `samples/`, `production-readiness/`) are parallel drafts generated concurrently —
> this folder (`billion-dollar-program/`) is the consolidated, authoritative set.
> If you only run one program, run this one.

## What this is

A sequenced program to take **three.ws** from "feature-rich but uneven" to
**production-grade and ready to scale to a $1B platform**. Each numbered file is one
self-contained task. Run them roughly in phase order — later phases assume earlier
ones are done — but any single prompt can be run independently.

This program is about **finishing, hardening, polishing, and growing what already
exists** so the platform is correct, reliable, fast, accessible, secure, observable,
and conversion-optimized. Net-new feature invention lives in the sibling folders
(`feature-innovation/`, `moonshots/`, `inventions/`).

## The bar (non-negotiable — applies to every prompt)

Every prompt inherits the operating rules in **`/CLAUDE.md`**. Re-read it. The rules
that matter most here:

- **No mocks, no fake data, no placeholders, no TODOs, no stubs.** If you touch it,
  finish it. Real APIs, real endpoints, real data.
- **No "good enough."** Fix mediocrity the moment you see it.
- **No errors without solutions.** Every error has a root cause; find it and fix it.
  Ship working fallbacks and failsafes, never lazy propagation. Never leak a vendor's
  internal state (e.g. a provider's billing page) to an end user.
- **Every state is designed** — loading, empty, error, populated, overflow.
- **The only coin is `$THREE`** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
  Never reference any other coin anywhere. See `/CLAUDE.md` for the two
  runtime-data-only mechanical exceptions.
- **Adopt vetted OSS over hand-rolling**; add hardening to new/unprotected paths
  rather than refactoring working code. Prefer the existing **cockatiel** resilience
  helper for retries/circuit-breakers.
- **Definition of done**: the checklist in `/CLAUDE.md` must be true. If you can't
  verify a step, say so explicitly — never claim done you can't verify.

## How to run a prompt

1. Open a fresh chat in this repo.
2. Paste the prompt file contents, or reference it: "Execute
   `prompts/billion-dollar-program/NN-*.md`".
3. Let the agent work end-to-end. It should use `TodoWrite` for multi-step work,
   exercise UI in a real browser (`npm run dev`, port 3000), and run the relevant tests.
4. Spot-check against the prompt's **Acceptance** section.
5. Commit + push only when the user asks (the agent pushes to **both** remotes,
   `threeD` and `threews`, per `/CLAUDE.md`).

## Repository orientation (so every prompt starts from truth)

- **`STRUCTURE.md`** maps every product surface to its directory. Read it before
  exploring the ~60 top-level dirs.
- Frontend: vanilla JS modules + Vite (`npm run dev`, port 3000). `pages/*.html`
  (~168 pages), `src/` (~810 modules), `public/`.
- Backend: Vercel functions in `api/` (~960 handlers), Cloudflare workers in
  `workers/` (18). Routing, functions, crons, headers, env all in `vercel.json`.
- 3D: Three.js + glTF/GLB. Avatar/animation pipeline under `public/animations/`,
  `src/glb-canonicalize.js`, `src/animation-retarget.js`. Model workers in
  `workers/model-*`. The avatar rule in `/CLAUDE.md` is law (no rig allowlist).
- Tests: `npm test` = `vitest run && playwright test` (456 vitest files). `npm run
  lint` (eslint), `npm run typecheck` (tsc on jsconfig). CI is `.github/workflows/ci.yml`
  with jobs: **lint**, **test**, **guards** (`check-api-not-bundled`, `check:images`,
  `build:pages`), **typecheck** (advisory).
- Changelog: every user-visible change gets an entry in `data/changelog.json`, then
  `npm run build:pages` regenerates `CHANGELOG.md` + `public/changelog.{json,xml}`.
- **Lean on the existing audit tooling — do not reinvent it:** `audit:deploy`,
  `audit:pages`, `audit:handlers`, `audit:web`, `audit:mcp`, `check:images`,
  `seo:meta`, `verify`, `verify:solana`, `verify:onchain`, `smoke:onchain`,
  `smoke:mcp`, `snapshot`. (See `package.json` scripts.)
- Resilience helpers and payments plumbing already exist in `api/_lib/` (x402-spec,
  x402-paid-endpoint, agent-wallet, secret-box, rate-limit, forge-health). Build on them.

## Known traps (from `/CLAUDE.md`)

- **Concurrent agents share this worktree.** Stage explicit paths only (never
  `git add -A`). Re-check `git status` before committing.
- **`npx vercel build` overwrites `api/*.js` in place** with esbuild bundles. Check
  `head -1` for `__defProp`/`createRequire` before committing a large `api/` diff.
- **Never pull/fetch/merge from the `threeD` remote** — it is push-only.

## Phases & index

**Phase 0 — Foundation (stop the platform from lying about "done")**
- `01` Test suite green + CI gate
- `02` Dead paths & broken links — every button works, every link resolves
- `03` Zero console errors & warnings across all pages
- `04` No-mocks / no-fake-data / no-TODO / no-stub sweep
- `05` Secrets & env hygiene

**Phase 1 — Cross-cutting production hardening**
- `06` Error handling & resilience (`api/` + `workers/`)
- `07` Security hardening (authz, input validation, headers, SSRF)
- `08` Rate limiting & abuse prevention
- `09` Accessibility (WCAG 2.2 AA)
- `10` Performance & Core Web Vitals
- `11` Mobile responsiveness (320 / 768 / 1440)
- `12` Every state designed (loading / empty / error / overflow)
- `13` Design-system consistency (tokens, spacing, typography, theming)
- `14` SEO & structured data

**Phase 2 — Product surface completeness (each end-to-end)**
- `15` Forge / Text→3D / Avatar generation pipeline
- `16` Marketplace
- `17` Agent profiles, Agent Studio & economy
- `18` Wallet & x402 payments
- `19` Walk companion, Page-Agent & Feature Tour
- `20` Scene Studio & Animation Studio
- `21` Avatar creator / Character Studio / Selfie→avatar
- `22` Pump.fun launch, Oracle, trading & $THREE surfaces
- `23` MCP servers (production-ready)
- `24` SDK publishing & docs
- `25` Worlds & Coin Clash (token-gated 3D)

**Phase 3 — Scale, infra, observability**
- `26` Observability (logging, metrics, error tracking)
- `27` Database integrity & migrations
- `28` Deploy pipeline & rollback safety
- `29` Uptime monitoring & public status page
- `30` Load & stress testing
- `31` Solana RPC & on-chain resilience
- `32` Caching, CDN & R2 asset strategy

**Phase 4 — Growth to $1B**
- `33` Onboarding & activation funnel
- `34` Home / landing conversion
- `35` Pricing & monetization surfaces
- `36` Growth analytics instrumentation
- `37` Developer experience & docs site
- `38` Referral & virality loops
- `39` Trust, safety & moderation
- `40` Legal, compliance, ToS & privacy
- `41` i18n completion
- `42` PWA & offline & notifications
- `43` Brand, press & social proof
- `44` Launch-readiness review (the final gate)

## Prompt anatomy

Each file has: **Why this matters for $1B**, **Mission**, **Map** (where things
live — trust but verify; files move), **Do this** (ordered steps), **Must-not**
(guardrails), and **Acceptance** (a checklist that must be all-true before claiming
done). If a path is stale, find the real one and proceed — never stop because a path
was wrong.
