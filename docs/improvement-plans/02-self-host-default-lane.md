# Task: Make our own GPU model lanes the resilient default

You are a senior infra+ML engineer on three.ws. Follow `CLAUDE.md` (auto-loaded).
Non-negotiables: $THREE is the only coin; no mocks/placeholders; real APIs/endpoints
only; design every state; add tests; changelog for user-visible changes; don't break
the architecture.

## Why this matters

We run open 3D models (TRELLIS, Hunyuan3D, TripoSG) on our **own** GCP workers, and
we have substantial GCP credits. Every generation that routes to a third-party
vendor (Meshy/Tripo/Rodin/Replicate) is either our cost or a BYOK dependency we
don't control. The win: make our self-hosted lanes the reliable default for every
path and tier, with health-aware fallback, so the platform never pays a vendor per
call and never dead-ends when a free lane hiccups. This is the single
highest-leverage cost+reliability change available.

## What exists today — read these first

- Backend registry + routing: [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js).
  Note the self-host lanes: `trellis_selfhost` (`MODEL_TRELLIS_URL`), `hunyuan3d`
  (`GCP_HUNYUAN3D_URL`), `triposg` (`GCP_TRIPOSG_URL`), all `provider: 'gcp'`,
  `free: true`. Routing logic: `resolveBackendId`, `defaultBackendFor`,
  `freeLaneUsable`, `FREE_DEFAULT_FOR_TIERS`, `FREE_FALLBACK_FOR_PATH`,
  `preferFreeReconstruct()`.
- Provider clients: [api/_providers/](../../api/_providers) (`gcp` self-host client).
- Workers: [workers/](../../workers) (e.g. `workers/model-trellis`, `workers/remesh`).
- Context: the A100 workbench is currently **stopped**; three.ws app runs on Cloud Run.

## Goal

Self-hosted lanes serve every path/tier by default and degrade gracefully. No
generation should ever silently route to a paid vendor when a free lane can serve
it, and a single worker being cold/down should never fail a request that another
lane could satisfy.

## Scope

1. **Health-aware routing.** Add a lightweight liveness/warmth check for each
   self-host worker (cheap GET/HEAD or a cached probe). `defaultBackendFor` should
   prefer a *healthy* self-host lane, then another healthy free lane, and only then
   the standing paid default. Cache health briefly to avoid per-request latency.
2. **Failover chain.** If the chosen self-host worker errors or times out at submit,
   transparently retry the next configured free lane for that path before surfacing
   an error. Log which lane served the request (already partly surfaced as `backend`).
3. **Cold-start UX.** When a worker is cold, reflect that honestly in the ETA/queue
   state (real, not a fake timer). No fabricated progress.
4. **Cost observability.** Surface, in an internal/admin-visible way, how many
   generations served on free vs paid lanes (a counter/log is fine — no new heavy
   infra). This proves the vendor-cost reduction.
5. **Deploy doc.** Write/extend a short runbook in `docs/` describing the GCP workers,
   their env vars, how to (re)start the GPU worker, and how routing picks a lane.
   Keep it factual to what's configured.

## Guardrails

- Keep BYOK vendor lanes (Meshy/Tripo/Rodin) **explicitly selectable** — only remove
  them from the *default* path, never from the catalog.
- Don't change tier polycounts/prices. This is routing + reliability, not pricing.
- Env-gate everything: a deployment missing a worker URL must degrade cleanly, exactly
  as `backendIsConfigured` already enforces.
- No secrets in logs or the catalog.

## Definition of done

- [ ] Routing prefers healthy self-host → other free → paid default, proven by tests.
- [ ] Submit-time failover retries the next free lane before erroring.
- [ ] Cold-start reflected honestly in state; no fake progress.
- [ ] Free-vs-paid serve counts observable.
- [ ] `docs/` runbook added/updated for the GCP worker lanes.
- [ ] `npm test` green; new unit tests cover health routing + failover selection.
- [ ] Changelog entry if users see any behavior change (e.g. faster/again-free High tier).
