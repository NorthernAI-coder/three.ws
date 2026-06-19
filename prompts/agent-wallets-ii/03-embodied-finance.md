# Task 03 — Embodied Finance: the avatar *is* its wealth

> Read [00-README-orchestration.md](./00-README-orchestration.md) first. This task
> assumes all of it (ownership model, hard rules, design tokens, real APIs, concurrency
> traps, definition of done, self-improve-then-delete).

## The idea (why it's gamechanging)

Every agent on three.ws is a **3D embodied avatar**. No other platform can do this: make
the agent's wallet **visible in its body.** An agent that's earning, well-funded, and
trading profitably *looks* alive — a subtle aura, a confident idle, a richer glow. An
agent that's broke or bleeding looks dimmer. Wealth becomes embodied, ambient, and
instantly legible across the whole world — the galaxy, the marketplace, IRL/AR, the
profile — without a single chart.

This is "show, don't tell" applied to money. It makes the platform feel alive and makes
the wallet impossible to ignore, because it's *the character itself.* It's the kind of
thing people screenshot and post.

## How to build it for real (driven by real wallet data, never decorative noise)

1. **A real "wealth state" derived from real data.** Build a shared, cached selector
   `src/shared/agent-wealth-state.js` that turns an agent's real wallet data into a small,
   honest state object: `{ tier, balanceSol, balanceUsd, momentum, streamingNow, lastTipAt }`.
   Inputs are all real:
   - balance/holdings from `GET /api/agents/:id/solana/holdings`,
   - realized momentum from the custody ledger (`listCustodyEvents` — tips/streams in,
     trades/withdraws out) and trade history
     ([api/agents/solana-trade.js](../../api/agents/solana-trade.js)),
   - "streaming now" from the Money Streams custody events (task 01),
   - $THREE context where relevant via the existing pricing helpers.
   `tier` is a small, well-defined ladder (e.g. dormant → active → thriving → whale)
   computed from real thresholds — **document the thresholds; never random.** Cache to
   respect RPC limits (mirror the 60s wallet-read cache already used in
   [api/agents/solana-wallet.js]).
2. **Embodiment layer.** Map wealth state → tasteful, performant 3D/CSS treatment:
   - In 3D contexts (avatar page [src/avatar-page.js], galaxy [src/galaxy.js], IRL
     [src/irl.js], world): a subtle emissive aura / rim light / particle density / idle
     confidence keyed to `tier`, and a brief celebratory pulse on a real incoming
     tip/stream/profitable exit. Use the existing Three.js setup; keep it GPU-cheap
     (no per-frame allocations; respect the renderer already in place).
   - In 2D contexts (cards, chip, profile header): a matching aura ring / gradient token
     so the same agent reads at the same "wealth tier" everywhere. Route through
     `--wallet-accent` and new tokens; never scatter hex.
3. **Honesty + restraint.** The effect must reflect **real** state — if balance is 0, the
   agent looks dormant, full stop (no fake shimmer). Keep it tasteful: it should enhance,
   never turn the app into a slot machine. Everything must degrade gracefully if holdings
   can't be read (RPC down → neutral state, never a misleading "rich" glow).

## The UI / integration

- A single source of truth (`agent-wealth-state.js`) consumed by every surface that
  renders an avatar, so the embodiment is consistent app-wide. Coordinate with Wave I's
  shared chip so the chip can show the tier label/aura too.
- A small, optional **"why"** affordance on the owner's own agent: tap the aura to see the
  real numbers behind the state (balance, 24h momentum, streaming now) — links into the
  HUD. Visitors see the aura but not the owner-only breakdown.
- Respect `prefers-reduced-motion`: replace animated auras with a static treatment.
- Performance budget: the effect must not regress frame rate on the galaxy or IRL with
  many agents on screen — instanced/shared materials, LOD the effect by distance, throttle
  data refresh.

## Ownership / viewer states

- **Everyone** sees the embodiment (it's public, derived from public balance + public
  custody-flow signals — never exposes secret or owner-only data).
- **Owner** additionally gets the "why" breakdown + a toggle to opt their agent's
  embodiment up/down (some owners may want it subtle). Never let embodiment leak
  owner-only figures to visitors — visitors see the *tier/aura*, not exact P&L unless the
  owner has made balance public (it already is, via the public holdings read) — keep
  visitor detail to balance-level only.

## Definition of done (in addition to 00's list)

- Wealth state is computed from **real** holdings + custody/trade data, cached sanely,
  documented thresholds, graceful neutral fallback on RPC failure.
- Embodiment renders consistently in 3D (avatar/galaxy/IRL) and 2D (cards/chip/profile)
  with no frame-rate regression and full reduced-motion support.
- Real incoming tip/stream/profit triggers a real-time celebratory pulse (subscribe to
  the same signals task 01/05 emit).
- Edge cases: 0 balance, RPC throttled, 1000 agents in the galaxy at once, an agent with
  no avatar (fall back to the card aura), expired session.

## Then improve, then delete

After done, run the self-review protocol. Pick the biggest weakness and fix it — e.g.
"level-up" moments when an agent crosses a tier (a tasteful, shareable card), or wiring
the aura into the IRL/AR walk so a well-funded agent you pass in the real world glows.
Then **delete this file**.
