# three.ws — Production-Readiness Track (Road to $1B)

A complete, self-contained catalog of engineering + product-surface hardening prompts.
Each `NN-*.md` file is written to be **pasted into a fresh chat** at `/workspaces/three.ws`
and executed end-to-end by a senior agent with **no prior context**. Together they take
the platform from "works on a good day" to "fundable, demo-able to a room of senior
engineers, ready to scale."

> **Relationship to `prompts/road-to-1b/`:** that directory is the growth / monetization /
> conversion track (funding upsell, referrals, programmatic SEO, creator dashboard,
> checkout, studio/agent/marketplace surfaces). **This** directory is the
> engineering-readiness track: audits, cross-cutting hardening, every product surface,
> payments/on-chain safety, infra/ops, and the launch gate. They complement each other —
> run both. Where topics overlap (observability, rate-limiting, SEO), treat the more
> specific prompt as authoritative and don't redo work already shipped.

---

## How to use
1. Open a **new chat** in this repo (`/workspaces/three.ws`).
2. Paste the **full contents** of one prompt file. Nothing else is needed — each file is standalone.
3. Let the agent map → execute → verify → report. Review the `git diff`.
4. Commit + push when satisfied: `git push threeD main && git push threews main`.
5. Move to the next prompt. Mark it done in the tracker below.

Many prompts within a phase run in parallel in **separate chats** — but every agent shares
**one worktree**, so each must stage explicit paths only (never `git add -A`) and re-check
`git status` before committing.

---

## Phases
- **Phase 1 — Audit & baseline** (`01`–`04`): find every gap first. These produce issue lists later phases consume. **Run first.**
- **Phase 2 — Cross-cutting hardening** (`05`–`20`): secrets, errors, security, rate limits, resilience, observability, caching, tests, CI, a11y, responsive, performance, design system.
- **Phase 3 — Product surfaces** (`21`–`34`): harden each surface end-to-end — every state designed, every path reachable.
- **Phase 4 — Payments / on-chain / agent economy** (`35`–`44`): x402, wallets, pump.fun, $THREE gating, MCP, SDKs, contracts, money safety.
- **Phase 5 — Infra & ops** (`45`–`50`): migrations, load, status page, DR, key rotation, crons.
- **Phase 6 — Growth, SEO, GTM & launch** (`51`–`60`): SEO, i18n, analytics, legal, PWA, email, homepage, docs, pricing, launch gate.

**Recommended order:** Phase 1 → (Phase 2 ∥ Phase 3) → Phase 4 → Phase 5 → Phase 6.
`60-final-launch-checklist.md` is the gate — run it last and let nothing through that fails it.

---

## Operating rules (non-negotiable — every prompt repeats a short form of these)
- **Read `CLAUDE.md` + `STRUCTURE.md` first.** CLAUDE.md overrides defaults. STRUCTURE.md maps every surface to its directory.
- **No mocks, fake data, placeholders, TODOs, stub functions, or `throw new Error("not implemented")`.** Real APIs, real endpoints, real implementations only. Errors handled at boundaries; internal code trusts itself.
- **`$THREE` is the only coin** — CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference, name, hardcode, import, render, or recommend any other token anywhere (code, copy, tests, fixtures, commits). If you find another coin referenced, remove it like a leaked secret. The only exceptions are runtime-supplied mints in coin-agnostic plumbing and the platform's own launch directories.
- **Concurrent agents share this worktree.** Stage explicit paths only (never `git add -A`/`git add .`); re-check `git status` and `git diff --staged` immediately before committing.
- **esbuild trap:** `npx vercel build` overwrites `api/*.js` with bundles. Never commit an `api/*.js` whose first line starts with `__defProp`/`createRequire`. Recover with `git restore -- api/ public/`.
- **Changelog:** every user-visible change → an entry in `data/changelog.json` (date, holder-readable title + summary, tags), then `npm run build:pages`. Internal-only chores get no entry.
- **Push to BOTH remotes** when asked: `git push threeD main` **and** `git push threews main`. **Never** pull/fetch/merge from `threeD` (push-only mirror); pulls come from `threews` only.
- **Definition of done** = CLAUDE.md's checklist: wired + reachable, every state designed (loading/empty/error/populated/overflow), no console errors, real API calls, hover/active/focus states, `npm test` green, `git diff` self-reviewed.

---

