# Task 04 — The Money Constellation: a live map of value flowing between agents

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. This task
> assumes all of it (ownership model, hard rules, design tokens, real APIs, concurrency
> traps, definition of done, self-improve-then-delete).

## The idea (why it's gamechanging)

three.ws already renders its agents as a **galaxy of stars** ([src/galaxy.js] +
[api/galaxy.js]). Turn it into a **living economy you can watch.** Every tip, stream,
agent-to-agent payment, snipe, and coin launch becomes a **pulse of light traveling
between stars** in real time. Zoom out and you see the whole economy breathing; zoom in
and you see who pays whom, who earns, who's hot right now. Click an edge to see the real
transaction; click a star to see that agent's money in/out.

Nobody has a real-time, on-chain, embodied **money map** of an agent economy. It's a
flagship "look what three.ws is" artifact — beautiful, screenshot-bait, and genuinely
useful for discovering who's active and where value concentrates. It's also the natural
home for the data the rest of the wave produces (tips 05, streams 01, intents 02).

## How to build it for real (every edge is a real transaction)

1. **Real flow feed.** Build a flows endpoint, e.g. `GET /api/economy/flows?since=…`, that
   returns recent **real** value movements between agents from sources that already exist:
   - tips + streams + agent-to-agent x402 payments + trades from `agent_custody_events`
     (`listCustodyEvents` across agents — add an admin/aggregate read that selects recent
     events with `from`/destination resolvable to agents),
   - launches from the pump feed / launch records,
   - resolve counterparties to agent ids where possible (a tip's `from` may be an external
     wallet — represent those as "external" nodes on the rim, not fake agents).
   Each flow: `{ id, kind, from, to, asset, amount, usd, signature, ts }`. **Never
   fabricate edges** — if a counterparty can't be resolved, show it honestly as external.
   Respect rate limits + cache; this is a hot read.
2. **Live updates.** Stream new flows over SSE (mirror the existing live patterns, e.g.
   [api/club/tips-stream.js]) so the map animates as money actually moves. Reconnect/backoff
   on drop; render last-known on stale (with a clear "reconnecting" affordance, like the
   leaderboard already does).
3. **Visualization.** Extend the existing Three.js galaxy:
   - animate a light particle along the arc from source star to target star on each flow,
     sized/brightness by `usd`, colored by `kind` (tip / stream / pay / trade / launch),
     wallet-violet as the family accent;
   - persistent faint edges for established relationships (who pays whom often);
   - a star's brightness/size can reflect recent net flow (coordinate with Embodied
     Finance, task 03, so the two share one wealth signal rather than two).
   GPU-cheap: instanced particles, pooled geometry, LOD by zoom, cap concurrent animations
   and queue overflow. No per-frame allocations.
4. **Inspect.** Click an edge → a panel with the real tx (Solscan link), both agents, and
   amount. Click a star → that agent's money in/out summary (real, from custody) with deep
   links to its profile/wallet. Filters: by kind, by time window, by "my agents."

## The UI

- A dedicated mode on the galaxy ("Economy" toggle) plus a compact "live flows" ticker
  that can be embedded on the home/trending surfaces (real data, links through).
- Legend, time-window control, kind filters, play/pause, and a "follow this agent's money"
  focus. Empty state (quiet market → "no flows in the last N min, here's the last hour"),
  loading skeletons over the 3D canvas, error/reconnecting states. a11y: the map has a
  parallel accessible list view of recent flows (keyboard-navigable, screen-reader-readable)
  — never make the data *only* available as moving 3D. Respect reduced-motion (static
  edges + the list).

## Ownership / viewer states

- **Public** map of public flows (tips/streams/pays/trades/launches are public on-chain
  events). Never expose owner-only figures (spend policy, exact custody notes) — only the
  public movement + amount + signature.
- **Owner** can highlight/follow their own agents' flows ("my money map").
- **Logged-out**: full read-only map; connecting unlocks "follow my agents."

## Definition of done (in addition to 00's list)

- Every rendered edge corresponds to a **real** transaction with a working explorer link;
  external counterparties shown honestly, never faked into agents.
- Live SSE updates with robust reconnect/stale handling; cached aggregate reads respect
  RPC + DB limits.
- 3D performant at scale (hundreds of agents, bursts of flows) with LOD + pooling; full
  reduced-motion + accessible list fallback.
- Inspect panels show real data + deep links; filters and time windows work.
- Edge cases: dead-quiet market (0 flows), a single whale dominating, 1000 flows in a
  burst (queue/throttle), unresolved counterparties, SSE dropped.

## Then improve, then delete

After done, run the self-review protocol. Pick the biggest weakness and fix it — e.g. a
shareable snapshot/replay of "the last hour of the economy," or surfacing the hottest
earning agent right now as a discovery hook on the home page. Then **delete this file**.
