# 16 — CI/CD hardening

**Phase 4. Serial** (changes pipeline config).

## Where you are

`/workspaces/three.ws` — three.ws, deployed via Vercel; mirrors to two GitHub
remotes (`threeD` push-only, `threews` canonical). Currently **one** workflow:
`.github/workflows/ci.yml`. Rich script surface already exists (`audit:*`,
`smoke:*`, `verify:*`, `test`, `lint`, `typecheck`). Read
[CLAUDE.md](../../CLAUDE.md). The only coin is **$THREE**.

## Objective

A CI/CD pipeline that makes broken code impossible to merge and gives every PR a
previewable, verified deploy: lint + typecheck + unit + E2E + the repo's own
audits run as required gates, secrets scanning runs on every push, preview
deploys are smoke-tested, and production deploys are reproducible and reversible.

## Why it matters

A single CI workflow on a 769-endpoint, money-moving platform is under-defended.
Investors and partners judge engineering maturity by how hard it is to ship a
regression. Preview deploys + gates are how a team scales contribution without
scaling breakage.

## Instructions

1. **Read the current pipeline.** Open `.github/workflows/ci.yml`; list what runs
   and what's missing. Map the available scripts (from `package.json`) to gates:
   `lint`, `typecheck`, `test`, `audit:pages`, `audit:handlers`, `check:images`,
   `audit:web`, `audit:mcp`, `smoke:onchain:ci`, `verify:solana`,
   `validate:cards`, `audit:deploy`, `check:dist`.
2. **Required PR gates** (fail the merge):
   - Install + build (`npm ci` honoring the workspaces lockfile).
   - `lint`, `typecheck`, `format:check`.
   - `vitest run --coverage` with the threshold from [15](15-test-coverage.md).
   - `playwright test` (sharded if slow) for E2E.
   - The repo auditors above that are CI-safe.
   - Coin-compliance guard test from [06](06-three-coin-compliance-sweep.md).
3. **Secrets scanning.** Add a job (gitleaks/trufflehog) that fails on any
   committed secret, plus `npm audit --omit=dev` (or dependency-review) for CVEs.
   Aligns with [07](07-secrets-and-env-hardening.md) /
   [09](09-security-review.md).
4. **Preview deploys.** Every PR gets a Vercel preview; run a small smoke suite
   against the preview URL (health endpoint, a key page renders, an API responds).
   Block merge if the preview smoke fails.
5. **Caching & speed.** Cache `node_modules`/Vite/Playwright browsers so CI is
   fast. Shard or parallelize the slow jobs. Keep total PR feedback under a few
   minutes where possible.
6. **Production deploy safety.** Document/codify the deploy: `build:all` →
   `check:dist` → deploy, with `audit:deploy` guarding artifacts (note the
   CLAUDE.md trap: `npx vercel build` can overwrite `api/*.js` with bundles —
   guard against committing those). Ensure rollback is one step and documented.
7. **Branch protection.** Document the required-checks + review settings on
   `threews` (canonical). Note the mirror rule: pushes go to BOTH remotes; never
   pull/fetch from `threeD`.
8. **Concurrency.** Cancel superseded runs per-branch to save minutes.

## Definition of done

- [ ] PR pipeline runs install+build, lint, typecheck, format check, unit+
      coverage-gate, E2E, the CI-safe repo auditors, and the coin-compliance
      guard — all required to merge.
- [ ] Secrets-scanning + dependency-CVE jobs run on every push and fail on
      findings.
- [ ] Every PR gets a preview deploy that is smoke-tested; failure blocks merge.
- [ ] CI caches deps/browsers and cancels superseded runs; feedback is fast.
- [ ] Production deploy + one-step rollback documented in `docs/` (with the
      `vercel build` bundle-overwrite guard noted).
- [ ] Branch protection + dual-remote push rules documented.
- [ ] A test PR demonstrates the gates catching a deliberately broken change.
- [ ] Changelog: skip (internal infra).
