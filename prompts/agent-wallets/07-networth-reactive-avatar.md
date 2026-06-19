# Task 07 — The Net-Worth-Reactive Avatar (the agent wears its wallet)

> **Read [00-README-orchestration.md](./00-README-orchestration.md) first** — the
> invention bar especially ("why can only three.ws do this?"), the ownership model,
> tokens, real APIs, hard rules, and the "improve then delete this file" close-out.
> Depends on the real balances/holdings from **task 01**.

## Mission

This is the feature no wallet on earth can copy, because no wallet is welded to a
rigged, ownable, 3D character: **the avatar physically reflects its wallet.** A
funded, profitable agent *looks* funded — a visible, tasteful, real-data-driven
transformation of the 3D model. Walk into the marketplace or the galaxy and you can
*see* which agents are wealthy and which are dormant, because their bodies say so.

Answer the invention question up front: only three.ws can do this because only here
is a real, self-custodial wallet bound to a real-time 3D avatar. Hold that bar — this
must be jaw-dropping and 100% driven by real chain data, never decorative.

## What exists (read it before building)

- 3D rendering stack: Three.js + glTF/GLB, model-viewer, the avatar viewer
  ([src/avatar-page.js](../../src/avatar-page.js)), the galaxy
  ([src/galaxy.js](../../src/galaxy.js)), and the shared avatar web component.
  Understand how avatars are loaded, lit, and animated before adding to them.
- Real wallet state: `GET /api/agents/:id/solana` + `/api/agents/:id/solana/holdings`
  (total USD value, asset mix), reputation/tip counts, and 24h change from task 01's
  data contract. Reuse task 01's normalizer — do not refetch differently per surface.

## What the reactive layer must do

Define a **real wallet -> visual mapping** and apply it consistently wherever the
avatar renders (viewer, marketplace, galaxy, profile, cards). Every visual is a pure
function of **real** wallet state — change the wallet, the look changes; no random,
no fake.

1. **Net-worth tiers -> presence.** Real total USD value maps to a tasteful, tiered
   treatment: e.g. an aura/rim-light intensity, particle density, a subtly richer
   shader, or an emissive accent in the wallet-violet family. Define clear, honest
   thresholds from real value (and degrade gracefully to a clean baseline for an
   empty wallet — dormant, not ugly).
2. **Asset mix -> palette/accents.** The real composition of holdings (SOL / USDC /
   $THREE / other SPL) subtly informs accent color or accessory — derived from real
   proportions. `$THREE` is the only coin named/featured; other holdings influence the
   look generically from runtime data.
3. **Live reaction to real events.** A real confirmed inflow (tip, trade fill,
   deposit) triggers a one-shot, event-driven flourish on the model — only on a real
   on-chain event, never on a timer. A drawdown reads honestly too (not punitive —
   tasteful).
4. **Reputation -> adornment.** Lifetime tips / volume / fork count (real DB counts)
   can unlock subtle, earned adornments. Honest scarcity, computed from real data.

## Innovation mandate

- **Legible wealth across the whole app.** In the galaxy and marketplace, a glance
  tells you who's funded — because the avatars themselves say so, from real balances.
  This turns the wallet into the most shareable thing on the platform.
- **Performance is the craft.** This renders in dense lists and a 60fps 3D galaxy.
  Use shader-level / instanced effects, LOD, and lazy hydration; never tank frame
  rate. The transformation must be smooth, GPU-friendly, and respect
  `prefers-reduced-motion`.
- **Owner pride, visitor envy.** A creator watching their agent level up as it earns
  is a retention loop. A visitor seeing a glowing agent is a conversion loop (-> fork
  to own, task 04). Wire those connections.
- Invent beyond this where it raises the bar — but a single pixel of the effect must
  never be driven by anything but real wallet data.

## States & edge cases (all designed)

Empty/zero wallet (clean dormant baseline, never broken); brand-new agent still
provisioning (baseline until the real address/balance resolves — never a fake value);
huge whale balance (cap the effect tastefully, no eye-searing extreme); rapid balance
changes (debounce visual transitions, no strobing); low-end GPU / mobile (graceful
fallback tier); reduced-motion users (static richer treatment instead of animation);
the same agent must look identical for its wallet state on every surface.

## Definition of done

Per the orchestration README. Plus: the avatar's appearance provably changes with
**real** wallet value (demonstrate by funding/defunding on devnet and watching the
tier change); a real inflow triggers the live flourish; the mapping is consistent
across viewer + marketplace + galaxy; 60fps held with the effect on a populated
galaxy; reduced-motion respected; no console errors; responsive.

When done: self-review + improvement pass, changelog entry, commit (explicit paths
only, push to **both** remotes if asked), then **delete this file**
(`prompts/agent-wallets/07-networth-reactive-avatar.md`).
