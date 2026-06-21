# 28 · Deploy safety: auto-rollback + isolated staging

> **Phase 5 — Observability & ops** · **Depends on:** 26/27 (health signal) · **Parallel-safe:** yes · **Effort:** L

## Mission
Deploys are fragile: no automatic rollback on a bad ship, and **preview branches share the SAME
Postgres/Redis/x402 accounts as prod** — a feature branch can corrupt production data. Add an
isolated staging environment and a post-deploy health gate that auto-rolls-back a bad release.

## Context (read first)
- `CLAUDE.md` + the **`npx vercel build` overwrites `api/*.js`** trap (and `scripts/audit-deploy-artifacts.mjs`, `check-dist.mjs`, `build-vercel.mjs`).
- `vercel.json`, deploy scripts, `api/healthz.js`/`status.js`.
- Workers deploy is scattered (`gcloud builds submit` per service — see `workers/README.md`); coordinate with prompt 31.

## Build this
1. **Isolated preview/staging** — give non-prod deploys their own Postgres (separate DB/branch — Neon branching), Redis namespace, and x402 test config, so no preview can read/write prod data or move real funds. Wire env separation in `vercel.json`/project settings; document it.
2. **Post-deploy health gate** — after a prod deploy, poll `/api/healthz` (+ key synthetic from prompt 27) for ~5 min; if it doesn't reach healthy, **automatically `vercel rollback`** and alert. Script it (`scripts/post-deploy-verify.mjs`) and run it in the deploy pipeline.
3. **Artifact safety in CI** — enforce `audit:deploy` + a check that committed `api/*.js` are source (no `__defProp`/`createRequire` bundles) on every PR, so the bundling trap can never reach main.
4. **Rollback runbook** — document the exact manual rollback steps as a fallback, with who/when.
5. **Release notes hook** — on successful prod deploy, run `changelog:push` (already exists) so holders get updates automatically.

## Files likely in play
`vercel.json`, `scripts/post-deploy-verify.mjs` (new), `scripts/audit-deploy-artifacts.mjs` (CI wiring), deploy workflow, `docs/ops/deploy-runbook.md`, env/project config docs.

## Definition of done
- [ ] Preview/staging fully isolated from prod data + funds; verified.
- [ ] Post-deploy health gate auto-rolls-back on failure; tested with a deliberately-bad canary.
- [ ] CI blocks bundled `api/*.js` and runs `audit:deploy`.
- [ ] Rollback runbook committed.
- [ ] Successful deploy triggers changelog push.
- [ ] Changelog: internal/ops → **no** entry.

## Guardrails
Follow CLAUDE.md. Test rollback before relying on it. Never point a preview deploy at prod credentials. Push both remotes.
