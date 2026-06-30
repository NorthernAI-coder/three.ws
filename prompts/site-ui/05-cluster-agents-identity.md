# Site UI — cluster: agents & identity

You are working in `/workspaces/three.ws`. Apply the shared game-feel library to the
**agent, character & identity** surfaces — profiles, pickers, the avatar creator, and the
first-meet/onboarding moments. These are where users meet and build characters; the
polish here is the platform's first impression.

**Prerequisite:** `src/ui-juice.js` from `prompts/site-ui/01-foundation-juice-library.md`.
Run that first if it's missing.

## Surfaces in this cluster

`src/agent-detail.{js,css}`, `src/agent-picker.{js,css}`, `src/character.{js,css}`,
`src/characters.{js,css}`, `src/character-creator.{js,css}`,
`src/avatar-gallery-picker.{js,css}`, `src/first-meet.{js,css}`, `src/theater.{js,css}`,
`src/three-gate.{js,css}`.

Many of these render 3D (Three.js / GLB). **Do not regress the 3D rendering or animation
pipeline** — the avatar-animation rules in CLAUDE.md are load-bearing. Game-feel here is
the surrounding UI chrome, transitions, and stats, not the 3D internals.

## The treatment (apply what fits each surface)

1. **Profile stats with life.** `agent-detail`: reputation, P&L, trade counts, earnings → `countUp` + `flashValue` on live/refreshed values; `ring` for reputation/win-rate; `sparkline` for any real history. Cross-link to the agent's swarms/launches/leaderboard standing (wire the connections — CLAUDE.md's integration check).
2. **Pickers & galleries.** `agent-picker`, `avatar-gallery-picker`, `characters`: smooth selection states, hover/focus affordances, `enterRow`/stagger on grid population, `flipReorder` on filter/sort. Designed empty + loading (skeleton) states.
3. **First-meet / onboarding.** `first-meet`: intentional enter/exit transitions, a warm real success beat (`rippleOnce`) on completion — no fake loading. This is the first impression; make it screenshot-worthy.
4. **Creator flow.** `character-creator`: honest in-flight states for real generation/rigging calls (no simulated progress), inline validation, polished step transitions.
5. **Gate.** `three-gate` ($THREE hold-gate): clear locked/unlocked states, real balance-driven, a satisfying unlock transition.
6. **State coverage + consistency.** All states designed; tokens from `public/tokens.css`; hover/active/focus everywhere; match `/swarms` vocabulary.

## Rails (non-negotiable)

- Tokens only. No raw hex/px/ms where a token exists.
- Reduced motion verified (token override + library final-state paths).
- **No fake data, no fake progress** — generation/rigging/gate status from real calls and real balances only.
- **Do not touch the 3D/animation internals** beyond the surrounding UI; if a change risks the avatar pipeline, stop and flag it.
- Concurrent agents edit `main`: stage explicit paths only, re-check `git status`, never `git add -A`.

## Definition of done (per surface)

- `npm run dev`, exercise the real surface (load a real agent/character, run a real pick/create/gate flow). 3D still renders and animates correctly. No console errors.
- All states verified; cross-links resolve to live routes.
- Reduced-motion verified. `npm test` passes.
- `data/changelog.json` entry per surface (or batched), tag `improvement`.
- Review your `git diff`. Don't commit unless asked.

Track with TodoWrite (one item per surface); report done vs deferred.
