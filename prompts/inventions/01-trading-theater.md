# Invention 01 — The Live Trading Theater (watch agents trade, in 3D, in real time)

> **Read [00-README-inventions.md](./00-README-inventions.md) first** for the unique
> stack, ownership model, real resources, hard rules, definition of done, and the
> "improve then delete this file" close-out. Consume the wallet program's shared
> components — do not rebuild them.

## The invention

Trading is invisible everywhere else — rows in a table, numbers ticking. We have
something no one else has: **every trader is a 3D character with a face and a
wallet.** Build the **Live Trading Theater**: a real-time, shared 3D space where
agent-avatars **visibly execute real trades and snipes**, and anyone can watch,
follow, and learn. Trading becomes spectator sport, and the spectacle is real
on-chain activity.

This is impossible for Axiom/Photon/Bullx/a CEX to copy: they have no avatars, no
shared 3D space, no per-agent identity. We do.

## What it is

A live 3D scene ([multiplayer/](../../multiplayer) + the avatar viewer in
[avatar-sdk/](../../avatar-sdk)) populated by real agents whose wallets are actively
trading. When an agent's wallet executes a real action, its avatar **performs** it:

- A **buy/snipe fills** → the avatar reacts (an animation triggered by the *real*
  on-chain fill event, never a fake timer), a floating real receipt (token, size,
  price, tx) rises above it linking to the explorer.
- A **win** (position up) → the avatar's stance/aura reflects real unrealized P&L.
- A **launch** → the agent's coin appears as a real object in the scene.
- Agents are positioned/sized by **real** metrics (24h volume, realized P&L, win
  rate from invention `02`). The biggest real performers are literally center stage.

Spectators can click any avatar to open its (read-only) Wallet HUD and live
positions, **follow** it, or **back** it (invention `03`). Owners see their own
agent on stage and can act from there.

## Real data, real events (zero fakery)

- The trade/fill events that drive animations come from **real** sources: the
  agent's on-chain signatures (`/api/agents/:id/solana/activity`), the custody trail,
  and the pump.fun/Solana feeds. If you need a real-time push, build a real event
  stream (server-sent events / websocket worker reading confirmed chain state) — no
  `setTimeout` heartbeat, no random ticks.
- Leaderboard positioning uses **real** metrics. Empty theater (no live trades right
  now) is a designed state with real recent activity, not invented bots.
- Never animate a fill that didn't happen on-chain. Re-derive from confirmed state.

## Innovation mandate

- **Replays** — let a user scrub a real trade's lifecycle (entry → fill → exit) as a
  3D replay built from real timestamped chain events. "Watch how this agent caught
  that launch."
- **Spectator-to-participant in one tap** — from watching an agent snipe, a viewer
  can fork-to-own (their own wallet) or back the agent (vault), turning spectacle
  into action. Wire those handoffs to the existing flows.
- **Rooms with a theme** — a "new launches" stage, a "$THREE" stage, a "top P&L"
  stage. Real cohorts, real filters.
- **Make it beautiful and performant** — this is the screenshot surface. 60fps,
  graceful LOD with many avatars, lazy-load heavy assets.

## States & edge cases

Empty stage (quiet market) → show real recent highlights + an invitation to watch a
specific agent. Hundreds of agents → LOD/culling, no jank. An agent with no avatar →
fallback identity. Network/stream drop → reconnect gracefully, never show stale data
as live. Mobile → a performant reduced view. Logged-out → watch freely, prompt to
act.

## Definition of done

Per the inventions README. Plus: real agents render in a live 3D space; a **real**
on-chain fill triggers the correct avatar performance with a real receipt + explorer
link (verify the event was real); positioning reflects real metrics; clicking an
avatar opens its real read-only wallet/positions; follow + back + fork handoffs work;
60fps with many avatars; zero console errors; responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only), then **delete this file** (`prompts/inventions/01-trading-theater.md`).
