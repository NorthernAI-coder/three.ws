# E03 — Health/readiness endpoint + dependency checks + public status page

> Phase E · Depends on: E01 · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
There's no single endpoint that says "is the platform healthy?" and no public status page.
A health endpoint enables fast detection + uptime monitoring; a public status page builds
the trust a financial platform needs. Build both.

## Where this lives (real files)
- `api/_lib/forge-health.js` — aggregates generation/limiter/LLM/Redis/world signals.
- `api/cron/uptime-check.js`, `api/cron/world-health.js` — existing checks.
- `api/_lib/db.js`, `api/_lib/redis.js`, `api/_lib/solana/connection.js` — dependencies to probe.

## Build this
1. **Liveness:** `GET /api/health` returns 200 fast with a basic "process up" + cheap DB/cache ping.
2. **Readiness:** `GET /api/health?deep=1` (auth/limited) checks real dependencies — DB, Redis (+ quota headroom), Solana RPC (failover state), LLM providers, x402 facilitators, generation workers — and returns per-dependency status + the overall verdict.
3. **Degraded signal:** surface a `degraded_features` list (e.g. "buyback paused", "Redis fail-open") that the client (`/api/config`) can read to soften the UI instead of erroring.
4. **Public status page:** a polished page rendering current + recent uptime per major subsystem (generation, payments, RPC, worlds), backed by the readiness data and uptime crons. Designed states; mobile.
5. **Uptime hooks:** make the health endpoint consumable by an external uptime monitor.

## Out of scope
- Alerting (**E02**) — link health into it.

## Definition of done
- [ ] `/api/health` (liveness) + deep readiness with per-dependency status exist and are accurate.
- [ ] `degraded_features` surfaced and consumed by the client to degrade gracefully.
- [ ] Public status page live, reachable from the footer, with real subsystem status + history.
- [ ] `npx vitest run` green; `npm run build:pages` passes; changelog entry; committed + pushed to both remotes.

## Verify
- Take a dependency down locally (e.g. bad Redis URL) → readiness flags it + `degraded_features` populates + status page reflects it.
