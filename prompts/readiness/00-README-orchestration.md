# Production-Readiness Program — Road to $1B

> A concurrent agent may also be authoring a parallel track in
> [`../road-to-1b/`](../road-to-1b/). The two overlap and complement each other —
> that one leans into per-surface end-to-end prompts (forge, marketplace,
> scene-studio, wallet/x402, pumpfun, mcp, sdk-publishing, load-testing); this one
> leans into cross-cutting hardening + the audit/launch/incident spine. Pick one
> track, or merge them once both are finished. This file documents **this**
> directory only.

This directory is a **sequenced program of self-contained prompts**. Each `.md`
file is a complete task brief you paste into a **fresh agent chat** at
`/workspaces/three.ws`. Run them in order within a phase; phases mostly gate on
the one before. Every prompt is written to be run with zero prior context — it
restates where it is, what the codebase is, and which rules apply.

## The thesis

A platform reaches a billion-dollar valuation on three things this program
drives toward:

1. **It works, completely.** No dead buttons, no half-wired flows, no fake data,
   no TODOs shipped to users. (Phase 1)
2. **It never goes down and never leaks.** Hardened APIs, resilient external
   calls, real observability, a real security posture. (Phase 2–3)
3. **People can't stop using it and telling others.** Fast, polished, accessible,
   shareable, monetized, instrumented. (Phase 4–6)

We do not get there with "good enough." Read [CLAUDE.md](../../CLAUDE.md) before
every task — it is the operating contract. The relevant non-negotiables:

- No mocks, no fake data, no placeholders, no TODO comments, no stubs.
- The only coin is **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`).
- Every user-visible change gets a `data/changelog.json` entry.
- Stage explicit paths only (concurrent agents share this worktree). Never
  `git add -A`. Re-check `git status` before committing.
- Push to **both** remotes (`threeD`, `threews`) when asked to push. Never pull
  from `threeD`.

## How to run

1. Open a new chat in this repo.
2. Paste the entire contents of one prompt file.
3. Let the agent finish, verify its Definition of Done, then move to the next.
4. Prompts marked **[parallel-safe]** can run simultaneously in separate chats
   (they touch disjoint surfaces). Prompts marked **[serial]** must run alone.

## The baseline (measured 2026-06-21, will change as you work)

These are the concrete gaps this program closes. Re-run the discovery commands
inside each prompt to get the live number — do not trust this snapshot.

| Signal | Count | Closed by |
|---|---|---|
| TODO / FIXME / placeholder / "coming soon" markers in `src/ public/ api/` | 652 | [02](02-eliminate-todos-and-stubs.md) |
| Empty `catch {}` blocks | 126 | [03](03-harden-error-boundaries.md) |
| Mock / sample / fake-data arrays | 23 | [04](04-purge-mock-and-fake-data.md) |
| API functions (each needs authz + validation + rate limiting reviewed) | 769 | [08](08-api-hardening.md) |
| Env keys (secrets surface) | 275 | [07](07-secrets-and-env-hardening.md) |
| CI workflows | 1 | [16](16-ci-cd-hardening.md) |

Discovery, anytime:

```bash
grep -rIn "TODO\|FIXME\|not implemented\|implement later\|placeholder\|coming soon\|XXX:" --include=*.js src/ public/ api/ | grep -v node_modules | wc -l
grep -rIn "catch[^)]*) *{ *}" --include=*.js src/ public/ api/ | grep -v node_modules | wc -l
```

## Phases

**Phase 1 — Correctness & hygiene (no shortcuts ship).** Serialize 02→06; they
edit broadly and you want clean diffs between them.
- [01 — Production audit & scorecard](01-production-audit-scorecard.md) **[serial, run first]**
- [02 — Eliminate every TODO / stub / placeholder](02-eliminate-todos-and-stubs.md)
- [03 — Harden every error boundary (kill empty catches)](03-harden-error-boundaries.md)
- [04 — Purge all mock / sample / fake data](04-purge-mock-and-fake-data.md)
- [05 — Dead-path & handler audit (every button works)](05-dead-path-and-handler-audit.md)
- [06 — $THREE coin-compliance sweep](06-three-coin-compliance-sweep.md)

**Phase 2 — Reliability & security (institutional grade).** [parallel-safe]
across 07–11 once Phase 1 is clean.
- [07 — Secrets & env hardening](07-secrets-and-env-hardening.md)
- [08 — API hardening: authz, validation, rate limiting](08-api-hardening.md)
- [09 — Security review: payments, wallets, contracts](09-security-review.md)
- [10 — Resilience on every external call](10-resilience-external-calls.md)
- [11 — Observability: logging, monitoring, alerting](11-observability.md)

**Phase 3 — Performance & scale.** [parallel-safe]
- [12 — Frontend performance & Core Web Vitals](12-frontend-performance.md)
- [13 — 3D asset performance](13-3d-asset-performance.md)
- [14 — Backend caching & data layer](14-backend-caching.md)

**Phase 4 — Quality & testing.**
- [15 — Test coverage to the bar](15-test-coverage.md) **[serial]**
- [16 — CI/CD hardening](16-ci-cd-hardening.md) **[serial]**
- [17 — Accessibility audit (WCAG 2.2 AA)](17-accessibility-audit.md) **[parallel-safe]**

**Phase 5 — UX polish & completeness.** [parallel-safe]
- [18 — Every state designed (loading/empty/error/overflow)](18-state-design-sweep.md)
- [19 — Responsive / mobile sweep](19-responsive-mobile-sweep.md)
- [20 — Design-system & token consistency](20-design-system-consistency.md)
- [21 — Onboarding & first-run experience](21-onboarding-first-run.md)

**Phase 6 — Growth, monetization & the $1B narrative.**
- [22 — SEO & shareability](22-seo-and-shareability.md) **[parallel-safe]**
- [23 — Growth & virality loops](23-growth-virality.md) **[parallel-safe]**
- [24 — Monetization completeness](24-monetization-completeness.md) **[parallel-safe]**
- [25 — Analytics & funnel instrumentation](25-analytics-funnel.md) **[parallel-safe]**
- [26 — Trust surfaces: status, docs, security, pricing](26-trust-surfaces.md) **[parallel-safe]**

**Phase 7 — Launch.**
- [27 — Go-live runbook & pre-launch checklist](27-launch-runbook.md) **[serial, run last]**
- [28 — Incident response & on-call](28-incident-response-oncall.md) **[serial]**

## Done means done

A prompt is complete only when its own Definition-of-Done checklist is fully
true and verified — not when the code is written. If an agent can't verify a
step, it must say so explicitly. Same rule as [CLAUDE.md](../../CLAUDE.md): you
would be proud to demo every result to a room of senior engineers.
