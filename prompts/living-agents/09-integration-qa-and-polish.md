# Task 09 — Integration, QA & polish (make it one living thing)

> Read `prompts/living-agents/00-README.md` and `CLAUDE.md` first. RUN LAST, after Tasks
> 01–08 have merged. Your job is to make the eight features feel like one coherent,
> game-changing product — not eight bolt-ons — and to hold the whole thing to the
> Definition of Done in `CLAUDE.md`.

## Mission

Audit, wire the seams, and polish the entire Living Agents experience end to end so that
the avatar is genuinely present, alive, legible, and trustworthy across the whole platform,
and every promised loop actually closes with real data.

## What to do

1. **End-to-end journeys (real browser, `npm run dev`, port 3000).** Walk these and fix
   every break, dead path, or console error/warning:
   - New user → create agent → companion appears everywhere (02) → chat → watch a memory
     form (01/02) and appear in the Mind Palace (03).
   - Shape personality in Brain Studio (05) → companion re-greets in new voice everywhere.
   - Leave → reflection runs (04) → return to a dream → accept → it becomes a real memory
     (03) and proposes an Autopilot rule (08) → grant scope → action runs with a receipt (08).
   - Mood shifts visibly as real events occur (07).
   - Export the brain, import into a fork, verify provenance + on-chain anchor (06).
2. **Seam-wiring audit.** Confirm every bus event a task *emits* is *consumed* where the
   README promised, and that producers/consumers degrade gracefully. No event goes nowhere;
   no surface waits on a fake event. Confirm one canonical active-agent everywhere (01) —
   no lingering reads of the legacy `cc-avatar` / `walk:companion:avatar` keys.
3. **Real-data audit.** Grep the whole Living Agents surface for violations of `CLAUDE.md`:
   no mock arrays, sample data, `setTimeout` fake loading, TODOs, commented-out code,
   `throw new Error("not implemented")`, or any non-`$THREE` coin/token reference anywhere
   (code, copy, fixtures, tests). Every network call hits a real endpoint with real data.
   Use the `completionist` agent against the changed files.
4. **Performance.** With the companion plus an open Mind Palace plus a live-preview avatar,
   verify the WebGL budget (`src/webgl-budget.js`) holds — no context-loss warnings, no
   jank. Confirm memory queries paginate, bus bursts are coalesced, and offscreen viewers
   lazy-boot. Profile the worst page; fix the worst offender.
5. **Every-state & a11y audit.** Loading (skeletons), empty (actionable), error (recoverable),
   overflow, 0/1/1000+ memories. Keyboard nav and `prefers-reduced-motion` across the 3D
   surfaces. Hover/active/focus on every control. Contrast and ARIA.
6. **Consistency pass.** Shared visual language across companion, Mind Palace, Brain Studio,
   Dreams, Activity — one design system, consistent tokens, consistent memory-type colors,
   consistent provenance UI. It should read as one product.
7. **Tests.** Ensure `npm test` passes; add real integration tests for the cross-feature
   loops (memory recall → bus event; dream accept → memory write; action → signed receipt).

## Definition of done

- [ ] All five end-to-end journeys complete in a real browser with real API calls and zero
      console errors/warnings.
- [ ] Every bus event has a real producer and consumer; one canonical active agent; legacy
      keys gone. `completionist` audit clean.
- [ ] No mocks/fakes/TODOs/foreign-coin references anywhere in the Living Agents surface.
- [ ] WebGL budget holds under the heaviest page; no jank; queries paginate.
- [ ] All states designed; full keyboard + reduced-motion + ARIA coverage; consistent design.
- [ ] `npm test` passes incl. new integration tests; full `git diff` reviewed.
- [ ] A single summary changelog entry if anything user-visible changed during polish;
      `npm run build:pages`.

## Self-improvement pass

Step back and judge the whole as a first-time user and as a senior engineer in a demo room:
what is the ONE thing still keeping this from being screenshot-worthy and genuinely
game-changing? Fix that. Then write a short `docs/` note describing the Living Agents
architecture (the bus contract, the surfaces, the data flow) for future contributors.

## When done

Delete this file. Report the journeys you exercised, what you fixed at the seams, the perf
result, and the one polish item you elevated.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/living-agents/09-integration-qa-and-polish.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
