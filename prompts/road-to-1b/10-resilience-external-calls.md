# 10 — Resilience on every external call

**Phase 2. [parallel-safe]** with 07–09, 11.

## Where you are

`/workspaces/three.ws` — three.ws, 3D AI-agent platform. It depends on external
services that WILL fail intermittently: Solana RPC, pump.fun feed, OpenAI/
Anthropic via worker proxies, x402 facilitators, R2/storage, Telegram. Read
[CLAUDE.md](../../CLAUDE.md). Your memory notes a `cockatiel` resilience helper
and a preference for vetted OSS over hand-rolling. The only coin is **$THREE**.

## Objective

Every outbound network call has a timeout, bounded retries with backoff+jitter
for transient failures, and a circuit breaker or graceful degradation so one
slow dependency can't cascade into an outage. Solana RPC and pump.fun especially
get multi-endpoint failover.

## Why it matters

Public RPCs rate-limit and flake constantly; pump.fun and LLM providers have
incidents. Without timeouts and breakers, a single hung upstream call exhausts
function concurrency and takes the whole platform down. Resilience is what lets a
$1B platform claim real uptime on top of unreliable dependencies.

## Instructions

1. **Find every outbound call:**
   ```bash
   grep -rIn "fetch(\|axios\|new Connection(\|getAccountInfo\|sendTransaction\|https.request\|undici" --include=*.js src/ api/ workers/ | grep -v node_modules
   ```
   Classify by dependency (RPC, pump, LLM, x402, storage, misc).
2. **Adopt one shared resilience helper** (reuse the existing `cockatiel`-based
   helper if present — check the codebase and the
   [prefer-vetted-oss-additive] memory; otherwise wrap `cockatiel`). Expose:
   `retry(policy)`, `timeout(ms)`, `circuitBreaker(opts)`, composed into a
   `resilientFetch()` / `withResilience(fn)`. Do not hand-roll bespoke retry
   loops per file.
3. **Timeouts everywhere.** No `fetch` without an `AbortController` + timeout.
   Pick sane per-dependency budgets (RPC ~8s, LLM longer, feeds ~5s).
4. **Retries only for transient errors** (network, 429, 5xx, RPC node errors) —
   never for 4xx/validation. Exponential backoff + jitter. Respect `Retry-After`.
5. **Solana RPC failover.** There is prior art ("resilient Solana RPC" in recent
   commits) — extend it: a prioritized pool of RPC endpoints with health-aware
   rotation, so a dead/throttled node is skipped. Same idea for any multi-
   provider dependency.
6. **Circuit breakers + degradation.** When a dependency is failing, open the
   breaker and serve a degraded-but-honest response (cached data with a
   "stale" marker, or a designed error state — coordinate with
   [18 — state design](18-state-design-sweep.md)). Never hang.
7. **Idempotency for retried writes.** Any retried mutation/payment must carry an
   idempotency key so a retry can't double-execute (cross-check
   [08 — API hardening](08-api-hardening.md)).
8. **Tests.** Use the existing resilience test patterns (e.g.
   `tests/api/pump-trending-resilience.test.js`) to add coverage: timeout fires,
   retry recovers on second attempt, breaker opens after N failures, failover
   picks the next endpoint.

## Definition of done

- [ ] Zero `fetch`/RPC call without a timeout in `src/ api/ workers/`.
- [ ] One shared resilience helper used across all outbound calls (no per-file
      hand-rolled retry loops).
- [ ] Retries are transient-only with backoff+jitter; 4xx never retried.
- [ ] Solana RPC (and other multi-provider deps) have health-aware failover.
- [ ] Circuit breakers degrade gracefully to cached/honest states, never hang.
- [ ] Retried writes are idempotent.
- [ ] Resilience tests added and passing (`npm test`).
- [ ] Changelog: `improvement`/`infra` entry if users see fewer transient errors
      (e.g. "More resilient data loading during network hiccups").
