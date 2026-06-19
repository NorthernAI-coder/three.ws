# Task 07 — Streaming pay-as-you-grind (live x402 micro-settlement + auto-refund)

> Read [00-README-orchestration.md](./00-README-orchestration.md) first.

## The wedge (why this is gamechanging)

The paid endpoint is "pay a fixed price, wait, maybe get it inside the budget." For
hard patterns that model breaks: the buyer pays up front for a *maybe*, sees no
progress, and overpays for easy hits while hard ones time out. x402 is usually
request/response — nobody streams it.

Build **pay-as-you-grind**: a live, streaming grind where the buyer watches a real
odometer + ETA over SSE, **pays in small increments as compute is actually spent**
(x402 micro-settlement), and gets an **automatic refund of the unused budget** the
instant the address is found or they cancel. You pay for work done, not a coin-flip,
and you see it happening. This is a new interaction model for paid compute, not just a
vanity feature — but vanity is the perfect first surface.

## What to build

### Streaming grind transport
- An SSE (or chunked) endpoint, e.g. `GET /api/x402/vanity-stream`, that grinds in
  bounded slices and emits real progress events: `{ attempts, rate, elapsedMs,
  spentAtomics, etaSeconds }` every slice, a `found` event with the result (sealed via
  `sealTo` by default), and a terminal `settled`/`refunded` event. Keep the function
  within platform time limits by slicing work and resuming, or by orchestrating a
  worker — design it honestly for serverless constraints (document the approach).
- Drive grinding with the real engines ([grinder-node.js](../../src/solana/vanity/grinder-node.js)
  / WASM; for very hard patterns coordinate browser workers à la
  [grinder.js](../../src/solana/vanity/grinder.js)). Real attempts, real rate — the
  odometer reflects actual work, never a `setTimeout` animation.

### x402 micro-settlement + refund
- Meter spend against real compute (attempts × an honest per-attempt price, or
  per-time-slice). Use a **prepaid budget held in x402 escrow**, settling incrementally
  as slices complete, and **refund the remainder** on found/cancel — or a per-slice
  pay-continue handshake. Use the real x402 primitives
  ([x402-spec.js](../../api/_lib/x402-spec.js), the payment-identifier/idempotency
  infra) — never settle more than the work done, never settle twice (idempotent slices),
  never charge on a cancel beyond spent.
- Hard guarantees: cancel mid-grind → pay only for work done, refund the rest, no key
  delivered. Found → settle spent, refund remainder, deliver the sealed key. Budget
  exhausted without a hit → settle spent (or refund per policy) and say so honestly.

### UI
- A live grind panel (extend the `/vanity` experience): real-time odometer, rate, ETA,
  spent-so-far vs budget, a clear cancel button, and the running cost. On found: reveal
  + sealed-import/download. Designed states: connecting / streaming / paused / found /
  cancelled-refunded / budget-exhausted / network-drop-resume. Reconnect logic so a
  dropped SSE resumes the same grind/billing session (idempotent, no double-charge).

## Hard requirements

- The odometer + ETA are **real** (driven by actual attempts/rate), never faked.
- Settlement is **exactly metered**: spent ≤ budget, refund = budget − spent, idempotent
  per slice, exactly-once final settle. Cancel never charges for unperformed work.
  Prove these with tests including a mid-stream cancel and a reconnect.
- Sealed delivery by default (the streamed `found` payload is a sealed envelope).
- Honest serverless design: document how you stay within time limits (slicing/resume/
  worker), no hidden long-blocking that silently fails.
- `$THREE` only as the coin; USDC is the settlement asset (runtime). No console errors;
  SSE cleaned up on unmount; stops offscreen.

## Definition of done

- [ ] Streaming grind over SSE with a real odometer/ETA, sealed `found` delivery, and
      clean terminal states.
- [ ] x402 incremental settlement + automatic refund of unused budget; spent ≤ budget;
      idempotent slices; exactly-once final settle; cancel pays only for work done.
- [ ] Reconnect resumes the same grind/billing session without double-charging.
- [ ] Live UI with every state designed, reachable, cancel works, costs honest.
- [ ] Tests: metering math, mid-stream cancel refund, reconnect idempotency, found
      settle+refund. Changelog + `npm run build:pages`. No mocks; `git diff` reviewed.

## Closeout

DoD + self-review, then **improve**: a "spend cap with auto-extend" prompt when the ETA
runs long, multi-worker streaming for very hard patterns (ties to Task 02's fleet), and
surfacing the same pay-as-you-go transport as a reusable primitive other paid endpoints
can adopt. Summarize, then **delete this file**
(`prompts/vanity-x402/07-streaming-pay-as-you-grind.md`).
