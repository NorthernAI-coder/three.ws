# Task 07 — The Net-Worth-Reactive Avatar (the agent wears its wallet)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** for the
> ownership model, design tokens, real APIs, hard rules, definition of done, and the
> "improve then delete this file" close-out. Builds on the shared wallet identity
> layer (**task 01**) for real balances/holdings and the live event/poll source.

## Why only three.ws can build this

Every other wallet shows a number on a card. We are the one platform where a real,
funded, self-custodial wallet is welded to a **rigged, talking, ownable 3D agent.**
So the wallet stops being a number and becomes the agent's **body**: an agent that is
doing well *looks* like it. Wealth, reputation, and live on-chain events become the
agent's appearance, animation, and aura — in the profile viewer, the galaxy, AR/IRL,
everywhere it is rendered. This is the moat feature; if a competitor could ship it,
you have not gone far enough.

## Mission

Drive the agent's **3D embodiment from its real on-chain state.** Holdings, lifetime
tips, fork count, realized P&L, and live events (a tip landing, its coin pumping, a
snipe filling) change how the avatar looks and moves — every reaction triggered by a
real chain read or a real confirmation, never a timer or a decorative-only loop.

## What exists (read it before building — do NOT reinvent)

- **Avatar render + animation:** [src/shared/agent-3d.js](../../src/shared/agent-3d.js)
  (the shared 3D component factory) and
  [src/agent-avatar.js](../../src/agent-avatar.js) (the performance layer — lip-sync,
  gestures, emotion states). Hook your reactions into the existing emotion/animation
  API; do not bolt on a parallel renderer.
- **Accessories / wearables:** [public/accessories/](../../public/accessories) and the
  avatar appearance/equip pipeline. Cosmetic unlocks must be real equippable assets,
  not painted-on overlays.
- **Real wallet state:** the task 01 normalizer + `GET /api/agents/:id/solana`,
  `/solana/holdings`, lifetime tips / fork counts (real DB rows), and the live
  pulse/event source task 01/02 established. Reuse it — one source of truth for "what
  is this wallet worth right now."
- **Surfaces:** avatar page, agent detail, galaxy, IRL/AR/XR
  ([src/irl.js](../../src/irl.js), [src/xr.js](../../src/xr.js),
  [src/walk.js](../../src/walk.js)) — wherever the 3D body renders.

## What the reactive avatar must do (all driven by real data)

1. **Wealth → presence.** Map real portfolio value / reputation to tasteful,
   non-gaudy embodiment: an aura intensity, a material/emissive tier, an idle-pose
   confidence, an equipped cosmetic tier from real `public/accessories` assets. Tiers
   unlock from **real** thresholds (lifetime tips, holdings, fork count) — show the
   real number that unlocked each. Never invent a tier from a fake balance.
2. **Live event reactions.** When a real event fires — a tip confirms, the agent's
   coin crosses a market-cap step, a snipe/trade fills — the avatar performs a short,
   purposeful animation (celebrate, flex, glance-up) via the existing emotion API,
   triggered by the **real confirmation** from task 01/02's event source. A drawdown
   or a swept wallet reads as subdued, not punishing. No reaction without a real event.
3. **Reputation regalia.** Forks-of-this-agent, lifetime tip volume, and realized P&L
   (real counts) earn legible, ownable cosmetic marks. The avatar's look becomes a
   trust signal a visitor can read at a glance, and the marks link back to the real
   numbers (and to the wallet HUD).
4. **Cross-surface coherence.** The same agent looks the same everywhere — its current
   "net-worth look" is derived from one normalizer, so the galaxy star, the profile
   hero, and the AR body agree. One agent, one body, one truth.
5. **Owner control.** The owner can dial reactivity (subtle ↔ expressive) and opt
   specific signals in/out (e.g. hide balance-driven aura while keeping tips). Persist
   the preference on the agent record. Visitors see the agent as the owner configured
   it — never a forced flex.

## Innovation mandate

- Make it **screenshot-worthy and tasteful** — this is presence, not a slot machine.
  Respect `prefers-reduced-motion`; the look must read even with motion off.
- Invent the mapping that makes wealth *feel* embodied without being garish. The best
  version makes a well-funded, well-tipped agent simply look *alive and confident*.
- Wire the connection upward: a reaction should deep-link to the wallet HUD (task 02)
  and to the moment that caused it (the tip, the fill) in the activity trail.

## Real-data & safety rules

- Every visual traces to a real chain read, a real confirmation, or a real DB count.
  No mock balances, no decorative-only animation, no fake "pump" celebrations.
- Never render a secret. Public state only.
- Performance: this runs in dense galaxy scenes and on mobile AR. Reactions must be
  cheap, batched/lazy, and stop offscreen / on `visibilitychange`. Hold 60fps; degrade
  gracefully on low-end GPUs (a quieter look, never a stutter).

## States & edge cases (all designed, all honest)

Empty/zero-value wallet (a calm baseline look, never "poor-shamed"); provisioning in
progress; brand-new agent with no reputation; an agent mid-drawdown; 0 / 1 / 1000
agents in the galaxy at once; reduced-motion; low-end device; the real event source
briefly unavailable (hold last real state, don't invent one).

## Definition of done

Per the orchestration README's checklist. Plus: a real tip confirming makes the real
agent visibly react in at least the profile viewer and the galaxy; wealth/reputation
tiers are derived from real numbers and shown with their source; the owner reactivity
control persists and is respected for visitors; 60fps held with the reaction system
on; reduced-motion fully supported; no console errors/warnings.

When done: run the self-review + improvement pass, add a real changelog entry,
`npm run build:pages` to validate, commit (staging explicit paths only; push to
**both** `threeD` and `threews` if asked), then **delete this file**
(`prompts/agent-wallets/07-net-worth-reactive-avatar.md`).
