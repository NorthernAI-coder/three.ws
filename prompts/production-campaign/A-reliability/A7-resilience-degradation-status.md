# A7 — Resilience, Graceful Degradation & Status

You are a senior engineer + product thinker building **three.ws**. Read `CLAUDE.md`,
`STRUCTURE.md`, and `prompts/production-campaign/00b-the-bar.md` first. **Prerequisites:** A1
(your health signals and circuit-breaker state feed its telemetry and the status page).

## Why this matters for $1B
Upstreams fail — RPCs throttle, 3D engines saturate, LLM proxies time out, pump.fun hiccups. A $1B
platform never lets an upstream's bad day become the user's dead end. `00b-the-bar.md` §1: "Graceful
degradation, always. When an upstream is down… the surface degrades to a useful state with a real retry
— exactly the failure we already see on Forge ('free engines all busy'). That state must offer a path
forward (switch engine, queue, notify-me), not a dead end." Resilience plus an honest status page is how
trust survives the inevitable outage.

## Current state (read before you write)
- `api/_lib/resilience.js` is a real cockatiel wrapper (circuit breaker + timeout, one breaker per
  upstream, memoized per lambda instance) — but **only ~1 call site uses it**. The pattern is built;
  adoption is the gap.
- `api/_lib/forge-health.js` already probes 3D backends and reports `ok/degraded/down/byok/unconfigured`
  (it was built because two outages hid behind a `configured:true` flag). `api/_lib/provider-health.js`,
  `_lib/llm-health.js`, `_lib/sse-poll-breaker.js`, `_lib/db-retry.js` exist.
- `api/forge.js` already returns a designed `provider_busy` error ("The free 3D Spaces are all busy or
  warming up right now. Try again in a moment, or pick another engine.") and has `status: 'queued'`
  paths. `src/forge.js` surfaces busy lanes (`busy right now: …`). **But the free-lane busy case is a
  near-dead-end for the user** — the copy suggests switching engines without making it a one-click path,
  and there's no queue or notify-me.
- `pages/status.html` exists (status page shell with OG/theme-boot). It needs to render **real** live
  health, not a static placeholder.
- **The gap:** raw external call sites lack breakers/fallbacks; the status page isn't wired to real
  health; the Forge free-lane busy state forwards the user poorly. Verify each by reading before writing.

## Your mission
### 1. Put every external call behind a circuit breaker + timeout + fallback
Adopt `api/_lib/resilience.js` at every raw upstream call site that doesn't already have a guard: Solana
RPC, Birdeye/Helius, the 3D engines, LLM proxies, pump.fun. Each gets a breaker (named per upstream), a
timeout, and a **real fallback** — a secondary RPC, an alternate 3D engine, a cached/last-known value, or
a designed degraded response. Never a hung request, never an unguarded throw. Where a fallback genuinely
can't exist, fail fast into a designed "try again" envelope (A2 shape) — not a 30s hang.

### 2. Fix the Forge "free engines all busy" dead-end into a real path forward
This is the flagship fix. When the free lane is saturated, the user must get a **one-click** path, not a
sentence telling them to do something manual: (a) **switch engine** — surface the next available healthy
engine (from `forge-health.js`) as a button that retries on it immediately; (b) **queue** — let the user
join a queue and get notified/auto-started when capacity frees (real backend state, not a fake timer);
(c) **notify-me** — capture intent and ping when the free lane recovers. Wire `forge-health.js` so the UI
knows which engines are actually `ok` right now and never offers a `down` one. Design the busy state to
the screenshot bar — it should feel like the product caring, not breaking.

### 3. Health checks for every dependency
Stand up real health checks: each upstream (RPC, 3D engines via `forge-health.js`, LLM via `llm-health.js`,
DB, Redis, pump.fun) and each worker (consume A1's worker heartbeats) reports `ok/degraded/down` with a
reason. Centralize into one health aggregator endpoint that the status page and A1's dashboard both read.
Probes must be cheap and never spend vendor money (follow `forge-health.js`'s zero-cost probe pattern).

### 4. Make `/status` a real, live status page
Wire `pages/status.html` to the health aggregator: live component status (platform, API, x402 paid rails,
3D engines, RPC, workers), current incident banner if any, and the 90-day uptime history its own meta
already promises. Design every state (all-green, partial-degradation, major-outage) to the bar — clear,
honest, branded, accessible, responsive at 320/768/1440px. No fake "all systems operational" when a probe
says otherwise. This is the public face of trust during an outage.

### 5. Degrade every user-facing surface gracefully
For each surface that depends on a flaky upstream (Forge, avatar presence, trade/quote, agent chat, pump
feeds), ensure the breaker-open / fallback path renders a **useful** state with a real retry, not a blank
void or a spinner that never resolves — per A2's envelope and `00b-the-bar.md` §3 error-state bar. The
user always knows what happened and what to do next.

### 6. Surface resilience health into observability
Feed breaker state transitions (open/half-open/closed), fallback activations, and degradations into A1's
telemetry and ops alerts — a breaker that opens on a money/RPC upstream should page. The status page,
A1's dashboard, and the alerts all read one source of truth.

## Definition of done
Clears `00b-the-bar.md` §1 degradation clause: every external call has a breaker + timeout + real
fallback; the Forge "free engines all busy" case is a one-click switch/queue/notify-me path (no dead
end); a live `/status` page renders real component health with all three states designed; every flaky-
upstream surface degrades to a useful retry; breaker/degradation events feed A1's telemetry and page on
money/RPC. Inherits the global definition of done in `00-README-orchestration.md`. Where you can't induce a
real upstream outage locally, force the breaker open in a test and verify the fallback + status render.

## Operating rules (override defaults)
No mocks/fake data/placeholders/TODOs/stubs — **no `setTimeout` fake progress** for the queue; real
backend queue state only. `$THREE` is the only coin. Design tokens only (`public/tokens.css`) for the
status page and busy/degraded states. Stage explicit paths only (never `git add -A`); re-check `git diff
--staged` before commit (watch the `npx vercel build` `api/*.js` bundling trap). You own
`api/_lib/resilience.js`, `_lib/forge-health.js`, `_lib/provider-health.js`, the busy path in `api/forge.js`
+ `src/forge.js`, `pages/status.html`, and the health endpoint(s). Health events flow into A1 — reuse its
helpers, don't fork. Extend the existing breaker/health/queue logic; don't rewrite working probes.

## When finished
Run `CLAUDE.md`'s five self-review checks. Ship one improvement (e.g. an incident-history log behind the
status page, or auto-failover ranking of RPCs by recent latency). Append a `data/changelog.json` entry
(tag: `improvement` or `feature`) — a real status page and a fixed Forge busy flow are very visible. Then
delete this prompt file
(`prompts/production-campaign/A-reliability/A7-resilience-degradation-status.md`) and report which call
sites you put behind breakers, how the Forge busy path now resolves, and the health-source seam shared
with A1's dashboard.
