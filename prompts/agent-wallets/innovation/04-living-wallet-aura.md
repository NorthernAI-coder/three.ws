# Task 04 — Living Wallet Aura: the agent's body reacts to its economy

> Read [00-README-innovation.md](./00-README-innovation.md) first. This is the
> presentation layer — it consumes real wallet data and drives the existing 3D/AR
> avatar rendering. Reuse the viewer; don't fork it.

## The screenshot moment

You tip an agent and its 3D body **erupts** — a burst of light, coins spiraling up,
a satisfied animation, a soft chime — live, on the very avatar you're looking at,
whether on its profile, in the marketplace, or standing in your room in AR. A whale
agent radiates a visible aura; a dormant one is dim. The wallet stops being a number
in a corner and becomes the agent's *life force*, visible everywhere it appears.

## What you're inventing

A real-time mapping from **wallet state → avatar expression**, applied consistently on
every surface an agent renders (2D card, 3D viewer, AR/IRL), driven entirely by real
on-chain data, performant and tasteful.

## Build it

**Signal layer (real data, one source)**
- `src/shared/wallet-aura.js`: a single module that subscribes an agent to its real
  economic signals and emits normalized aura state `{ balanceTier, momentum, lastEvent }`.
  Sources (all real): balance + USD (`GET /api/agents/:id/solana`, the chip's normalizer),
  live activity (`…/solana/activity`), tips as they settle (`src/shared/agent-tip.js`),
  earnings (`agent_revenue_events`). Poll politely (server already caches ~60s), dedupe,
  and **stop polling offscreen / on `visibilitychange`** — no balance storms in lists.
- Map to visuals deterministically: balance tier → aura color/intensity (route through the
  violet wallet accent token; no scattered hex), incoming tip → a one-shot "coin burst"
  event, earning streak → sustained glow, trade P&L → subtle mood. Document the thresholds.

**Avatar expression (reuse the renderers)**
- 3D/viewer (`src/viewer.js`, `avatar-sdk/`, `<model-viewer>`): an aura shader/glow +
  a pooled coin-burst particle effect + an optional emote animation on tip. GPU-light,
  capped particle counts, `prefers-reduced-motion` → a tasteful static treatment.
- 2D chip/card: the existing chip gets a subtle, performant aura ring + a non-janky
  "+◎0.25" toast on a real incoming tip. No layout shift.
- AR/IRL (`src/irl.js`, `src/ar/webxr.js`): the same burst/aura in world space when a
  placed agent is tipped — the killer demo. Battery/thermal-aware.

**Sound (optional, off by default, real)**
- A short, tasteful chime on real tip receipt, behind a user toggle, respecting autoplay
  policy. Never loop, never surprise-blast.

## Innovate further
- **Tip choreography:** the tipper briefly sees the agent react *to them* (eye contact /
  wave) — a genuine moment of connection that makes people tip again.
- **Milestone moments:** first tip, 100th tip, new ATH balance trigger a special,
  rare animation + an auto-generated shareable clip/OG frame.

## Guardrails
- Performance first: 60fps on trending/galaxy with many agents (instancing, LOD, lazy
  particle systems, one shared ticker). Reduced-motion and low-power paths are real, not
  afterthoughts. Aura reflects only real, current data — no decorative fake activity. An
  agent with no wallet shows nothing (no fake aura).

## Definition of done
Per the README checklist. Prove live: tip an agent and watch its body react in 3D AND in
AR; confirm aura tiers match real balances; confirm polling stops offscreen and there's no
jank with a full list. Add your improvement, summarize, then delete this file
(`prompts/agent-wallets/innovation/04-living-wallet-aura.md`).

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/agent-wallets/innovation/04-living-wallet-aura.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
