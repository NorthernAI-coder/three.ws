# 09 — Resilience of external calls

> **Road to $1B · Production-Readiness track.** Paste this whole file into a fresh chat at `/workspaces/three.ws`. Read `CLAUDE.md` + `STRUCTURE.md` first — they override defaults.

**Phase:** 2 · Cross-cutting hardening
**Owns:** every outbound call to a third party (Solana/EVM RPC, pump.fun, OpenAI/Anthropic proxies, NVIDIA NIM/Meshy/Tripo, Upstash, Neon, R2).
**Depends on:** `06`. **Pairs with:** `10` (observability), `47` (status).

## Why this matters for $1B
The platform's uptime is a function of its weakest upstream. RPCs rate-limit, model
providers 503, pump.fun hiccups. Without timeouts, retries, and failover, one slow
dependency cascades into a platform-wide hang. Resilient external calls are what let the
product stay up when the internet doesn't.

## Map — real anchors
- `api/_lib/solana/connection.js` — Solana RPC with fallback logic. `api/_lib/evm/rpc.js` — EVM fallback provider.
- `api/_lib/pump.js`, `api/_lib/pump-quote.js` — pump.fun client.
- Worker proxies for OpenAI/Anthropic in `workers/`. Forge engines (TRELLIS/NIM, Meshy, Tripo, Stability) behind `api/forge*` / `api/x402/forge*`.
- **Memory:** prefer vetted OSS — there's a `cockatiel` resilience helper available; adopt it rather than hand-rolling retry/breaker logic. Add to new/unprotected call sites; don't refactor working code needlessly.

## Do this
1. **Inventory** every outbound third-party call across `api/` + `workers/`. For each note: timeout? retry? failover? circuit breaker? idempotency on retry?
2. **Timeouts everywhere:** no unbounded `fetch`/RPC. Set per-call timeouts sized to the dependency. A hung upstream must never hang our function to its `maxDuration`.
3. **Retry with backoff** on transient failures (429/5xx/network), with jitter and a cap. Use `cockatiel` (or the existing helper) for consistent retry + circuit-breaker policy. **Only retry idempotent operations** — never blindly retry a money move (coordinate with `44`).
4. **Failover:** RPC and model providers should fail over to a secondary on persistent failure (extend the existing `connection.js`/`rpc.js` fallback pattern). Confirm the failover path itself is validated before use (don't forward an unvalidated RPC body — see commit `fa82d3c8a`).
5. **Circuit breakers** on flaky upstreams so a dead provider sheds load fast instead of timing out every request.
6. **Graceful degradation:** when a non-critical upstream is down, return a real fallback or a clear "temporarily unavailable" — never a 500 cascade.
7. Add tests simulating upstream timeout / 5xx / failover.

## Must-not
- No unbounded external calls. No retry of non-idempotent money operations.
- Do not forward an unvalidated upstream response body through failover.
- Do not hand-roll a bespoke breaker if the vetted helper fits.

## Definition of done
- [ ] Every external call has a timeout; transient failures retry with backoff (idempotent only).
- [ ] RPC + model providers fail over to a secondary; flaky upstreams have breakers.
- [ ] Non-critical upstream failures degrade gracefully, not as 500s.
- [ ] Tests cover timeout/5xx/failover; `npm test` green; `git diff` reviewed.

---
**Non-negotiables (CLAUDE.md):** No mocks / fake data / TODOs / stubs — real APIs only. **`$THREE` is the only coin** (CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) — never reference any other token anywhere. Concurrent agents share this worktree → **stage explicit paths** (never `git add -A`); re-check `git status`/`git diff --staged` before commit. Never commit `api/*.js` starting with `__defProp`/`createRequire` (esbuild trap → `git restore -- api/ public/`). User-visible change → `data/changelog.json` + `npm run build:pages`. Push to BOTH remotes (`threeD`, `threews`) when asked; never pull/fetch from `threeD`.
