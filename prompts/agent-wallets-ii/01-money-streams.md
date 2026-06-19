# Task 01 — Money Streams: pay an agent by the second

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. This task
> assumes all of it (ownership model, hard rules, design tokens, real APIs, concurrency
> traps, definition of done, self-improve-then-delete).

## The idea (why it's gamechanging)

Tipping is a single lump payment. **Money Streams** make value *flow in real time*:
a visitor opens a stream to an agent and pays it **per second** for as long as they're
engaged — watching it perform in the club, talking to it, keeping it working on a task,
or simply being a patron while they're on its page. The number ticks up live; the agent
literally earns while you watch. Stop the stream and you stop paying, to the second.

No other agent platform has continuous, per-second agent income. This is the primitive
that makes "the agent earns a living" real instead of a slogan. It powers pay-per-minute
conversation, pay-to-watch performances, and "patron while present" — and later tasks
(Patronage 05, Embodied Finance 03, the Money Constellation 04) all consume it.

It must be **non-custodial** (the streamer signs from their own wallet), **real**
(actual SOL/USDC settled on Solana — never a fake counter), and **safe** (you can never
be charged more than you authorized; closing the tab stops the meter).

## How to build it for real (no fakes, real settlement)

A "stream" is an **authorized rate + a real periodic micro-settlement**, not a fake
client counter. Design:

1. **Open**: the streamer connects their wallet (reuse the detection + signing in
   [src/shared/agent-tip.js](../../src/shared/agent-tip.js)) and authorizes a stream:
   `{ agentId, asset: 'SOL'|'USDC', ratePerMinute, maxTotal }`. `maxTotal` is a hard
   ceiling they sign for — the meter can never exceed it.
2. **Accrue + settle**: the client meters elapsed time and, on a fixed cadence (e.g.
   every ~30–60s, and on stop), builds + signs a transfer of the accrued-since-last
   amount to the agent's public `solana_address`, submits via the same-origin RPC proxy
   (`/api/solana-rpc`), and confirms. **Each settlement is a real on-chain transfer** —
   the "live ticking number" is the *projected* accrual between settlements, reconciled
   to the on-chain total after each settle so the displayed total is always backed by
   real signatures. Never show value that isn't either settled or about-to-settle within
   the current interval.
3. **Stop**: a final settle of the remaining accrued amount, then close. Closing the tab,
   navigating away, or losing the wallet = immediate stop (no further signatures, so no
   further charges). Use `visibilitychange`/`beforeunload` to attempt a final settle and
   to halt accrual.
4. **Record**: POST each confirmed settlement to a new endpoint
   `POST /api/agents/:id/solana/stream` that **verifies the signature on-chain pays this
   agent** (parse the tx, confirm destination + amount, confirm `confirmed`/`finalized`),
   then writes a custody event (`event_type:'stream'`, `category:'stream'`, with
   `meta:{ stream_id, rate_per_minute, asset, from }`) via `recordCustodyEvent`
   ([api/_lib/agent-trade-guards.js](../../api/_lib/agent-trade-guards.js)). Idempotent on
   signature. This is the only server write; funds are never custodied. A `stream_id`
   (client-generated UUID) groups the settlements of one session.

> If a streaming token (e.g. a Solana streaming program) is available in the SDKs, you
> may use it for true continuous settlement instead of periodic micro-transfers —
> **but only if it's real and you wire it end to end.** Otherwise the periodic-settle
> design above is the correct, honest implementation. Never simulate.

## The UI

- **Shared component** `src/shared/agent-money-stream.js` (sits beside the chip/tip
  modal): `openStreamPanel(agent, { network })` and an inline `mountStreamMeter(el, …)`
  for surfaces that want the live meter embedded.
- The meter: a live, animated, monospace counter (use `--font-mono`, `--wallet-accent`)
  showing **streamed-so-far** + **rate** + **time elapsed** + a thin progress bar toward
  `maxTotal`. Rate picker (per-minute presets + custom), asset toggle (SOL/USDC), a
  prominent **Stream** ⇄ **Stop** control. Each successful settle pulses the meter and
  shows a tiny "✓ settled · ◎0.0123 · receipt ↗" line linking the real Solscan tx.
- Reachable from: the agent profile + character page (a "Stream" action next to Tip),
  the club/performance surfaces (pay-to-watch), and the conversational/chat surface
  (pay-per-minute of talking — integrate with the chat preview session in
  [src/agent-detail-market.js]). For the owner viewing their own agent, show **incoming
  streams** live (read from custody `category:'stream'`) as "earning now."
- States: idle, connecting wallet, streaming (live), settling (real), stopped (summary
  with total + receipts), error (e.g. insufficient balance → actionable, offer to lower
  rate or switch asset). Respect `prefers-reduced-motion` (no ticking animation; update
  on settle only).

## Ownership / viewer states

- **Visitor / logged-in non-owner**: can open a stream to any agent (their own wallet
  signs). This is the headline path.
- **Owner**: sees their agent's **earnings** from streams (a live "earning now" + a
  lifetime total from the custody ledger) and a per-day chart. Owners don't stream to
  their own agent.
- **Logged-out**: prompt to connect a wallet to stream.

## Definition of done (in addition to 00's list)

- Streaming is **real on-chain settlement** in both SOL and USDC, confirmed before the
  displayed total counts it. Closing the tab provably stops charges.
- `maxTotal` is enforced client-side AND the server rejects/ignores any settlement that
  would push a stream over its signed ceiling for that `stream_id`.
- New endpoint verifies each tx on-chain and writes an idempotent custody event; owner
  earnings + visitor history both read from it.
- Wired into profile, character, club/performance, and chat surfaces. Every state
  designed; a11y + reduced-motion handled.
- Edge cases: rate set to 0, wallet rejects mid-stream, RPC throttled mid-settle (retry
  with backoff; never double-charge), 1000 settlements (paginate the history), very long
  session, expired session.

## Then improve, then delete

After done, run the self-review protocol from [00](./00-README-orchestration.md) and
CLAUDE.md. Pick the biggest weakness and fix it — e.g. a "stream-back" so an agent the
owner armed can auto-stream a thank-you, a keyboard shortcut to start/stop, an
empty-state that explains streaming, or wiring the live "earning now" pulse into the
agent's 3D avatar (coordinate with Embodied Finance, task 03). Then **delete this file**.
