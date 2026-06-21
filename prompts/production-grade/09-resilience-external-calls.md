# Task 09 — Resilience sweep: no naked external call anywhere

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track D —
> Reliability.** High priority, lands early. Coordinate with `10` (payments) on the
> facilitator path and `12` (observability) on how failures are logged.

## The thesis

A platform whose handlers hang for 60s when Helius is slow, or 500 when a facilitator blips,
is not a $1B platform — it's a platform one upstream incident away from looking broken. The
repo already has the right primitive (`resilience.js`, cockatiel) but **<2% of call sites use
it**. Most `fetch`/RPC calls to Solana, pump.fun, forge providers, the x402 facilitator, and
the LLMs are naked: no timeout, no retry, no circuit breaker. Close that systematically.

## What exists today (read first — reuse, don't reinvent)

- **Resilience helper** — [api/_lib/resilience.js](../../api/_lib/resilience.js): `withBreaker()`
  and friends (cockatiel). Adopted in only a handful of places (e.g.
  [api/cron/forge-seed-cron.js](../../api/cron/forge-seed-cron.js) circuit state,
  provider-health cooldown). This is the pattern to spread. (User memory: cockatiel is the
  sanctioned resilience helper; prefer vetted OSS, additive.)
- **Naked upstreams to fix** (non-exhaustive — audit for the rest):
  - Solana RPC via the shared connection in [api/pump/[action].js](../../api/pump/[action].js),
    [api/pump/launch-agent.js](../../api/pump/launch-agent.js) — no AbortSignal timeout.
  - Forge providers (Replicate/NVIDIA/HF) in [api/forge.js](../../api/forge.js) — submit + poll
    with no timeout/breaker; polling has no backoff.
  - x402 facilitator verify/settle in [api/_lib/x402-spec.js](../../api/_lib/x402-spec.js) — no
    timeout, no fallback when the facilitator is down.
  - Image fetch/decode in [api/_lib/forge-image-validate.js](../../api/_lib/forge-image-validate.js)
    — no AbortSignal; a never-closing socket hangs the handler.
  - LLM fallover in [api/chat.js](../../api/chat.js) / [api/_lib/chat-models.js](../../api/_lib/chat-models.js)
    — retries immediately on 429 instead of backing off.
  - Redis-backed caches/limiters ([api/_lib/cache.js](../../api/_lib/cache.js),
    [api/_lib/x402/idempotency-cache.js](../../api/_lib/x402/idempotency-cache.js)) — no timeout
    on Redis ops; cache.js swallows errors silently (masking outages).

## What to build

1. **A single resilient-fetch wrapper** (extend [resilience.js](../../api/_lib/resilience.js))
   that every outbound call routes through: explicit per-call **timeout** (AbortSignal),
   bounded **retry with backoff** on transient (429/5xx/network) errors only, and a **circuit
   breaker** per upstream so a dead dependency fails fast instead of hanging. Sensible
   per-upstream defaults; overridable.
2. **Migrate the high-value call sites** above (and the rest you find — grep for `fetch(` and
   raw RPC usage in `api/` and `workers/`) onto it. Each external call must have a timeout and
   a real fallback or a clean, fast error — never an indefinite hang and never a silent swallow.
3. **Stop silent degradation.** [cache.js](../../api/_lib/cache.js) and the limiter fallback
   must still degrade gracefully **but** surface the degradation (a metric/log via `12`), so a
   Redis outage is visible instead of masked.
4. **Bound the cost paths.** Forge provider polling gets backoff; the facilitator path degrades
   sensibly (coordinate with `10`).

## Hard rules specific to this task

- **No errors without solutions** (CLAUDE.md): every wrapped call has a defined behavior on
  timeout/open-circuit — a real fallback, a cached value, or a clean typed error the caller
  handles. Never a bare throw that 500s the user.
- Don't change business logic or response shapes — this is a reliability layer, transparent to
  callers on the happy path.
- Be careful not to retry **non-idempotent** operations blindly (payments, launches) — retry
  only where safe; coordinate with `10`/`11`.

## Definition of done

README DoD, plus: the high-value upstreams are wrapped with timeout + breaker + bounded retry;
a forced upstream failure (simulate a slow/500 dependency in a test) fails fast with the
defined fallback instead of hanging; cache/limiter degradation emits a signal. Vitest covers
the wrapper (timeout fires, breaker opens, retry backs off, non-idempotent calls aren't
retried). Changelog (`infra`/`improvement`). Self-review, then extend the sweep to the next
batch of naked calls you found.

Delete this file when done.
