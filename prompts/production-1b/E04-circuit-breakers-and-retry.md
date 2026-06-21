# E04 — Circuit breakers + adaptive retry for all external dependencies

> Phase E · Depends on: none (the memory note: a `cockatiel` resilience helper may already exist) · Parallel-safe: yes
> Run in a fresh chat in `/workspaces/three.ws`. Read [CLAUDE.md](../../CLAUDE.md) first.

## Mission
The platform depends on many external services (Solana RPC, Helius DAS, market-data APIs,
LLM providers, x402 facilitators). Failover exists for RPC and LLMs, but retries are fixed,
there's no circuit breaker, and a thundering herd on recovery can re-knock-over a dependency.
Standardize resilient calls so one flaky provider can't cascade.

## Where this lives (real files)
- `api/_lib/solana/rpc-fallback.js` — RPC failover (good model to generalize).
- `api/_lib/chat-models.js` + `api/_lib/provider-health.js` — LLM provider chain + cooldowns.
- `api/_lib/aggregator.js`, `api/_lib/balances.js`, `api/_lib/market/token-market.js` — market data fallback.
- `api/_lib/db-retry.js` — fixed [150,400]ms backoff.
- Check for an existing vetted resilience helper (e.g. `cockatiel`) before hand-rolling — prefer adopting it.

## Build this
1. **Shared resilience helper:** a single wrapper offering timeout + exponential backoff with jitter + circuit breaker (closed/open/half-open). Prefer wrapping a vetted library over hand-rolling. Additive — don't refactor working failover; apply to new/unprotected call sites first.
2. **Apply to high-value calls:** Helius DAS (high-credit, currently unprotected), market-data sources, x402 facilitator verify/settle, and any external fetch lacking a breaker.
3. **Adaptive retry:** replace fixed db-retry backoff with exponential + jitter; bound total retry budget per call so retries can't blow the function timeout.
4. **Breaker observability:** when a breaker opens, log it (E01) + reflect it in `degraded_features` (E03) and metrics (E02).
5. **No thundering herd:** half-open probes one request before fully closing; jitter spreads recovery.

## Out of scope
- Existing RPC/LLM failover internals — generalize the pattern around them, don't rewrite.

## Definition of done
- [ ] A shared, tested resilience wrapper (preferably library-backed) is applied to the previously-unprotected external calls (Helius DAS, market data, facilitators).
- [ ] db-retry uses exponential backoff + jitter with a bounded budget.
- [ ] Open breakers are logged + surfaced in degraded_features + metrics.
- [ ] `npx vitest run` green; changelog entry (infra); committed + pushed to both remotes.

## Verify
- Point a wrapped dependency at a failing URL → breaker opens, requests fail fast + degrade, then half-open recovers when it's back.
