# Production-Hardening Program — Prompt Library

A **sequenced set of execution prompts** that take three.ws from "impressive platform" to
"ship-grade, scalable, trustworthy $1B platform." Each file is a complete brief meant to be
pasted into a **fresh Claude Code chat in this repo**, run to completion, reviewed, and shipped.

Every prompt is grounded in a real audit of this codebase (100 API endpoints, 125 pages,
456+ tests, ~20 workers, a dozen published SDKs/MCP servers). The file paths cited inside each
prompt are real starting points.

> **Scope of this library:** *hardening, reliability, security, scale, trust, and developer
> experience* — the work that turns a great product into a bankable platform. For **new feature
> ideas**, see the sibling directories (`prompts/monetization`, `prompts/agent-wallets`,
> `prompts/moonshots`, `prompts/road-to-1b`, …). This set is deliberately complementary, not a
> replacement.

---

## How to run each prompt

1. Open a **new chat** in this repo. (CLAUDE.md auto-loads, so the operating rules already apply.)
2. Paste the **entire** prompt file as your first message.
3. Let it finish, review `git diff`, then commit and push **both** remotes (`threeD` + `threews`).
4. Tick the box below and move on.

One prompt ≈ one focused PR. Where a prompt is marked **Parallel-safe**, you can run it in its own
chat alongside others in the same phase. Concurrent agents share this worktree, so every prompt
already instructs: stage explicit paths, never `git add -A`, re-check `git status` before committing.

---

## Guardrails every prompt inherits (from CLAUDE.md)

- **$THREE is the only coin** — `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never reference any other token, anywhere.
- **No mocks / fake data / placeholders / TODOs / stubs.** Finished, real implementations only.
- **Push BOTH remotes.** Never pull or fetch from `threeD`.
- **Changelog** every user-visible change in `data/changelog.json`, then `npm run build:pages`.
- **Watch the deploy trap**: `npx vercel build` overwrites `api/*.js` with esbuild bundles — never commit those.

---

## The program (tracker)

### Phase 0 — Test confidence & release gate *(do first — everything depends on it)*
- [ ] [01 · Expand the deploy release gate + harden CI](01-release-gate-and-ci.md)
- [ ] [02 · Test the money path (x402, settlement, payments)](02-tests-payments-x402.md)
- [ ] [03 · Test the product core (forge, avatar, auto-rig)](03-tests-forge-avatar.md)
- [ ] [04 · E2E coverage for critical user journeys](04-e2e-critical-flows.md)
- [ ] [05 · Load, chaos, a11y & visual-regression test infra](05-test-infra-load-chaos-a11y.md)

### Phase 1 — Reliability & error handling
- [ ] [06 · Eliminate silent failures (empty catch / fire-and-forget)](06-error-handling-sweep.md)
- [ ] [07 · Fetch `.ok` guards + universal input validation](07-fetch-guards-input-validation.md)
- [ ] [08 · Unify circuit breakers on cockatiel](08-circuit-breakers-cockatiel.md)
- [ ] [09 · Graceful degradation for auth & payments](09-graceful-degradation.md)

### Phase 2 — Money safety *(highest blast radius)*
- [ ] [10 · Settlement↔delivery atomicity + refund path](10-settlement-delivery-refund.md)
- [ ] [11 · Idempotency for external x402 flows](11-x402-external-idempotency.md)
- [ ] [12 · Enforce agent spend policy (no silent platform-wallet fallback)](12-agent-spend-policy.md)
- [ ] [13 · $THREE gating: fail-closed + tier caching](13-three-gate-fail-closed.md)
- [ ] [14 · Payment reconciliation ledger + ops alerts](14-payment-reconciliation.md)

### Phase 3 — Security hardening
- [ ] [15 · Remediate vulnerable dependencies (axios et al.)](15-dependency-vuln-remediation.md)
- [ ] [16 · Startup secret validation + key-rotation safety](16-secrets-startup-validation.md)
- [ ] [17 · Rate-limit coverage audit across all endpoints](17-rate-limit-coverage.md)
- [ ] [18 · Global CSP + security headers](18-csp-security-headers.md)
- [ ] [19 · Pre-launch security review & pentest prep](19-security-review-pentest.md)

### Phase 4 — Frontend excellence
- [ ] [20 · Unify every list/feed on the shared state-kit](20-state-kit-unification.md)
- [ ] [21 · WCAG 2.2 AA accessibility pass](21-accessibility-wcag.md)
- [ ] [22 · Performance: code-split, lazy 3D, Lighthouse ≥90](22-performance-code-split.md)
- [ ] [23 · Responsive at 320 / 768 / 1440 across all surfaces](23-responsive-audit.md)
- [ ] [24 · Dead-path & broken-link CI gate](24-dead-path-link-gate.md)
- [ ] [25 · Server-side Forge thumbnails](25-forge-server-thumbnails.md)

### Phase 5 — Observability & operations
- [ ] [26 · Structured logging + request correlation/tracing](26-logging-tracing.md)
- [ ] [27 · Metrics, dashboards & SLOs](27-metrics-dashboards-slos.md)
- [ ] [28 · Deploy safety: auto-rollback + isolated staging](28-deploy-safety-rollback.md)
- [ ] [29 · Data backup/DR runbook + migration gating](29-backup-dr-migrations.md)
- [ ] [30 · Async job queue for heavy generation](30-async-job-queue.md)
- [ ] [31 · Worker autoscaling & one-command deploy](31-worker-autoscaling.md)

### Phase 6 — Developer ecosystem (SDK / MCP)
- [ ] [32 · Per-package CHANGELOGs + SDK unit tests](32-sdk-changelogs-tests.md)
- [ ] [33 · Unify the publish pipeline](33-publish-pipeline.md)
- [ ] [34 · Generated API-reference docs site](34-api-reference-docs.md)
- [ ] [35 · "Build on three.ws with MCP + x402" integration guide](35-mcp-x402-integration-guide.md)
- [ ] [36 · CI that proves the examples still work](36-examples-ci.md)

### Phase 7 — Growth, trust & launch
- [ ] [37 · SEO, structured data & agent-discovery surfaces](37-seo-discovery.md)
- [ ] [38 · First-run onboarding + product docs](38-onboarding-docs.md)
- [ ] [39 · Legal, trust & compliance surfaces](39-legal-trust-compliance.md)
- [ ] [40 · Public status page + incident runbooks](40-status-incident-runbooks.md)
- [ ] [41 · Final polish pass + launch-readiness checklist](41-launch-readiness.md)

---

## Sequencing

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 ┐
                                       ├─► Phase 7 (launch)
Phase 4 ───────────────────────────────┤
Phase 5 ───────────────────────────────┤
Phase 6 ───────────────────────────────┘
```

Phases 0–3 are the critical chain — a payment bug or a silent failure is existential. Once Phase 0
gives you a trustworthy gate, Phases 4/5/6 run as parallel tracks. Phase 7 is the final mile.

**Whole-program done:** every box ticked · `npm run test:all` green · clean `audit:web` / `audit:links`
/ `check:images` · Lighthouse ≥90 on the top 10 pages · zero criticals in the security review ·
dashboards live · a rehearsed, tested rollback.
