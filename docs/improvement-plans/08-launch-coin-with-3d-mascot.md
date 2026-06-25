# Task: Forge a 3D mascot and carry it through a $THREE-only launch flow

You are a senior product engineer on three.ws. Follow `CLAUDE.md` (auto-loaded).
Read the coin rules carefully: **$THREE is the only coin this platform promotes.**
CA `FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`. Never name, hardcode, link, or
recommend any other token in code, copy, fixtures, or docs. The pump.fun launcher is
a generic, coin-agnostic tool where the **user supplies the mint at runtime** — that
is the one allowed mechanical exception, and you must never hardcode or market a
specific non-$THREE mint. Also: no mocks/placeholders; real APIs; every state
designed; add tests; changelog for user-visible changes; don't break the architecture.

## Why this matters

3D + crypto is our wedge. A creator launching a token through the generic launcher
currently has no identity for it. Letting them **forge a 3D mascot** for their launch
— a rigged avatar that becomes the coin's face across its launch detail page, agent
profile, and share cards — fuses the two halves of the platform into one flow that
nothing else offers.

## What exists today — read these first

- Launch + pump surfaces: [api/pump/](../../api/pump) (`launch-prep.js`,
  `launch-agent.js`, `launch-detail.js`, `launch-og.js`), [src/pump/](../../src/pump),
  `src/agent-home-pumpfun.js`. Platform launch records live in `pump_agent_mints`
  (the `/launches` feed + `/api/pump/launches`) — these render user launches at
  runtime and are a product feature, not an endorsement.
- Forge → rigged avatar: `forge_avatar` / the forge pipeline; [src/forge-studio/](../../src/forge-studio).
- 3D coin surface: [src/coin3d/](../../src/coin3d), [src/mint/](../../src/mint).

## Goal

A flow where a creator forges a rigged 3D mascot and attaches it to a launch they
create through the generic launcher. The mascot then renders on the launch detail
page, the agent profile, and the share/OG card — driven by the platform's own launch
records, at runtime, with the mint supplied by the user.

## Scope

1. **Forge-in-flow.** From the launch creation flow, let the user forge (or pick an
   already-forged) rigged mascot. Reuse the existing forge pipeline; don't rebuild it.
2. **Attach.** Associate the forged GLB with the launch record (the user-supplied mint)
   in the existing launch-records store. Inspect `pump_agent_mints` / launch-prep
   before adding fields; extend, don't fork.
3. **Render everywhere.** Show the 3D mascot (live `<agent-3d>` viewer) on the launch
   detail page and agent profile, and bake a still into the OG/share card so links
   preview with the mascot.
4. **States.** No-mascot-yet state (offer to forge one), forging progress (real poll),
   render fallback if the GLB fails to load (a designed placeholder, never a blank).
5. **Honesty.** All copy is coin-agnostic plumbing. The flow never names, suggests, or
   markets any specific token; $THREE remains the only coin the platform promotes.

## Guardrails

- **Never** hardcode, embed, or recommend any non-$THREE mint anywhere — source, copy,
  fixtures, OG text, tests. User-supplied runtime mint only.
- Reuse the forge pipeline and the existing launch-records data model.
- The 3D viewer must lazy-load; the launch page must not regress its load performance.
- Tests/fixtures use $THREE's CA or a clearly-synthetic placeholder — never a real
  third-party mint.

## Definition of done

- [ ] Forge/pick a rigged mascot from the launch flow and attach it to the launch record.
- [ ] Mascot renders live on launch detail + agent profile, and as a baked OG/share image.
- [ ] No-mascot / forging / load-fail states designed.
- [ ] Zero references to any coin other than $THREE anywhere in the diff.
- [ ] `npm run dev` exercised; real launch-records + forge calls; no console errors.
- [ ] `npm test` green; tests cover attach + render-fallback, fixtures coin-safe.
- [ ] Changelog entry; `npm run build:pages` passes.
