# 08 · Unify circuit breakers on cockatiel

> **Phase 1 — Reliability** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
`cockatiel` is already a dependency (and a saved team preference — see memory "Prefer vetted OSS,
additive"), yet each subsystem reinvents its own ad-hoc cooldown/breaker logic (`api/feed-stream.js`
`breakerUntil` + 5-min cooldown, forge's own breaker, `solana/connection.js` per-provider cooldown).
Consolidate on a shared cockatiel-based resilience layer so external-dependency failures are handled
consistently and one flaky provider can't take down unrelated features.

## Context (read first)
- `CLAUDE.md`; memory note: adopt vetted OSS, **additive** — wrap new/unprotected call sites, don't rip out working code mid-flight.
- `cockatiel` docs (retry, circuit breaker, timeout, bulkhead, fallback policies).
- Existing ad-hoc breakers: `api/feed-stream.js`, the forge generation breaker, `api/_lib/solana/connection.js` (well-implemented failover — wrap, don't break it).

## Build this
1. **A shared resilience module** — `api/_lib/resilience.js` exposing named policies built on cockatiel: e.g. `rpcPolicy`, `facilitatorPolicy`, `upstreamApiPolicy`, each a composed retry + timeout + circuit-breaker (+ fallback) tuned per dependency class. Include a small in-memory breaker-state registry so health is inspectable.
2. **Adopt additively** — route currently-unprotected external calls (per prompt 07's `fetchJson`, LLM proxies, image fetches, facilitator calls) through the appropriate policy. Migrate the ad-hoc breakers to the shared one **only where it's a clean swap**; leave the solid `solana/connection.js` failover intact but expose its breaker state to the registry.
3. **Surface breaker state** — a tiny read path (used later by the status page, prompt 40) listing each breaker's open/half-open/closed state and last error.
4. **Tests** — cover open→half-open→closed transitions and fallback behavior (pairs with the chaos suite, prompt 05).

## Files likely in play
`api/_lib/resilience.js` (new), `api/feed-stream.js`, forge generation path, LLM/image proxy call sites, `api/_lib/x402-spec.js` (facilitator calls), `api/_lib/solana/connection.js` (registry hook), tests.

## Definition of done
- [ ] One shared cockatiel-based policy module; named policies per dependency class.
- [ ] Previously-unprotected external calls now wrapped; no behavior regressions.
- [ ] Breaker states inspectable via a single read path.
- [ ] Tests cover breaker transitions + fallbacks; chaos suite (05) exercises them.
- [ ] Changelog: internal reliability → **no** entry.

## Guardrails
Follow CLAUDE.md and the "additive" preference — don't refactor working failover into a regression. Keep timeouts conservative so you don't add latency to hot paths. Push both remotes.
