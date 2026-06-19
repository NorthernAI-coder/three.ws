# P0 — Agent Studio Foundation (shell · store · global presence)

You are a senior engineer + product thinker building **three.ws**, a platform meant to
compete with the best in the world. Read `CLAUDE.md` and `STRUCTURE.md` before writing
anything. Your work here is the **foundation** that five other agents build on — they
depend on the contracts you publish, so get the seams right.

## The vision you are enabling

Agent Studio is the **one central place** where a user authors their entire 3D agent — its
brain, memory, money, body, and skills — and the avatar they edit is rendered **live on
every page of the platform**, reacting to real events. Editing in Studio updates that
presence **instantly, everywhere**, with no save/refresh. You are building the skeleton and
nervous system that makes both of those true. Everything must be **visual** and real.

## Your mission

Ship four things, fully wired, no stubs:

### 1. The Studio route + shell — `/studio`
- New page `pages/studio.html` + entry `src/studio/studio-shell.js`. Add one entry to
  `data/pages.json` (auth-required, indexable false). Wire it into nav where agents live.
- Layout: a **persistent live 3D avatar stage** on one side (reuse the existing `Viewer` from
  `src/viewer.js` and `src/agent-avatar.js` — do not fork rendering), and a **tabbed editing
  surface** on the other with tabs: **Brain · Memory · Body · Money · Skills**. You build the
  shell + empty tab containers with designed empty states; P1–P5 fill the tabs by mounting
  into the containers you expose. Document the mount points clearly in code.
- Responsive: at 320px the avatar collapses to a sticky mini-stage; at 1440px it's a full
  cinematic stage. Keyboard: number keys switch tabs, `Esc` closes panels, focus rings everywhere.
- Loads the caller's agent via `GET /api/agents/me` (auto-creates a default agent — see
  `api/agents.js`). Handles: no agent yet (onboarding CTA), load error (retry), loading (skeleton).

### 2. The shared reactive store — `src/studio/agent-studio-store.js`
This is the integration seam every other agent uses. Build on the existing `src/agent-identity.js`
(`AgentIdentity` with `load/save/update`) — wrap it, don't replace it. Export a singleton `studio`:

```js
studio.agent            // live AgentIdentity
studio.subscribe(fn)    // fn(agent); returns unsubscribe
studio.patch(partial)   // optimistic local merge + debounced PUT /api/agents/:id (real call)
studio.commit()         // flush pending writes immediately; returns Promise
studio.on(event, fn)    // 'brain:change'|'memory:change'|'body:change'|'wallet:change'|'skills:change'
studio.emit(event, data)// other studios call this after they mutate their domain
studio.preview(partial) // ephemeral preview — applies to live avatar WITHOUT persisting
studio.clearPreview()
studio.emitMarket(evt)  // broadcast { type, mint, ... } market/trade events to presence listeners
studio.onMarket(fn)
```
Requirements: optimistic updates with rollback on failed PUT; debounce (~600ms) but flush on
tab change / page unload (`visibilitychange` + `beforeunload`); CSRF token handling consistent
with the existing pattern (see commit `1416805fc` and how `agent-wallet-chip.js` / wallet routes
do CSRF); conflict-safe (if PUT returns a newer `updated_at`, reconcile, don't clobber).

### 3. The global presence element — `src/studio/agent-presence.js`
A framework-agnostic **custom element** `<agent-presence>` that any page can drop in:

```html
<agent-presence data-agent-id="…" data-mode="stage|companion|mini"></agent-presence>
```
- Renders the user's live avatar using the shared `Viewer` + `agent-avatar.js` (emotion blend,
  idle loop from `src/idle-animation.js`, lip-sync already exist — wire them, don't reinvent).
- Subscribes to `studio` so any edit anywhere reflects immediately.
- `mode="mini"` = a small floating companion (bottom-corner, draggable, remembers position);
  `companion` = sidebar size; `stage` = full studio stage.
- Subscribes to `studio.onMarket(...)` and maps event types to avatar reactions via the existing
  emotion system (e.g. `snipe:filled` → celebration, `position:down` → concern). Define a clean
  `reactTo(event)` API; P4/P5 will emit the events. Ship sensible default mappings now.
- **Performance is critical** since this renders on every page: share a single WebGL context where
  possible, pause rendering when offscreen/tab hidden (`IntersectionObserver` + `visibilitychange`),
  cap DPR, lazy-load the heavy Three.js modules. The mini companion must never jank scrolling.

### 4. Schema + API contract
- Migration `api/_lib/migrations/*_agent_studio.sql`: extend `agent_identities.meta` (jsonb) with a
  documented `studio` sub-object that namespaces what P1–P5 store: `brain` (model/provider/graph),
  `body` (outfit/animation refs), `trading` (rules), plus a top-level `studio_version`. Don't break
  existing columns; additive only. Add indexes only if you add queryable columns.
- Extend `PUT /api/agents/:id` in `api/agents.js` to accept and persist the `meta.studio` bag with
  validation (reject unknown top-level keys, size-limit the jsonb). Keep owner-only enforcement.
- Document the exact accepted shape in a header comment so P1–P5 bind to a stable contract.

## Libraries you may adopt (research-backed)
- Keep the main app **vanilla JS** (it is today). The custom element approach avoids dragging React
  into every page. If a sub-studio later wants React, it mounts as an island — your store/presence
  must stay framework-agnostic so both work.
- Reuse what exists before adding deps: `src/viewer.js`, `src/agent-avatar.js`, `src/animation-manager.js`,
  `src/idle-animation.js`, `src/agent-identity.js`, `public/tokens.css`.

## Definition of done
- `/studio` loads the real agent, shows the live avatar, tabs switch, empty states are designed.
- Editing a field (even a temporary debug control you then remove) flows through `studio.patch`,
  hits the real `PUT`, and the avatar/presence updates with no refresh.
- `<agent-presence>` works standalone on a throwaway test page in all three modes with real data.
- No console errors/warnings; `npm test` passes; network tab shows real calls.
- Reviewed `git diff` line-by-line. Changelog entry added.

## Operating rules (override defaults)
No mocks/stubs/TODOs. $THREE is the only coin. Design tokens only. Stage explicit paths
(never `git add -A`); re-check `git status`/`git diff --staged` before commit — other agents are
editing `main` concurrently. Append-only on `data/pages.json` / `data/changelog.json`.

## When finished
Run the self-review (the five checks in CLAUDE.md). Then make a final integration check: write a
1-paragraph "Integration notes for P1–P5" as a comment block at the top of
`src/studio/agent-studio-store.js` so downstream agents bind correctly. Find the single biggest
quality gap in what you shipped and fix it. Then **delete this prompt file**
(`prompts/agent-studio/01-foundation.md`) and report exactly what you shipped + the final
store/presence API surface.
