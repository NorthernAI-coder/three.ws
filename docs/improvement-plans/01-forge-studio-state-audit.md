# Task: Make the Forge 3D studio flawless in every state

You are a senior engineer on three.ws. Follow `CLAUDE.md` (auto-loaded). Non-negotiables:
$THREE is the only coin; no mocks/placeholders/stubs/fake-loading; real APIs only;
every state designed; add tests; add a `data/changelog.json` entry for user-visible
changes; do not break the existing architecture. Read before you write.

## Why this matters

The forge (text/image/sketch → textured, rig-ready GLB) is the front door of the
platform. A user's first impression is this funnel. Any blank void, un-handled
error, or dead button here costs us the user. The goal is to make every reachable
state intentional and polished, and to eliminate dead paths — without changing the
generation pipeline's behavior.

## What exists today — read these first

- UI: [src/forge-studio/](../../src/forge-studio) — `create-prompt.js`, `forge-dropzone.js`,
  `forge-pay.js`, `forge-export.js`, `forge-gameready.js`, `forge-optimize.js`,
  `forge-enhance.js`, `forge-embed-panel.js`, `forge-ar.js`.
- Tiers/backends: [api/_lib/forge-tiers.js](../../api/_lib/forge-tiers.js) — the single
  source of truth for tiers (draft/standard/high), backends, free-first routing,
  and pricing. **Do not duplicate these numbers in the UI — read them from the
  catalog (`buildCatalog()`).**
- Providers: [api/_providers/](../../api/_providers) (nvidia, huggingface, meshy, tripo,
  rodin, stability, gcp self-host lanes).
- SDK: [packages/forge/](../../packages/forge).

## Goal

Audit the entire forge flow and bring every state to a screenshot-worthy bar, with
zero dead paths. Behavior of the generation pipeline itself stays identical.

## Scope

1. **State matrix.** For each step (prompt entry → tier/backend pick → submit →
   queued/running progress → result → export/embed/AR), design and verify:
   loading (skeleton, not spinner where a layout is known), empty, error
   (actionable: what failed + how to recover/retry), populated, and overflow
   (very long prompt, 0 results, a failed reconstruct).
2. **Real progress only.** Generation is async (submit → poll). Ensure the progress
   indicator reflects real poll `progress`/`status`, never a fabricated timer.
   Wire ETA from `estimateEtaSeconds()` as an estimate label, clearly an estimate.
3. **Dead-path sweep.** Every button/link reachable in the studio must do something
   real. If `high` tier or an export needs $THREE hold-or-pay, the gated state must
   explain the gate and offer the real unlock path — never a silent no-op.
4. **Pricing honesty.** All prices/credits/ETAs shown come from the catalog, not
   hardcoded strings. A tier change updates the displayed cost live.
5. **Accessibility + microinteractions.** Semantic HTML, ARIA on interactive
   controls, keyboard nav, focus rings, hover/active states, opacity/transform
   transitions on state change. Responsive at 320 / 768 / 1440.

## Guardrails

- Don't touch provider request bodies or routing logic except to surface state.
- Don't hardcode any tier/price/credit number — read the catalog.
- Keep the free-first default intact (draft/standard route to free lanes).

## Definition of done

- [ ] Every step has a designed loading/empty/error/populated/overflow state.
- [ ] `npm run dev`, exercised in a browser: no console errors/warnings from your code.
- [ ] Network tab shows real forge API calls; progress tracks real poll status.
- [ ] No dead buttons or links; gated states explain the gate and the unlock.
- [ ] Prices/ETAs render from `buildCatalog()`, update on tier change.
- [ ] `npm test` green; new tests cover the state logic you added.
- [ ] `data/changelog.json` entry added; `npm run build:pages` passes.
