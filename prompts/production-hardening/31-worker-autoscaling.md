# 31 · Worker autoscaling & one-command deploy

> **Phase 5 — Observability & ops** · **Depends on:** 30 (queue) · **Parallel-safe:** yes · **Effort:** L

## Mission
~20 workers (model inference, texture, remesh, rembg, segment, stylize, avatar-pipeline-controller,
oracle, sniper, etc.) are each provisioned individually and deployed by hand (`gcloud builds submit`
per service). Single-instance services bottleneck under load, and the scattered deploy is error-prone.
Make the worker fleet autoscaling, observable, and deployable with one command.

## Context (read first)
- `CLAUDE.md`.
- `workers/` (each subdir is a service), `workers/README.md` (current scattered deploy), `scripts/deploy-sniper.mjs` (a one-service precedent).
- The job queue from prompt 30 (workers should scale on queue depth).
- Correlation/metrics from prompts 26/27 (workers must emit both).

## Build this
1. **Autoscaling** — configure each compute-heavy service (Cloud Run or equivalent) with min/max instances + concurrency tuned to its workload; scale on queue depth/CPU. Eliminate single-instance bottlenecks (avatar-pipeline-controller, texture, remesh, model-*).
2. **One-command deploy** — a `scripts/deploy-workers.mjs` (mirroring `deploy-sniper.mjs`) that builds + deploys all (or a named subset of) workers with consistent config, health checks, and version stamping. Document in `workers/README.md`.
3. **Worker health + observability** — every worker exposes a health endpoint and emits the structured logs + metrics (prompts 26/27): processed count, failures, latency, queue lag. Dead/stuck workers alert.
4. **Resource limits + cost guardrails** — per-service CPU/mem limits and max-instances caps so a runaway can't blow the budget; document expected cost envelope.
5. **Graceful failure** — a worker crash/restart must not lose in-flight jobs (queue redelivery from prompt 30); document the at-least-once semantics + idempotency expectation.

## Files likely in play
Per-service deploy config (Cloud Run YAML/Dockerfiles in `workers/*`), `scripts/deploy-workers.mjs` (new), `workers/README.md`, health/metrics wiring per worker, alert config.

## Definition of done
- [ ] Heavy workers autoscale on load; no single-instance bottlenecks remain.
- [ ] `scripts/deploy-workers.mjs` deploys all/subset with one command + health checks.
- [ ] Every worker emits health, logs, and metrics; stuck/dead workers alert.
- [ ] Resource caps + cost envelope documented.
- [ ] In-flight jobs survive worker restarts (idempotent redelivery).
- [ ] Changelog: internal/ops → **no** entry.

## Guardrails
Follow CLAUDE.md. Don't set max-instances so high it risks runaway cost — cap it. Verify autoscaling with the load suite (prompt 05). Push both remotes.
