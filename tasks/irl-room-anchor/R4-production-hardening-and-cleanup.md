# R4 — Production hardening, dead-code/realtime reconcile, Definition-of-done sweep

> Epic R · Size **M** · Touches `src/irl.js`, `api/irl/pins.js`, `multiplayer/*`,
> `src/irl-net.js`, `data/changelog.json`. Runs after R1–R3. See README.

## Goal

Take the room feature from "works" to **100% production-ready, zero-error,
complete**: every state designed, accessibility and performance solid, security
and abuse limits in place, the now-dormant realtime additions reconciled (no dead
code that implies a live pin stream), the deploy verified live, and a clean
changelog. This is the task that earns the user's bar.

## Why it matters

The engine is sound and R1–R3 deliver the UX, but "production-ready, zero error"
is its own discipline: it's the empty states, the failure paths, the keyboard
users, the dense-crowd frame budget, the abuse caps, and proving the code is
actually live (this codebase has shipped features that 404'd behind a stale
deploy). Skipping it is exactly the "good enough" CLAUDE.md forbids.

## What to build / verify

### 1. Reconcile the dormant realtime layer (zero dead code)

The realtime pin transport was removed (rooms ride the REST proximity read). The
room fields added to the realtime path are now inert:

- `multiplayer/src/irl-schemas.js` — `IrlPin` room fields (append-only).
- `src/irl-net.js` — `_pinToObj` room fields (if still present after concurrent edits).
- `src/irl.js` — `normalizeStreamPin` room fields.

**Decision required, then execute it cleanly:** either (a) **remove** these and
the comments that imply a live pin stream, since pins don't sync over the socket;
or (b) **keep** them only if a deliberate, documented plan re-enables room
`pin:update` for live room-calibrate propagation — in which case wire it end to
end and test it. Do not leave ambiguous half-wired code. Coordinate with whoever
owns the IRL privacy lockdown (it actively edits these files). Default to (a)
unless live room sync is explicitly wanted.

- Confirm room-calibrate (R2) propagation matches the chosen transport: under
  REST-only, a calibrated room updates other viewers on their next poll
  (~10 s) — make that latency honest in the UI, or implement the documented live
  path. No silent "instant" claims that aren't true.

### 2. Every state, every surface (R1–R3 sweep)

Audit each new surface (aim HUD, distance control, room badge, management sheet,
room-calibrate, WebXR reticle) for: skeleton/loading, empty, error (actionable),
populated, and overflow (e.g. a room with 40 agents — the per-cell density cap).
Reuse `src/shared/state-kit.js` where the dashboard does. No blank voids, no raw
spinners where a skeleton fits.

### 3. Accessibility + responsive

- Keyboard path through the whole flow (enter mode → aim → place → manage →
  align → exit); visible focus rings; ARIA on reticle/slider/buttons/badge;
  `aria-live` for count + status changes; `prefers-reduced-motion` respected.
- 320 / 768 / 1440 layouts; thumb-zone controls; clear of the iOS home indicator
  and the notch.

### 4. Performance (dense rooms)

- Room pins must ride the existing LOD/impostor/load-queue budget (E2) — they go
  through `spawnNearbyPin`/`enforceLOD` already; confirm a 30-agent room holds
  frame rate via `window.__irlSeedRoom()` + `window.__irlPerf()` and the headless
  recipe. No per-frame allocations in `pinWorldPos`/the ghost-preview loop;
  reuse vectors. Debounce the distance-slider re-projection sensibly.

### 5. Security / abuse / privacy

- Room placements respect the existing per-cell density cap (`MAX_PINS_PER_CELL`)
  and per-owner caps; a single actor cannot carpet a venue under a room id.
- `room_id` is validated (`ROOM_ID_RE`) and never rendered as HTML unescaped
  (use `_escHtml`).
- Room-calibrate is owner-gated server-side for **every** pin in the room (R2);
  re-verify no path lets a non-owner move a cluster.
- No `user_id`/`device_token` in any room projection; bbox stays internal-only.
- $THREE-only guard intact on any new captions/labels.

### 6. Deploy verification (prove it's live)

- After deploy, confirm the six room columns exist (the inline `ALTER` runs on
  first request) and `GET /api/irl/pins?lat&lng` returns the room fields in prod
  — not just locally. The repo has a history of stale deploys masking shipped
  endpoints; check the live deployment actually serves the new code.

### 7. Changelog + final sweep

- Append holder-readable entries to `data/changelog.json` (plain language: "place
  AI agents at fixed spots around a real room"), tags `feature`/`improvement`;
  run `npm run build:pages` (it validates + regenerates). After deploy,
  `npm run changelog:push` (skip silently if creds absent locally).
- Run the full Definition-of-done checklist from the README against the running
  app. `npm run typecheck` clean; `npm test` green; `vite build` clean; no
  console errors/warnings from our code; `git diff` reviewed line-by-line.

## Definition of done

- The dormant realtime layer is resolved (removed or fully wired + tested) — no
  dead/misleading code remains.
- Every new surface has all states; full keyboard + ARIA; responsive; reduced-
  motion safe. A 30-agent room holds frame budget.
- Abuse/ownership/privacy limits verified client + server. Deploy verified live
  (columns + projection serving in prod). Changelog shipped. Full DoD met.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-room-anchor/R4-production-hardening-and-cleanup.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
