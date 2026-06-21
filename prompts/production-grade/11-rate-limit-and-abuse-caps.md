# Task 11 — Per-principal spend caps + global concurrency ceilings

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. **Track D —
> Reliability.** Protects platform margin and prevents abuse. Coordinate with `09` (resilience)
> and `12` (so cap hits are observable).

## The thesis

Several of the most expensive operations on the platform — paid 3D generation, premium LLM
chat, token launches, vanity grinding — are throttled per-IP but **not capped per principal or
globally**. An authenticated user (or a botnet spread across IPs) can run up real platform cost
with no ceiling: $9/min of Claude tokens, hundreds of paid generations across 10 IPs, unbounded
launches from a compromised agent. A $1B platform protects its unit economics by construction.

## What exists today (read first)

- **Rate limiter** — [api/_lib/rate-limit.js](../../api/_lib/rate-limit.js): per-IP/per-route
  buckets (e.g. `chatUser` 40/min, forge per-user/hr, vanity publish 12/10m). Real and used —
  but it's request-count throttling, not **spend** or **global concurrency** control, and it
  doesn't differentiate cost per model/provider.
- **Forge scaling** — [api/_lib/forge-scale.js](../../api/_lib/forge-scale.js): per-provider +
  per-user slots, but **no global ceiling** on total concurrent paid Replicate/NVIDIA jobs.
- **Cost-bearing endpoints lacking principal/global caps:**
  [api/chat.js](../../api/chat.js) (no per-model spend cap — Claude/GPT cost ~10× free Groq),
  [api/x402/pump-launch.js](../../api/x402/pump-launch.js) and
  [api/pump/launch-agent.js](../../api/pump/launch-agent.js) (no per-agent daily launch
  ceiling), [api/forge.js](../../api/forge.js) (no global generation concurrency cap),
  vanity grind ([api/x402/vanity.js](../../api/x402/vanity.js), grind queue depth unbounded).

## What to build

1. **Per-principal spend/usage caps.** Add a real, configurable per-user (and per-agent where
   relevant) ceiling on expensive operations over a rolling window — denominated in cost, not
   just request count. Premium-LLM chat, paid generation, launches, and grinding each get a
   sane cap with a clear, actionable 429/upgrade response (coordinate the upgrade CTA with
   `02`). Caps must be **cost-aware**: a Claude call counts more than a free-Groq call.
2. **Global concurrency ceilings.** Add a platform-wide cap on total concurrent
   cost-bearing jobs (paid forge generations, grind workers) so a coordinated surge can't blow
   the budget. Excess requests queue or get a clean "busy, try shortly" with a retry hint —
   never silently dropped, never unbounded.
3. **Per-agent launch ceiling.** Cap token launches per agent/day so a compromised custodial
   agent can't spam launches. Real ceiling, real enforcement, real audit entry on hit.
4. **Make limits observable.** Emit a metric/log on every cap hit (via `12`) and a real signal
   when a global ceiling is saturated (input to `12`'s status + alerting).

## Hard rules specific to this task

- Caps protect cost **without** breaking legitimate power users: tune to real provider pricing,
  give holders their real higher quota ([three-tier.js](../../api/_lib/three-tier.js)), and
  always return an actionable response (why blocked, when to retry, how to upgrade).
- **$THREE only** in any upgrade/quota copy.
- Don't double-charge or lose work when a request is queued/throttled — coordinate with `10`.

## Definition of done

README DoD, plus: each expensive endpoint enforces a per-principal cost-aware cap with an
actionable response; a global concurrency ceiling bounds total paid jobs; per-agent launch
ceiling enforced; every cap hit is observable; holder quotas honored. Vitest covers cap
enforcement (per-principal, global, per-agent) and the cost-weighting. Changelog
(`infra`/`security`). Self-review, then close the next-weakest unbounded cost path.

Delete this file when done.
