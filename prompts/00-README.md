# three.ws — Road to Production / $1B

A phased catalog of self-contained work prompts. Each numbered `.md` file is designed to be
pasted into a **fresh chat** and executed end-to-end by a senior agent with no prior context.
Run them roughly in order; many within a phase can run in parallel (separate chats), but
**stage explicit paths only** since agents share one worktree.

## How to use
1. Open a new chat in this repo.
2. Paste the full contents of one prompt file (`01`…`50`).
3. Let the agent execute, verify, and report. Review the diff.
4. Commit + push when satisfied (`git push threeD main && git push threews main`).
5. Move to the next prompt.

## Phases
- **Phase 1 — Audit & baseline** (`01`–`05`): find every gap before fixing. Run first; they produce
  the issue lists later phases consume.
- **Phase 2 — Cross-cutting quality** (`06`–`14`): tests, errors, a11y, responsive, perf, SEO, design, security.
- **Phase 3 — Product surfaces** (`15`–`26`): harden each surface end-to-end.
- **Phase 4 — Payments / on-chain / agent economy** (`27`–`34`).
- **Phase 5 — Infra & ops** (`35`–`41`).
- **Phase 6 — Growth, GTM & launch** (`42`–`50`). `50` is the final go/no-go gate.

## Recommended order
Phase 1 first. Then Phase 2 in parallel with Phase 3. Phase 4–5 once core surfaces are stable.
Phase 6 last, ending on `50-final-launch-checklist.md`.

## Global operating rules (every prompt repeats these — non-negotiable)
- Read `CLAUDE.md` and `STRUCTURE.md` first; CLAUDE.md overrides defaults.
- **No mocks / fake data / placeholders / TODOs / stubs.** Real APIs and implementations only.
- **$THREE is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Never reference any other token, anywhere.
- Concurrent agents share this worktree — stage explicit paths (never `git add -A`); re-check `git status`/`git diff --staged` before committing.
- esbuild trap: never commit `api/*.js` starting with `__defProp`/`createRequire`; recover with `git restore -- api/ public/`.
- Every user-visible change → `data/changelog.json` entry + `npm run build:pages`.
- Push to BOTH remotes when asked; never pull/fetch/merge from `threeD`.
- Definition of done = CLAUDE.md's checklist.

## Index
| # | Prompt | Phase |
|---|---|---|
| 01 | production-readiness-audit | 1 |
| 02 | dead-paths-and-broken-links | 1 |
| 03 | console-errors-warnings-sweep | 1 |
| 04 | build-deploy-artifact-integrity | 1 |
| 05 | routing-and-404-audit | 1 |
| 06 | test-coverage-unit | 2 |
| 07 | e2e-critical-flows | 2 |
| 08 | error-handling-failsafes | 2 |
| 09 | accessibility-audit | 2 |
| 10 | responsive-mobile-audit | 2 |
| 11 | performance-web-vitals | 2 |
| 12 | seo-metadata | 2 |
| 13 | design-system-consistency | 2 |
| 14 | security-review | 2 |
| 15 | forge-pipeline | 3 |
| 16 | walk-sdk-companion-playground | 3 |
| 17 | avatar-create-edit-rig | 3 |
| 18 | agent-studio | 3 |
| 19 | marketplace | 3 |
| 20 | gallery-discovery | 3 |
| 21 | social-club-city | 3 |
| 22 | onboarding-wizard | 3 |
| 23 | feature-tour | 3 |
| 24 | scene-studio | 3 |
| 25 | search | 3 |
| 26 | dashboard | 3 |
| 27 | x402-payments | 4 |
| 28 | wallet-connect-funding | 4 |
| 29 | pumpfun-launches | 4 |
| 30 | three-holder-gating | 4 |
| 31 | mcp-servers | 4 |
| 32 | published-sdks-docs | 4 |
| 33 | onchain-contracts | 4 |
| 34 | solana-base-parity | 4 |
| 35 | api-rate-limiting-abuse | 5 |
| 36 | observability-logging-alerting | 5 |
| 37 | ci-cd-gates | 5 |
| 38 | database-migrations | 5 |
| 39 | load-stress-testing | 5 |
| 40 | caching-cdn-assets | 5 |
| 41 | uptime-health-status | 5 |
| 42 | homepage-conversion | 6 |
| 43 | docs-completeness | 6 |
| 44 | legal-compliance | 6 |
| 45 | analytics-funnels | 6 |
| 46 | notifications-email | 6 |
| 47 | i18n-completeness | 6 |
| 48 | pricing-monetization | 6 |
| 49 | pwa-extension | 6 |
| 50 | final-launch-checklist | 6 |
