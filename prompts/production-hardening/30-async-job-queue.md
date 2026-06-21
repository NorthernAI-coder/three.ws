# 30 · Async job queue for heavy generation

> **Phase 5 — Observability & ops** · **Depends on:** 26 (correlation) · **Parallel-safe:** yes · **Effort:** L

## Mission
Forge generation runs **synchronously** in the request path with a 300s `maxDuration`. A traffic spike
monopolizes 300-second serverless slots, burns cost, and risks timeouts — it won't scale to platform
volume. Move heavy generation to an async job queue: enqueue and return immediately, process on
workers, deliver via polling/stream. Make generation elastic and observable.

## Context (read first)
- `CLAUDE.md`.
- `vercel.json` forge `maxDuration` (~300s), `api/forge*.js`, the `workers/` model fleet (trellis/hunyuan3d/triposg/etc.).
- Queue infra already in deps: `@upstash/qstash` (and Redis). Prefer it over adding a new broker.
- Forge store (`api/_lib/forge-store.js`) already tracks creation status (`done`, `glb_url`) — extend with queued/processing/failed.

## Build this
1. **Enqueue endpoint** — `POST /api/forge` (or a new `/api/forge/jobs`) validates + bills/authorizes, creates a creation row in `queued`, enqueues a QStash job, and returns **202** with `{ job_id }` immediately. No synchronous GLB work in the request.
2. **Worker processing** — a worker consumes the queue, runs the engine chain (with the resilience policies from prompt 08), updates status (`processing`→`done`/`failed`), stores the GLB + server-side thumbnail (prompt 25), and records metrics.
3. **Status + delivery** — `GET /api/forge/jobs/:id` returns status/progress and the result when ready; optionally an SSE/stream for live progress. Update the client to enqueue → poll/stream → render (real progress, **not** a fake progress bar — CLAUDE.md forbids that).
4. **Failure + refund** — a failed job surfaces a real error and, if it was paid, triggers the refund path (prompt 10). Retries are bounded and idempotent.
5. **Backpressure** — queue depth metric + alert (prompt 27); a sane max in-flight per user/agent so one actor can't starve the queue.

## Files likely in play
`api/forge.js` → enqueue, `api/forge/jobs/[id].js` (new), a forge worker consumer, `api/_lib/forge-store.js` (status states), the forge client module, metrics + alerts, tests.

## Definition of done
- [ ] Forge requests enqueue + return 202 instantly; no synchronous 300s generation in the request path.
- [ ] Worker processes jobs, updates status, stores GLB + thumbnail, records metrics.
- [ ] Client shows **real** progress (poll/stream), then the result; failures show real errors.
- [ ] Paid job failure → refund (prompt 10); retries bounded + idempotent.
- [ ] Queue-depth metric + backpressure cap + alert.
- [ ] Tests cover enqueue, process, deliver, fail+refund.
- [ ] Changelog: **improvement** entry ("Forge generation is now queued — faster, more reliable under load").

## Guardrails
Follow CLAUDE.md. No fake progress/`setTimeout` loaders — real job status only. Keep the free-lane UX snappy. Push both remotes.
