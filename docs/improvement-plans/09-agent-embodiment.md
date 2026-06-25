# Task: Give every agent a forged, rigged 3D body that follows it everywhere

You are a senior product engineer on three.ws. Follow `CLAUDE.md` (auto-loaded).
Non-negotiables: $THREE is the only coin; no mocks/placeholders; real APIs; every
state designed; add tests; changelog for user-visible changes; don't break the
architecture.

## Why this matters

Agents are the platform's core noun, and we can forge and rig 3D avatars. Right now
an agent's 3D body isn't consistently present across surfaces. Making each agent's
rigged avatar a first-class, reused asset — visible on its profile, as a walk
companion, as a page-agent guide, in scenes — makes the whole platform feel alive
and connected, which is exactly the "everything is linked" quality bar.

## What exists today — read these first

- Agent surfaces: [src/agents/](../../src/agents), `src/agent-home.js`,
  `src/agent-detail.js`, `src/agent-avatar.js`, `src/attach-avatar-to-agent.js`,
  `src/agent-identity.js`.
- Embodiment SDKs: [walk-sdk/](../../walk-sdk) (corner mascot + playground),
  [page-agent-sdk/](../../page-agent-sdk) (talking 3D page guide, rigged-only),
  [avatar-sdk/](../../avatar-sdk) (`<agent-3d>` viewer).
- Forge → rigged avatar: `forge_avatar` / the forge pipeline.

## Goal

Each agent has one canonical rigged GLB, reused across every surface that renders it.
Forge-or-pick once; appear consistently as profile hero, walk companion, page-agent,
and scene actor — all reading the same asset, never re-generating or diverging.

## Scope

1. **Canonical avatar field.** Establish/confirm a single source of truth for an
   agent's rigged avatar GLB (inspect `attach-avatar-to-agent.js` + the agent data
   model first; extend, don't duplicate). One asset, referenced everywhere.
2. **Forge-or-pick.** From agent edit/profile, forge a new rigged avatar (reuse the
   pipeline) or pick an existing one, and set it as the agent's canonical body.
   Humanoid gate respected; non-humanoid handled per the documented fallback.
3. **Reuse across surfaces.** Wire the same GLB into: profile hero viewer (`<agent-3d>`),
   the walk companion, the page-agent guide, and as a scene actor. No surface should
   generate its own — all read the canonical field.
4. **States.** No-avatar state (offer to forge/pick), forging progress (real poll),
   load-failure fallback (designed placeholder body, never blank/T-pose for a valid rig).
5. **Performance.** Lazy-load the viewer; cache the GLB; don't regress profile load.

## Guardrails

- One canonical asset reused — do not fork per-surface avatar storage.
- Reuse walk-sdk / page-agent-sdk / avatar-sdk as-is; pass them the canonical URL.
- Keep the universal-rig guarantees (canonicalize + retarget) intact.

## Definition of done

- [ ] Single canonical rigged-avatar reference per agent; all surfaces read it.
- [ ] Forge-or-pick sets the canonical body from agent edit/profile.
- [ ] Same avatar appears as profile hero, walk companion, page-agent, scene actor.
- [ ] No-avatar / forging / load-fail states designed.
- [ ] `npm run dev` exercised across the surfaces; no console errors; real calls.
- [ ] `npm test` green; tests cover the canonical-field read + surface wiring.
- [ ] Changelog entry; `npm run build:pages` passes.
