# Task 12 — The Galaxy Money-Cam (watch real money move between agents, live)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** — the
> invention bar, ownership model, tokens, real APIs, hard rules, and the "improve
> then delete this file" close-out. Depends on the wallet identity layer
> (**task 01**) for the real per-agent wallet data.

## Mission

The galaxy already renders agents as a 3D star map. Make it the **live economy of the
platform**: real value flowing between agent wallets — tips, trades, skill payments,
launches — visualized as light traveling between stars, in real time. Open the
Money-Cam and you are watching three.ws's economy breathe, every flow a real on-chain
event.

Why only three.ws: every node is a real, ownable agent wallet and every edge is a real
on-chain transfer between two agents on the platform. No one else has a map where the
dots are characters and the lines are real money. It is the single most screenshot-able
thing the platform can show.

## What exists (read it before building)

- Galaxy renderer: [src/galaxy.js](../../src/galaxy.js) (Three.js star map) — extend
  it; don't rebuild it. Per-agent wallet identity + balances from task 01's normalizer.
- Real flow data: on-chain transfers between agent wallets via Solana RPC / parsed
  transactions and the activity endpoints
  ([api/agents/solana-wallet.js](../../api/agents/solana-wallet.js) `.../activity`,
  helpers in [api/_lib/agent-wallet.js](../../api/_lib/agent-wallet.js)), tips
  (`.../solana/tip`), trades (task 05), and the launches feed
  ([api/_lib/agent-pumpfun.js](../../api/_lib/agent-pumpfun.js)). Build a real
  aggregation endpoint if one doesn't exist — read real chain/DB state, cache sanely,
  never invent edges.

## How it must work

1. **Nodes = real agents, sized/lit by real wallets.** Each star is an agent; its
   size/brightness reflects real net worth (reuse task 07's mapping). Identity and
   ownership come from real data.
2. **Edges = real transfers.** When a real tip / trade / payment / launch buy occurs
   between agents on the platform, animate a pulse of light from sender to receiver,
   scaled by real USD value. Every edge is a real, confirmed on-chain event with a
   real signature you can open in the explorer. No decorative traffic.
3. **Live, then historical.** A live mode streams recent real flows (poll cheaply or a
   real event source; stop when the tab is hidden). A scrubber replays a real time
   window from real history. Both are honest about their data window.
4. **Inspect any flow.** Click an edge -> the real tx (amount, mints, both agents,
   signature, time). Click a node -> the agent's wallet identity + HUD (task 01/02).
   The Money-Cam is a navigable lens into the real economy, not a screensaver.

## Innovation mandate

- **The economy as a living place.** Whales pulse, hot launches light up clusters,
  tip storms ripple — all from real events. This is the marketing artifact and the
  retention loop in one: people will leave it open.
- **Real, not theatrical.** The temptation is fake particles for "liveliness." Resist
  it completely — if nothing is flowing, the galaxy is calm; that honesty is the point.
  Every photon is a real transfer.
- **Discovery surface.** Spot the active agents, the rising clusters, the flows into
  $THREE — then jump straight to that agent's HUD or fork it (task 04). Wire the map
  into the rest of the program.
- Invent beyond this where it raises the bar — but performance and truth are the
  craft: 60fps with many nodes/edges, GPU-friendly, reduced-motion respected, and not
  a single fabricated flow.

## States & edge cases (all designed)

No recent flows (calm galaxy + honest "quiet right now," not fake traffic); a sudden
burst of flows (batch/throttle the render, never drop frames); thousands of nodes
(LOD, instancing, culling); a flow involving a just-created agent still provisioning
(handle the pending node gracefully); private/owner-only data must never leak onto a
public map (only public, on-chain flows are shown); network failure (freeze last real
state + honest reconnect, never invent edges to fill the gap); reduced-motion (calm
static-ish mode); mobile/low-end GPU (graceful fallback).

## Definition of done

Per the orchestration README. Plus: nodes reflect **real** wallet state; a **real**
transfer between two platform agents renders as an animated edge you can click through
to the real signature; live mode streams real recent flows and pauses when hidden;
the scrubber replays real history; clicking a node opens the real wallet HUD; 60fps
held on a busy galaxy; reduced-motion respected; no fabricated flows anywhere; no
console errors; responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only, push to **both** remotes if asked), then **delete this file**
(`prompts/agent-wallets/12-galaxy-money-cam.md`).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/agent-wallets/12-galaxy-money-cam.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
