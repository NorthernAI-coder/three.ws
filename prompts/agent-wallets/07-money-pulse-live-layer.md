# Task 07 — The Money Pulse (a live, platform-wide wallet activity layer)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, design tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Consumes the shared wallet component
> (**task 01**) and the HUD (**task 02**); shares the real-time/event source you
> build with them.

## Mission

Every wallet event on three.ws is currently invisible to everyone but the owner. That
is a wasted social and financial signal. Build the **Money Pulse**: a real-time,
beautiful, platform-wide stream of *real* wallet activity — tips landing, launches
firing, snipes filling, agents paying each other, withdrawals, vanity addresses
minted. A living ticker that makes the platform feel awake and turns money movement
into discovery. Nobody in this space has a tasteful, real, ambient money layer. Invent
it.

This is an ambient surface — it must feel alive without ever being noisy or fake. Zero
synthetic events. If nothing is happening, it says so honestly.

## What exists (read it before building)

- **Custody / event ledger:** `agent_custody_events` (written by `recordCustodyEvent`
  in [api/agents/solana-wallet.js](../../api/agents/solana-wallet.js)) records real
  withdraws, spends, key recoveries, tips, and x402 payments — event_type, category,
  asset, amount, usd, destination, signature, status, timestamp. This is your primary
  real source.
- **Tips:** `POST /api/agents/:id/solana/tip` records real P2P tips.
- **Launches:** the `/launches` feed and `/api/pump/launches` over `pump_agent_mints`
  are real platform launch records.
- **On-chain activity:** `GET /api/agents/:id/solana/activity` and holdings give real
  signatures and balances. Solana RPC is wired.
- **Trades / snipes:** the pump.fun buy/sell/launch path (task 05) writes real fills.

If you need an aggregate feed endpoint, **build it for real**:
`GET /api/pulse` (or similar) that reads the real `agent_custody_events` ledger +
launch records across agents, with sane pagination, caching, and **privacy
controls** (see below). Never assemble the feed from a sample array — every row is a
real event with a real signature you can open on an explorer.

## Privacy & ownership (this is load-bearing — get it right)

A money feed that leaks is a disaster. Apply the ownership model:

- **Public agents** surface their *public* events (tips received, launches, on-chain
  trades that are already public on Solana). Amounts that are already public on-chain
  may show; treat them as public.
- **Private withdrawals, spend-limit changes, and custody/security events are
  owner-only** and must NEVER appear in the public pulse — they belong only in the
  owner's private custody trail (task 02 §7).
- Respect agent `is_public`/visibility. A private/unlisted agent does not appear in
  the public pulse.
- Give owners a per-agent **"include in public pulse" toggle** (persisted server-side,
  default to the conservative choice) so a creator controls their own visibility. Real
  setting, enforced server-side — not a client filter.

When in doubt, do not surface it. Err toward privacy; a single leaked withdrawal
destination is worse than a quiet feed.

## What the Money Pulse must be

1. **A global live feed** — a dedicated surface (e.g. `/pulse`) and an embeddable
   compact ticker that can sit on the home/launches/galaxy surfaces. Each row: the
   agent's avatar + wallet chip (task 01), a human sentence ("◎ tipped @agent 0.5
   SOL", "launched $SYMBOL", "swept to vault"), real USD value, time-ago, and a link
   to the real signature/explorer. Click an agent → its HUD/profile.
2. **Real-time, cheap** — new events animate in live via a real source (poll a cheap
   delta endpoint with a cursor, or a real stream). Polling pauses offscreen and on
   `visibilitychange`. No runaway intervals, no fabricated cadence.
3. **Filterable** — by event type (tips / launches / trades / payments), by an agent,
   by "agents I own" or "agents I follow" if such a relation exists. All real queries.
4. **Per-agent pulse** — the same component, scoped to one agent, lives in its HUD and
   profile ("this wallet's story"): its real lifetime of events, a real inflow/outflow
   summary, biggest tip, total volume.
5. **Aggregate intelligence (real)** — platform money stats from real data: 24h tip
   volume, top earning agents, most-sniped launches, busiest wallets — all computed
   from the real ledger, refreshed honestly. This is genuinely shareable.

## Innovation mandate

- **Ambient, not annoying** — a money layer you *feel*. A subtle pulse animation when
  a real event lands; a tasteful "money sound" the user can opt into; a heatmap of
  where value is flowing. Every beat is a real event.
- **Discovery through money** — the feed becomes a new way to find great agents:
  "this agent just took 40 SOL in tips" is a stronger signal than a follower count.
  Wire pulse rows to profiles/HUDs so attention converts.
- **Shareable moments** — a big tip, a clean snipe, a launch: generate a real OG
  card (reuse `/api/agent-share`) so a standout moment leaves the platform and brings
  people back. Coordinate the share-card work with task 09.
- Invent beyond this where it raises the bar — but the pulse is sacred: **one fake
  event destroys the whole feature's credibility.** Real or nothing.

## States & edge cases

Quiet platform (honest "all quiet — be the first to tip" empty state, not a fake
scroll); a flood of events (virtualize the list, cap render, never jank); an event
whose agent was deleted; a private agent that must not appear; a tip with no USD
price available (show the native amount, omit the fake USD); network failure (the feed
degrades to last-known, says it's reconnecting, never invents rows); 320/768/1440.

## Definition of done

Per the orchestration README. Plus: the public pulse renders **only** real events
from the real ledger/launch records with explorer-verifiable signatures; private
withdrawals/security events never leak into it; the owner visibility toggle works and
is enforced server-side; the per-agent pulse appears in the HUD and profile; live
updates are real and pause offscreen; aggregate stats trace to real queries; no
console errors; responsive. No non-$THREE coin is named or promoted; runtime launch
mints render generically.

When done: self-review + improvement pass, real changelog entry,
`npm run build:pages`, commit (explicit paths only; both remotes if asked), then
**delete this file** (`prompts/agent-wallets/07-money-pulse-live-layer.md`).
