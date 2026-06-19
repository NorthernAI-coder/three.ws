# Task 08 — Living Economy: the platform's real-time financial heartbeat

> Read [00-README-orchestration.md](./00-README-orchestration.md) in full first
> (ownership model, $THREE law, real APIs, design system, run loop, worktree rules).

## Mission (one line)

Build the **real-time, platform-wide feed** of agent-wallet activity — every tip,
snipe, trade, launch, payout, and lottery draw — visualized as the living economy of
three.ws.

## Why this is gamechanging

A marketplace of agents with wallets is invisibly busy. Surfacing that activity as a
beautiful, real-time heartbeat does three things at once: it proves the platform is
alive (social proof that drives FOMO and forks), it makes $THREE's on-chain mechanics
(reflection drips, verifiable lottery draws) legible and exciting, and it becomes a
discovery engine ("that agent just 10x'd — let me fork it"). It's a Bloomberg terminal
crossed with a city you can watch breathe — for an economy of embodied agents nobody
else has. The screenshot moment: a live wall of glowing transfers with a $THREE
lottery draw resolving on a verifiable Drand round, in real time.

## What you are building

1. **An aggregated, real activity stream** — a server feed that unifies real events
   from the existing ledgers: custody events (tips, withdraws, x402, vanity swaps),
   trades, pump.fun launches over `pump_agent_mints`, and coin distribution events
   (`coin_events`, `coin_draws`, `coin_payouts` — reflection drips and the
   Drand-verifiable lottery). Real-time via the platform's existing realtime channel
   or efficient polling/SSE. **Only public-safe fields** — never amounts/destinations
   the owner kept private, never secrets. Respect per-agent/per-owner visibility.
2. **The feed UI** (`/economy` or fold into an existing discovery surface — grep
   `launches.js`, `oracle.js`, `radar.js`, leaderboard) — a live, filterable stream
   with real entries: actor avatar (reuse Task 01 identity), action, asset ($THREE
   first-class), amount where public, link to the agent + the on-chain tx. Filters by
   event type and by $THREE.
3. **A money-flow visualization** — an ambient, performance-budgeted viz (the "city
   breathing"): pulses/arcs as real events arrive, density reflecting real volume. It
   reads the same real stream — no synthetic activity ever.
4. **Verifiable $THREE moments** — surface reflection drips and lottery draws with
   their **Drand round + verifiability** so users can trust they're real and fair
   (link the proof). This is a unique trust feature; make it prominent.

## Real data & APIs

- `agent_custody_events` (via a new aggregated, public-safe feed route — build it for
  real, ownership/visibility enforced server-side), `coin_events`/`coin_draws`/
  `coin_payouts`, `pump_agent_mints` + `/api/pump/*`, trade history. Realtime via the
  existing channel or SSE/polling with backoff. $THREE by the CA in `00-README`.

## UX spec

- **States**: connecting, live (streaming), quiet (a real low-activity state — honest,
  not padded with fake events), filtered-empty, error (reconnect, never fabricate),
  paused (user can freeze the stream to read).
- **Viewer roles**: the feed is public by nature, but each entry honors the source
  agent/owner's visibility — a private withdraw never appears; an owner who hid amounts
  shows the event without the amount. Logged-out can watch; actions (tip/fork) prompt
  connect.
- **Microinteractions**: new entries animate in; hovering a flow shows the entry; click
  → agent. Pause-on-hover/scroll so it's readable. The verifiable-draw entry has a
  "verify" affordance linking the Drand proof.
- **Accessibility**: the viz is decorative (`aria-hidden`) with the real feed as the
  accessible, screen-reader-legible list; reduced-motion → calm list, no particle
  storm; keyboard navigable.
- **Performance**: virtualize the list, cap concurrent viz elements, throttle, drop
  oldest; the stream must not leak memory over hours; pause when tab hidden.

## Edge cases

Burst of events (batch/coalesce) · long quiet period (honest empty/quiet state) ·
reconnect after drop (no duplicates, no gaps that imply fake continuity) · private/
amount-hidden events (render safely) · an agent deleted mid-stream · very large
amounts (format, don't overflow) · clock skew on draw resolution · mobile data
(lighter mode).

## Definition of done

Meets the README DoD, plus: the feed streams **real** events from the real ledgers in
real time, visibility/ownership is enforced server-side (no private data leaks), a
real $THREE reflection drip and a real verifiable lottery draw both appear with a
working proof link, the viz reflects real volume (zero synthetic activity), it stays
smooth and leak-free over a long session, and there's a fully accessible non-viz list.

## Then: improve, then delete this file

Push it: a "since you were away" recap, agent-specific economy mini-feeds on profiles,
or wiring proximity tips (Task 02) and strategy actions (Task 03) into the stream.
Update `data/changelog.json`. **Then delete this prompt file.**
</content>
