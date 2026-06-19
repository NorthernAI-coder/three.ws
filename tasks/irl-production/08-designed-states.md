# Task 08 — Designed states everywhere (no infinite spinners, no blank voids)

**Phase:** 2 (UX / polish) · **Effort:** M · **Files:** `pages/irl.html`, `src/irl.js`, `src/shared/state-kit.js`

## Why
Every surface must have a designed loading, empty, and error state (CLAUDE.md
Definition of Done). Several IRL surfaces today can get stuck on "Loading…" if a
fetch fails, or show a bare void with no next step. These are the moments a user
decides whether the product is trustworthy.

## Read first (verify before fixing)
- Shared state shells — `src/shared/state-kit.js`, `src/shared/async-state.js` (use these)
- My Pins sheet — `pages/irl.html` `#irl-mypins-*` (~1701) + its loader in `src/irl.js`
- Inspect card body skeleton — `pages/irl.html` `#irl-card-body` (~1731) + `loadAgentCard` in `src/irl.js`
- Nearby badge — `pages/irl.html` `#irl-nearby-badge` (~1525) + update logic
- Radar empty state — `pages/irl.html` `.irl-radar` / `.irl-radar-hint`
- WebGL-unsupported fallback — the boot guard in `src/irl.js` + its markup

## Scope — confirm, then fix

1. **My Pins: loading → empty → error.** The "Loading…" placeholder must resolve to
   a skeleton while fetching, a helpful empty state ("You haven't placed any agents
   yet — turn on Camera AR and tap Pin here") when there are none, and a retryable
   error state on fetch failure. It must never sit on "Loading…" forever.

2. **Inspect card error.** If `/api/irl/agent-card` fails, replace the skeleton with
   an in-sheet error + Retry (and still show the minimal known info: name + a link
   to the agent). Never leave a permanent skeleton.

3. **Nearby badge transitions.** Avoid flashing a green "0 nearby" before the first
   proximity read returns; show a muted "locating…" until GPS + first read land,
   then animate to the count. Hide gracefully when not in GPS mode.

4. **Empty radar.** When GPS is ready but no agents are nearby, the radar should read
   as intentionally empty ("No agents nearby — be the first to place one") via the
   existing `.irl-radar-hint`, not a blank dial that looks broken.

5. **Unsupported-device clarity.** The WebGL-unavailable / camera-unavailable states
   should explain the likely cause and the recovery (enable WebGL, try another
   browser) — designed cards, not bare toasts. (Camera-unsupported already routes to
   a guidance sheet; bring the others to the same bar.)

## Implementation guidance
- Route all of these through `state-kit.js` so they share the skeleton/empty/error
  visual language with the rest of the platform. Each error state has a real Retry
  that re-runs the fetch.
- Errors at boundaries: every `fetch` here gets a `.catch` that renders the error
  state — never an uncaught rejection or a stuck spinner.

## Out of scope
Permission/onboarding flow (mostly shipped — see task 09 for copy); a11y (task 07).

## Definition of done
- [ ] Force each fetch to fail (DevTools offline / 500) and confirm every surface
      shows a designed, retryable error — never an infinite spinner. Document the
      surfaces tested.
- [ ] Empty states are helpful and tell the user the next action.
- [ ] No green "0 nearby" flash on load.
- [ ] esbuild clean; `npm test` green; changelog entry ("IRL surfaces now show clear
      loading, empty, and error states").

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-production/08-designed-states.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
