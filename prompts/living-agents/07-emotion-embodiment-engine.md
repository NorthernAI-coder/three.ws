# Task 07 — Emotion & Embodiment engine (the body reflects the mind)

> Read `prompts/living-agents/00-README.md` and `CLAUDE.md` first. Depends on Task 01 and
> ideally Task 02 (Companion). Builds on the real animation system (`public/animations/`,
> the emotion-graph state machine in `src/agent-edit.js` ~644-715, `<agent-3d>`'s
> `playGesture`/`setMorph`).

## Mission

Give the avatar a **real emotional state derived from the agent's mind and the user's
world**, expressed continuously through body language and face. The avatar shouldn't only
animate when spoken to — it should carry a mood that evolves from what it remembers, what
it just learned, what happened in the user's wallet/alerts, and the conversation. The body
is an honest readout of the mind.

## The innovation bar

Idle loops and canned reaction emotes are everywhere. The game-changer: a **driven
emotional state** — a small, real state model (valence/arousal or a labeled mood set) that
updates from genuine signals and maps onto the existing animation/morph system, so the
avatar's posture, micro-expressions, and gestures *mean* something. A user glances at the
companion and reads how their agent is "feeling" about the current situation — and it's
grounded in real events, not theatrics.

## What to build

1. **Mood model.** A real, documented emotional state (e.g. valence + arousal continuous,
   plus discrete moods) that lives on the active agent and updates from real inputs:
   - `memory:added` / `memory:recalled` / salience shifts (Task 01/03),
   - `dream:created` (Task 04 — a satisfying "aha"),
   - `action:taken` and its outcome (Task 08 — e.g. an alert it handled),
   - real wallet/market events from the existing alert/automation engine,
   - conversation sentiment from real chat (`/api/chat`) — derived from actual messages,
     not random.
   Decay toward baseline over time. Persist so mood has continuity across sessions
   (extend `agent_identities.meta` or a small table — real storage).
2. **Embodiment mapping.** Map mood → the real animation/morph system: idle posture,
   gesture selection, facial morphs (`setMorph`), gaze, and gesture intensity. Reuse and
   extend the existing emotion-graph state machine rather than inventing a parallel one.
   Blend smoothly; no jarring snaps. Respect `prefers-reduced-motion` (reduce motion,
   keep a subtle facial cue).
3. **Bus integration.** Emit `mood:changed` so the Companion (Task 02) and any open avatar
   re-express. Subscribe to the producing events above; degrade gracefully if a producer
   isn't shipped yet (mood still works from chat + memory alone).
4. **Honest, controllable.** A real "emotional sensitivity" setting (some users want a calm
   stoic agent). An inspector (dev/edit surface) showing the current mood and the real
   signals that moved it — so it's legible, not a black box. No mood change without a real
   triggering signal.

## Wiring & real-API mandate

- Mood transitions come from real events/inference only. No `Math.random()` mood, no timer
  that fakes emotion, no decorative emote untied to a signal.
- Reuse existing animation assets and the `<agent-3d>` morph/gesture API.

## Definition of done

- [ ] A documented mood model updates from real signals (chat sentiment + memory at minimum)
      and decays to baseline; mood persists across sessions via real storage.
- [ ] Mood visibly maps onto posture/gesture/face through the existing animation system,
      blended smoothly; `prefers-reduced-motion` honored.
- [ ] `mood:changed` emitted and consumed by the Companion/avatar; degrades gracefully when
      optional producers are absent.
- [ ] Sensitivity control + mood inspector work and are wired to real state.
- [ ] No console errors/warnings; WebGL budget respected; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Ask: does the body genuinely express the mind, or just play emotes? Add the elevating layer
— subtle involuntary micro-expressions on recall, a "mood over time" sparkline tied to real
events, or empathetic responses to the user's own signals (e.g. softening when an alert went
badly). Build the most convincing one, fully grounded in real signals.

## When done

Delete this file. Report the mood model, its real input signals, and the mood→animation map.