## Key facts every agent should know (verified 2026-06-21)
- **Stack:** vanilla JS modules + Vite (`npm run dev`, port 3000) · Three.js + glTF/GLB · Vercel functions in `api/` · Cloudflare workers in `workers/`.
- **Tests:** Vitest (`vitest run`) + Playwright (`tests/e2e/*.spec.js`). `npm test` runs both. `npm run test:gate` = critical money/auth subset. Config: `vitest.config.js`, `playwright.config.js`.
- **CI:** `.github/workflows/ci.yml` — lint (eslint, new-errors-only), unit (vitest), source guards (`check-api-not-bundled.mjs`, `check:images`, `build:pages`), typecheck (advisory).
- **API helpers:** `api/_lib/http.js` (`json`/`error`/`serverError`, security headers, no-store default), `api/_lib/env.js` (`req`/`opt`/`addr`/`pem` lazy getters), `api/_lib/db.js` (Neon serverless Postgres), `api/_lib/rate-limit.js` (Upstash Redis, fail-closed in prod), `api/_lib/sentry.js` (custom HTTP envelope), `api/_lib/secret-box.js` (AES-256-GCM).
- **Health:** `api/healthz.js` → `GET /api/healthz`. Client error reporter: `public/error-reporter.js` → `POST /api/client-errors`.
- **DB migrations:** `api/_lib/migrations/*.sql` (183 files), runner `scripts/apply-migrations.mjs` (`npm run db:migrate` / `db:status`), tracked in `schema_migrations`.
- **Headers/routes:** `vercel.json` (HSTS, nosniff, referrer-policy, permissions-policy, CSP, per-route cache + frame-ancestors).
- **Design tokens:** `public/tokens.css` (golden-ratio scale) + `:root` in `public/style.css`. Theme: `public/theme-switcher.js` (`twx_theme`). Mobile: `public/mobile.css`.
- **i18n:** `.i18nrc.json` (Groq provider, 11 target locales), `public/locales/*.json`, `src/i18n.js`, `scripts/i18n-extract.mjs` + `i18n-translate.mjs`. Only `en` + `es` live so far.
- **SEO:** `data/pages.json` (source of truth) → `scripts/build-page-index.mjs` → sitemap, `llms.txt`, changelog. Page route audit is strict: every public `.html` route must be in `data/pages.json` or `scripts/audit-page-index.mjs`'s IGNORE set.

---

## Status tracker
Mark each as you go.

| # | Prompt | Phase | Status |
|---|---|---|---|
| 01 | production-readiness-audit | 1 | ☐ |
| 02 | dead-paths-and-broken-links | 1 | ☐ |
| 03 | console-errors-and-warnings | 1 | ☐ |
| 04 | routing-redirects-and-404 | 1 | ☐ |
| 05 | secrets-and-env-hygiene | 2 | ☐ |
| 06 | error-handling-and-failsafes | 2 | ☐ |
| 07 | security-hardening | 2 | ☐ |
| 08 | rate-limiting-and-abuse | 2 | ☐ |
| 09 | resilience-external-calls | 2 | ☐ |
| 10 | observability-and-alerting | 2 | ☐ |
| 11 | backend-caching-and-cdn | 2 | ☐ |
| 12 | test-coverage-unit | 2 | ☐ |
| 13 | e2e-critical-flows | 2 | ☐ |
| 14 | ci-cd-gates | 2 | ☐ |
| 15 | accessibility-wcag | 2 | ☐ |
| 16 | mobile-responsiveness | 2 | ☐ |
| 17 | performance-core-web-vitals | 2 | ☐ |
| 18 | frontend-bundle-performance | 2 | ☐ |
| 19 | 3d-asset-performance | 2 | ☐ |
| 20 | design-system-consistency | 2 | ☐ |
| 21 | forge-text-to-3d-pipeline | 3 | ☐ |
| 22 | avatar-create-edit-rig | 3 | ☐ |
| 23 | selfie-to-avatar | 3 | ☐ |
| 24 | gallery-and-animations | 3 | ☐ |
| 25 | scene-studio | 3 | ☐ |
| 26 | dashboard | 3 | ☐ |
| 27 | search-and-discovery | 3 | ☐ |
| 28 | onboarding-create-wizard | 3 | ☐ |
| 29 | feature-tour-and-demos | 3 | ☐ |
| 30 | social-club-and-city | 3 | ☐ |
| 31 | walk-and-irl | 3 | ☐ |
| 32 | widget-studio-embed | 3 | ☐ |
| 33 | agent-studio-and-brain | 3 | ☐ |
| 34 | launches-feed-and-agent-profiles | 3 | ☐ |
| 35 | x402-payments-hardening | 4 | ☐ |
| 36 | wallet-connect-and-funding | 4 | ☐ |
| 37 | pumpfun-launches | 4 | ☐ |
| 38 | three-holder-gating | 4 | ☐ |
| 39 | mcp-servers | 4 | ☐ |
| 40 | published-sdks-and-docs | 4 | ☐ |
| 41 | onchain-contracts | 4 | ☐ |
| 42 | solana-base-parity | 4 | ☐ |
| 43 | agent-to-agent-payments | 4 | ☐ |
| 44 | money-safety-idempotency | 4 | ☐ |
| 45 | database-migrations-and-integrity | 5 | ☐ |
| 46 | load-and-stress-testing | 5 | ☐ |
| 47 | uptime-health-and-status-page | 5 | ☐ |
| 48 | backup-and-disaster-recovery | 5 | ☐ |
| 49 | secrets-rotation-and-key-management | 5 | ☐ |
| 50 | cron-and-worker-hardening | 5 | ☐ |
| 51 | seo-and-structured-data | 6 | ☐ |
| 52 | i18n-completeness | 6 | ☐ |
| 53 | analytics-and-funnels | 6 | ☐ |
| 54 | legal-compliance-and-consent | 6 | ☐ |
| 55 | pwa-and-offline | 6 | ☐ |
| 56 | notifications-and-email | 6 | ☐ |
| 57 | homepage-and-conversion | 6 | ☐ |
| 58 | docs-completeness | 6 | ☐ |
| 59 | pricing-and-packaging | 6 | ☐ |
| 60 | final-launch-checklist | 6 | ☐ |
