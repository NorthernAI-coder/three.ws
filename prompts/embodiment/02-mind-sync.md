# Task 02 — Mind Sync (the same mind, now in the body)

> Read `prompts/embodiment/00-README.md` and `CLAUDE.md` first. Depends on Task 01.
> Builds on the real memory/brain/persona stack — do not rebuild it.

## Mission

Make the physical robot **think, speak, and decide as the same continuous mind** as the
on-screen agent — driven by the agent's real `agent_memories`, persona, and brain — and make
the robot's real-world experiences flow **back** into that same memory store, so the avatar on
the user's phone already knows what the body just learned. One mind, two presences, perfectly
continuous.

## The innovation bar

Most "embodied LLMs" are stateless: a fresh prompt every utterance. The game-changer is
**continuity in both directions** — the body wakes up already knowing everything the agent
knows (it greets you by name from real memory), and what it sees/hears/does in the room
becomes new, salience-scored memory the on-screen agent recalls minutes later. The user feels
one being, not two copies.

## What to build

1. **Mind load.** On `robot:linked`, assemble the agent's working context from the real
   stack — `api/memory/context.js` (working context), `api/agents/_id/persona.js` (signed
   system prompt), relevant `agent_memories` via `api/memory/search.js` — and hand it to the
   robot's reasoning loop through the `RobotLink`. The body's first words are grounded in real
   recall, not a generic greeting.
2. **Embodied reasoning loop.** Route the robot's turns through `api/brain/chat.js` /
   `api/chat.js` with the persona system prompt and retrieved memory, plus an **embodiment
   context block** (current room/telemetry/what it can physically do). Real streaming; real
   tool/skill access the agent already has. No second, divergent prompt identity.
3. **Write-back.** Salient real-world events (who it met, what it was asked, what it did) are
   written as real `agent_memories` via `api/agent-memory.js` with honest `salience`, `type`,
   `tags`, and `context` (jsonb capturing body/room/source). Update the entity graph
   (`api/memory/graph.js`). Emit `memory:added` / `mind:synced` on the bus so the avatar and
   Mind Palace reflect it live.
4. **Conflict-free continuity.** Define how concurrent presences stay consistent (the avatar
   chatting on the web while the body talks in the room): single source of truth = the memory
   store; both presences read/write it; last-write-wins is not acceptable for memory — append,
   don't clobber. Document the model in `specs/` (extend `MEMORY_SPEC.md` or add an embodiment
   note).
5. **Voice.** Use `@three-ws/voice` / `api/asr.js` + `api/tts/` so the body hears and speaks
   in the agent's real voice profile (`agent_identities.voice_*`). Audio routes through
   `RobotLink.speak()`; visemes are Task 04's concern but expose the audio it needs.

## Wiring & real-API mandate

- Memory read/write is the real `agent_memories` store via the real endpoints — never a
  separate in-memory cache that diverges. No fabricated recall.
- Persona is the existing signed persona prompt; do not invent a new personality for the body.

## Definition of done

- [ ] On link, the body loads real working context + persona + recalled memory and greets
      grounded in actual recall.
- [ ] Robot turns run through the real brain/chat endpoints with persona + retrieved memory +
      embodiment context; real streaming.
- [ ] Real-world events write back as real `agent_memories` (honest salience/tags/context) and
      update the entity graph; `memory:added`/`mind:synced` emitted and reflected on the avatar.
- [ ] Continuity model documented; concurrent avatar+body presences don't clobber memory.
- [ ] Voice in/out via real ASR/TTS through `RobotLink`.
- [ ] No console errors/warnings; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Sell the continuity: a visible "the body just remembered this" chip on the web avatar when the
robot writes a memory, and have the body proactively reference a recent web-side memory ("you
were just reading about X"). Make one being in two places undeniable.

## When done

Delete this file. Report the real memory/brain/persona endpoints used, the write-back schema,
and the continuity model.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/embodiment/02-mind-sync.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
