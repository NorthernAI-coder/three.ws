# 20 · Unify every list/feed on the shared state-kit

> **Phase 4 — Frontend excellence** · **Depends on:** none · **Parallel-safe:** yes · **Effort:** M

## Mission
CLAUDE.md mandates that *every* state is designed (loading/empty/error/populated/overflow). The audit
found only ~⅓ of major list surfaces use the shared `src/shared/state-kit.js`; others either
re-implement states ad-hoc (`launches.js`, `radar.js`, `oracle.js`) or have **no states at all**
(`/activity`, `/coin-intel`, `/trending`, `/feed`, `/animations`, gallery picker). Make state-kit the
single, mandatory path so no surface ever shows a blank void or a bare spinner.

## Context (read first)
- `CLAUDE.md` UI/UX standards + Definition of Done.
- `src/shared/state-kit.js` (`skeletonHTML`, `emptyStateHTML`, `errorStateHTML`, `ensureStateKitStyles`).
- Compliant examples to mirror: `src/forge-showcase.js`, marketplace, agent-detail, dashboard-next pages.
- Non-compliant: `/activity`, `/coin-intel`, `/trending`, `/feed`, `/animations`, `gallery-picker`; ad-hoc: `launches.js`, `radar.js`, `oracle.js`.

## Build this
1. **Migrate the ad-hoc surfaces** (`launches.js`, `radar.js`, `oracle.js`) to state-kit so empty/error/loading look consistent platform-wide; delete the bespoke `renderEmpty/renderError` duplicates.
2. **Add states to the bare surfaces** (`/activity`, `/coin-intel`, `/trending`, `/feed`, `/animations`, gallery picker): skeleton on load, helpful empty state (tells the user what to do next + a CTA), actionable error state (what failed + a retry).
3. **Overflow/long-content states** — long names, huge counts, 0 vs 1 vs 1000 items all render gracefully (truncation, pagination hooks).
4. **Make it enforceable** — a lightweight contract (e.g. every feed render goes through a `renderList({container, state, items, empty, error})` wrapper) and an audit/test that flags a list-rendering module not using state-kit.
5. **Verify in the browser** — `npm run dev`, exercise each surface's empty/error/loading by forcing the conditions; no blank screens, no console errors.

## Files likely in play
`src/shared/state-kit.js` (extend if needed), `src/launches.js`, `src/radar.js`, `src/oracle.js`, `src/activity*.js`, `src/coin-intel*.js`, `src/trending*.js`, `src/feed*.js`, `src/animations-gallery.js`, `src/gallery-picker*.js`, an audit script + test.

## Definition of done
- [ ] Every list/feed surface uses state-kit; no ad-hoc duplicates remain.
- [ ] Loading (skeleton, not spinner), empty (helpful + CTA), error (actionable + retry) designed for each.
- [ ] 0/1/many + long-content cases verified.
- [ ] Audit/test flags non-compliant list modules; wired to CI.
- [ ] Verified in a real browser; no console errors/warnings.
- [ ] Changelog: **improvement** entry ("consistent, helpful empty/loading/error states across the app").

## Guardrails
Follow CLAUDE.md. No mocked data to "show" populated states — wire real fetches. Push both remotes.
