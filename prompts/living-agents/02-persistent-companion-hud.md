# Task 02 — The Persistent Companion HUD ("Anywhere Avatar")

> Read `prompts/living-agents/00-README.md` and `CLAUDE.md` first. Depends on Task 01
> (`src/agents/active-agent.js`, `src/agents/agent-bus.js`). Treat that interface as fixed.

## Mission

Make the user's agent **present and alive on every page** — not as wallpaper, but as a
companion that reflects its own internal state and lets the user act on it in context.
You are promoting the existing `src/walk-companion.js` from a cursor-following mascot
into a stateful HUD bound to the active agent (Task 01), wired to the agent bus so it
reacts the moment the agent thinks, learns, remembers, feels, or acts.

## The innovation bar

Every metaverse/chatbot product has a floating avatar. None of them make the avatar a
**transparent window into the agent's mind**. The game-changer: as you move around the
platform, you literally watch your agent learn ("🧠 remembered: you prefer SOL settlement")
and recall ("💭 recalled: your risk tolerance is low") in real time, and you can reach
into it from wherever you are. The avatar earns its place on screen by being useful and
honest about what it's doing — that is the engagement loop, and nobody has it.

## What to build

1. **Bind the companion to the active agent.** Replace the ad-hoc `?avatar=` /
   `walk:companion:avatar` resolution with `getActiveAgent()` from Task 01. The companion
   shows the user's real agent GLB (via `agentAvatarGlb` / `<agent-3d>`), respecting the
   WebGL budget (`src/webgl-budget.js`, reserved context).
2. **Live state reflection (subscribe to the bus):**
   - `memory:recalled` / `memory:added` → a transient, tasteful chip near the companion
     ("recalled …", "remembered …") with the memory snippet; clicking it opens the Mind
     Palace (Task 03) focused on that memory. Throttle/coalesce bursts.
   - `mood:changed` (Task 07) → the companion plays the matching gesture/expression.
   - `action:taken` (Task 08) → a chip explaining the autonomous action with a link.
   - `brain:updated` (Task 05) → the companion re-greets in the new voice/tone.
   - `dream:created` (Task 04) → a subtle "your agent reflected while you were away —
     review" notification badge.
   - Build these as **graceful no-ops if the producing task isn't shipped yet** — subscribe
     to the event names from the README contract; if nothing emits them, the HUD simply
     stays quiet. No fake events.
3. **Contextual quick-edit.** Clicking the companion opens a compact popover whose
   contents depend on the current route — wallet controls on wallet pages, skill toggles
   on marketplace, outfit/animation on 3D pages, "talk" everywhere. Each control calls the
   real API (`/api/agent-memory`, agent/skill/wallet endpoints) and routes to the full
   editor (`/agent/{id}/edit`) for depth. No dead buttons.
4. **Presence & continuity.** The companion remembers what it was doing across navigation
   (it already persists pose). Add route-aware, memory-aware greetings sourced from real
   recent memory (e.g. on return: "last time you were checking $THREE alerts"). Real data
   from `/api/agent-memory`, never canned strings pretending to be memory.
5. **User control.** Opt-in/out toggle, reposition, minimize-to-orb, and a "switch active
   agent" affordance for users with multiple agents (real `GET /api/agents`). Respect
   `prefers-reduced-motion` and the existing route exclusions (`/play`, `/xr`, `/pose`…).

## Wiring & real-API mandate

- Reuse `<agent-3d>`, `agentAvatarGlb`, `webgl-budget`, and the existing walk-companion
  scene/mixer — do not spin up a second uncounted WebGL context.
- All chips/greetings come from real bus events and real `/api/agent-memory` data.
- No mock memories, no fake "thinking" animation untied to an actual chat/inference.

## Definition of done

- [ ] On every non-excluded page, the companion shows the user's real active agent and
      survives navigation; switching active agent updates it live (Task 01 cross-tab too).
- [ ] Triggering a real chat recall makes a "recalled" chip appear (real `memory:recalled`).
- [ ] Quick-edit popover is context-aware, every control hits a real API or routes to the
      editor, and has hover/active/focus + keyboard support.
- [ ] Respects WebGL budget (verify no context-loss warnings with several `<agent-3d>` on a
      page), `prefers-reduced-motion`, and existing route exclusions.
- [ ] Loading/empty (no agent yet → "create your agent" CTA)/error states designed.
- [ ] No console errors/warnings; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Ask: does the companion feel *alive* or just *present*? Add the details that cross the
line — idle micro-behaviors that reference real recent memory, a gaze that follows the
section of the page the user is interacting with, a "what are you thinking?" affordance
that surfaces the agent's current working memory honestly, sound design gated behind a
mute toggle. Do the one that most makes a first-time user say "whoa."

## When done

Delete this file. Report which bus events you consume and the contextual quick-edit
surface per route.
