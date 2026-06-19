# Task 01 — Living Avatar: the embodied wallet

> Read [00-README-orchestration.md](./00-README-orchestration.md) in full first. It
> holds the ownership model, the $THREE law, the real API surface, the design system,
> the run loop, and the worktree rules. Do not re-derive them.

## Mission (one line)

Make an agent's **3D avatar visibly reflect its wallet** — its wealth, its holdings,
its vanity identity, and its live on-chain activity — so that for the first time
anywhere, you can *look at a character and read its financial life.*

## Why this is gamechanging (hold this bar)

Every other wallet is a number behind a button. Here the wallet has a body. A
well-funded, actively-trading agent should *look* alive — an ambient aura, a glint on
its nameplate, a pulse when it lands a trade. A fresh empty agent looks plain and
invites its owner to fund it. This turns balances into **status and identity**, makes
worlds and galleries instantly legible ("who here is real?"), and gives owners a
reason to fund and grow their agent that no spreadsheet wallet can match. The
screenshot moment: someone posts their avatar glowing with its vanity nameplate and
live P&L and people ask "how do I get one?"

## What you are building

A reusable **wallet-reactive presentation layer** for the avatar that any 3D surface
can opt into, driven entirely by real wallet data. It has two coordinated parts:

1. **Nameplate / identity ring** — a 3D-or-overlay label anchored to the avatar that
   shows the agent name + its **vanity-highlighted address** and a tier glyph. It is
   the avatar's "license plate." Owners can toggle what's shown; visitors always see
   the public address (read-only).
2. **Wealth & activity expression** — a tasteful, performance-budgeted visual signal
   derived from real holdings and recent custody events:
   - a **tier** computed from real SOL + token holdings (and $THREE held), e.g. an
     ambient aura/emissive intensity that scales with a *bucketed, non-misleading*
     wealth tier — never a precise dollar value floating over their head;
   - a **live pulse** when a real trade/tip/x402/withdraw event lands (subscribe to or
     poll the custody/holdings endpoints);
   - a **$THREE affinity** accent for agents holding $THREE (the platform coin), as a
     first-class, recognizable mark.

This must degrade gracefully: on any surface it can render as full 3D (shader/particle
aura), as a lightweight CSS overlay (cards, model-viewer), or as nothing on a hard
perf budget — same data, three fidelities.

## Real data & APIs (no fakes)

- Balance/holdings: `GET /api/agents/:id/solana/holdings?network=` (SOL + SPL tokens),
  `GET /api/agents/:id/solana` (address + SOL). Public/anon-safe — works for visitors.
- Vanity identity: from the agent record (`meta.solana_vanity_prefix/suffix`,
  `solana_address`) already on the decorated agent and marketplace records; reuse the
  formatter/highlighter in `src/shared/agent-wallet-chip.js` — do not reimplement it.
- Live activity: `GET /api/agents/:id/solana/custody` (owner) and holdings deltas
  (visitor-safe). Poll on a sane interval with backoff; coalesce; never hammer RPC.
  Respect the existing 60s balance cache. If a lightweight push channel exists
  (SSE/websocket) prefer it; otherwise poll only while the avatar is on-screen.
- $THREE detection: compare token mints from holdings against the $THREE CA in
  `00-README`. Never hardcode any other mint.
- Tier thresholds: derive from real holdings; document the buckets in code. Buckets,
  not exact net worth on display (avoid doxxing / misleading precision).

## Surfaces to wire (every place an avatar renders in 3D or as a portrait)

- `src/avatar-page.js`, `src/agent-detail.js`, `src/character.js` — the hero viewers.
- `src/marketplace.js` / `src/marketplace-detail.js`, `src/leaderboard.js` — cards &
  rows (CSS-overlay fidelity).
- `src/walk.js`, `src/app.js` + `src/play/arena.js`, `src/irl.js` — worlds (full 3D
  fidelity, but pooled/instanced so N avatars stay smooth).
- The `<threews-avatar>` / `agent-3d` web component so embeds inherit it (coordinate
  with Task 07 on the embed default — opt-in there).

## Architecture & data flow

- Create one shared module (e.g. `src/shared/living-avatar.js` or fold into the
  consolidated wallet identity module under `src/shared/`) exposing: resolve wallet
  presentation from an agent record + holdings → a normalized `{ tier, holdsThree,
  vanity, address, pulse }` descriptor; and renderers for each fidelity. **One source
  of truth for tier math and identity** — Task 04/05/09 will reuse it.
- Fetch holdings once per agent, cache per-page, share across surfaces (a small store
  keyed by agent id). Many cards on one page must not each hit the API.
- 3D aura: prefer instanced/GPU-cheap effects; cap active high-fidelity auras
  on-screen and downgrade the rest. Pause all animation when tab hidden /
  `prefers-reduced-motion`.

## UX spec

- **States**: loading (skeleton nameplate, no aura), empty wallet (plain avatar +
  owner-only "Fund your agent" nudge, visitor sees a neutral plate), populated
  (tier + identity), error (silent visual fallback to plain — never a broken effect),
  live event (a single tasteful pulse, debounced).
- **Viewer roles**: owner can open the hub from the nameplate and toggle display
  preferences (persist to the agent record, owner-only route); visitor's plate is
  read-only with copy + explorer + Tip; logged-out sees read-only + connect on Tip.
- **Microinteractions**: hover the nameplate → expand to full address + copy; the
  vanity prefix/suffix uses the emphasized violet token; tier transitions animate.
- **Accessibility**: the nameplate is real text (screen-reader legible), not only a
  texture; aura is decorative (`aria-hidden`); all of it has a non-animated fallback.
- **Performance**: a hard frame budget in worlds; measure with many avatars; lazy-load
  the 3D effect module; never block first paint of the avatar on wallet data.

## Edge cases

No wallet yet (provisioning) · RPC failure / rate-limit · zero balance (real 0, not
hidden) · enormous holdings (bucket caps out, no overflow) · very long vanity ·
hundreds of avatars in one world · tab backgrounded · reduced motion · visitor vs
owner vs logged-out on the same avatar.

## Definition of done

Meets the README DoD, plus: the same agent looks identical (data-wise) across hero,
card, and world; a real trade/tip produces a real-time pulse; owner display toggles
persist via a real owner-only endpoint; worlds stay smooth with many avatars; no
precise net-worth is ever floated over an avatar; nothing fake anywhere.

## Then: improve, then delete this file

After it works, push it further — e.g. a "fund your agent to light it up" first-run
moment, a subtle $THREE-holder signature, or wiring the pulse to Task 08's economy
feed. Add the polish that makes people screenshot it. Update `data/changelog.json`.
**Then delete this prompt file** — the code is the artifact now.
</content>
