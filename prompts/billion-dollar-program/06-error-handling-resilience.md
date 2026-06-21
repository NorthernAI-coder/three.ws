# 06 — Error handling & resilience (api/ + workers/)

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

A $1B platform never dies because an upstream blinked. Solana RPC throttles, OpenAI
returns a 529, pump.fun times out, an image provider 502s — and the user must still
get a fast, honest, recoverable result, never a hung spinner or a leaked vendor stack
trace. `/CLAUDE.md` is explicit: **no errors without solutions; ship working fallbacks
and failsafes; lazy error propagation is not engineering.** Resilience is what turns
demo-grade into platform-grade.

## Mission

Wrap every external call in `api/` and `workers/` in a timeout + retry + circuit
breaker via the existing **cockatiel** helper, handle errors only at the boundaries
(network, user input) while internal code trusts itself, and guarantee no unhandled
promise rejection and no provider internals ever reach a user.

## Map (trust but verify — files move)

- **Resilience helper (build on this — do not re-roll)** — [api/_lib/resilience.js](../../api/_lib/resilience.js):
  `withBreaker(name, fn, { fallback, threshold, halfOpenAfterMs })`, `isCircuitError`.
  It is the ONLY current cockatiel consumer — that is the gap this prompt closes.
- **Boundary error envelope** — [api/_lib/http.js](../../api/_lib/http.js): `wrap()`
  (catches unhandled rejections, redacts keyed RPC URLs from 5xx bodies, emits a
  correlation `ref`), `serverError`, `respondError`, `redactUrl`.
- **LLM provider chain** — [api/_lib/llm.js](../../api/_lib/llm.js) (`llmComplete`,
  anthropic/openai/nvidia/groq fetch at lines ~95/169/183/238),
  [api/_lib/llm-health.js](../../api/_lib/llm-health.js) (probe timeouts).
- **Solana RPC failover** — [api/_lib/solana/rpc-fallback.js](../../api/_lib/solana/rpc-fallback.js)
  (`createRpcFallback`, rotation + cooldown), [api/_lib/solana/connection.js](../../api/_lib/solana/connection.js),
  [api/_lib/helius.js](../../api/_lib/helius.js), [api/_lib/onchain.js](../../api/_lib/onchain.js).
- **Other upstreams** — pump.fun (`frontend-api-v3.pump.fun`, `gmgn.ai`),
  [api/_lib/birdeye.js](../../api/_lib/birdeye.js), [api/_lib/aixbt.js](../../api/_lib/aixbt.js),
  Telegram/IPFS/Pinata. Image/3D providers in [workers/](../../workers): `model-trellis`,
  `model-hunyuan3d`, `model-triposg`, `rembg`, `texture`, `unirig`.
- **MCP error masking** — [api/_lib/mcp-error-sanitize.js](../../api/_lib/mcp-error-sanitize.js)
  (`sanitizeToolError`), used by [api/_lib/mcp-dispatch.js](../../api/_lib/mcp-dispatch.js).
- **Tests** — [tests/resilience.test.js](../../tests/resilience.test.js),
  [tests/api/mcp-resilience.test.js](../../tests/api/mcp-resilience.test.js),
  [tests/api/pump-trending-resilience.test.js](../../tests/api/pump-trending-resilience.test.js).

## Do this

1. **Inventory raw external calls.** `grep -rnE "fetch\(|new Connection\(|axios" api/
   workers/` and cross-reference the host list (`grep -rhoE "https://[a-z.-]+" api/
   workers/`). Mark every site that hits Solana RPC, an LLM proxy, an image/3D
   provider, pump.fun/gmgn, Birdeye, or Telegram/IPFS. That set is your work queue.
2. **Every external call gets a timeout.** Any `fetch` without `signal:
   AbortSignal.timeout(ms)` (or equivalent) is a bug — a hung socket stalls the lambda.
   Add a tight, intent-appropriate timeout (probes ~5s, generations longer).
3. **Wrap each upstream in a named breaker.** Use `withBreaker('pumpfun:trending',
   () => …, { fallback, threshold, halfOpenAfterMs })` so an outage fails fast instead
   of every request paying the full timeout. Name breakers per logical upstream.
   Provide a real `fallback` (cached value, neutral empty result) — never silently null.
4. **Solana goes through the failover path.** Confirm RPC reads/writes use
   `createRpcFallback`/`rpc-fallback.js` (rotation + cooldown), not a bare
   `new Connection(url)`. Retire any one-off connection that bypasses rotation.
5. **No unhandled promise rejections.** Verify every Vercel handler is wrapped by
   `wrap()` (or equivalent try/catch at the boundary). Audit fire-and-forget calls
   (`void something()`, background telemetry) — every floating promise needs a
   `.catch`. Internal pure functions stay un-try/catched; trust them.
6. **Mask every vendor internal.** Boundary errors must map to neutral, actionable
   copy via the `http.js` envelope (and `sanitizeToolError` for MCP). No raw stack,
   no keyed RPC URL, no provider billing/quota text, no 402/credit message reaches the
   client. Raw detail lives only in `console.error` + the `ref`.
7. **Add coverage for each new failure mode.** Extend `tests/resilience.test.js` (and
   the mcp/pump resilience tests) so timeout, open-circuit, 429/529, and fallback are
   asserted. Run `npx vitest run tests/resilience.test.js tests/api/*resilience*.test.js`.
8. **Sanity-check live.** `npm run dev`, exercise a forge generation and a pump/oracle
   read with the network throttled; confirm graceful degrade, no console errors, real
   elapsed time. If anything is user-visible, add a `data/changelog.json` entry (tag
   `infra` or `improvement`) and run `npm run build:pages`.

## Must-not

- Do not hand-roll a new retry/cooldown/breaker — extend `withBreaker`/cockatiel.
- Do not swallow errors into silent nulls without a designed fallback or a log line.
- Do not let any vendor stack, keyed URL, billing/quota/credit message, or 402 detail
  reach a user — mask at the boundary, log raw server-side with a `ref`.
- Do not add try/catch to internal pure code — handle at boundaries only.
- Do not break working failsafes (the Solana rotation, `wrap()` redaction, fail-closed
  limiters). Add resilience; never weaken what already protects money paths.
- Do not reference any coin other than `$THREE`.

## Acceptance (all true before claiming done)

- [ ] Every external call site in `api/` + `workers/` has a timeout and a named
      `withBreaker` (or the existing Solana failover) — verified by grep, no bare
      timeout-less `fetch` to a third party remains.
- [ ] No unhandled promise rejection path: every handler is `wrap()`-ed, every
      fire-and-forget promise has a `.catch`.
- [ ] Throttling/killing an upstream degrades gracefully in a real browser — no hung
      spinner, no console error, neutral copy, real elapsed time.
- [ ] No vendor internals (stack, keyed URL, billing/quota/402) appear in any client
      response; raw detail is logged with a correlation `ref`.
- [ ] `tests/resilience.test.js` + the mcp/pump resilience tests pass, with new cover
      for timeout, open-circuit, 429/529, and fallback.
- [ ] Any user-visible change has a `data/changelog.json` entry and `npm run
      build:pages` is clean.
