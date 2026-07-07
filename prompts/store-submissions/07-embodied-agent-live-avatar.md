# Prompt 07 — Embodiment: a live agent body in the conversation (10x differentiator)

> Paste into a fresh Claude Code chat in the three.ws repo. Follow CLAUDE.md. Use TodoWrite. Prereqs: prompts 04 (free studio endpoint) + 05 (GLB viewer component) done. This LAYERS on top of the baseline app — it's the thing that makes people screenshot it.

## The thesis
Every assistant in every store is faceless text. three.ws uniquely owns text→3D→rig→animate, so we can give an agent a **persistent, living 3D body that renders inline in ChatGPT/Claude, lip-syncs to its replies, emotes, idles, and remembers its identity across sessions.** No competitor in either directory can do this. This is the consumer hook.

## Objective
Extend the 3D Studio app so a generated avatar becomes a **live conversational presence**: it speaks (lip-sync/visemes), expresses (emotion blendshapes/animation), idles between turns, and persists as a named identity the user can return to.

## What to build (all real — no fake loops, no canned animation stand-ins)
1. **Persistent agent identity.** A tool `create_agent_persona` (or extend `forge_avatar`) that mints a named, persistent avatar tied to the session/account, returns a stable persona id, and stores the rigged GLB + identity so later turns reuse the same body. Reuse existing avatar storage; do not mock persistence.
2. **Speech-driven animation in the component.** In the Apps SDK component (from prompt 05):
   - Drive **visemes/lip-sync** from the assistant's reply. Use the existing blendshape/morph-target path if the rig has visemes; otherwise drive jaw/mouth bones from an amplitude/phoneme envelope. If TTS audio is available, sync to it; otherwise animate from the text timing. Real implementation.
   - Map **emotion → expression**: detect sentiment/intent of the reply and blend the matching facial expression + body gesture (reuse `src/animation-retarget.js` clip library + `src/glb-canonicalize.js` canonical bones).
   - **Idle loop** between turns (breathing/weight-shift), and a "listening"/"thinking" state while a tool runs.
3. **Turn wiring.** When the host model produces a reply that should be "spoken" by the persona, the tool result references the component with the persona id + the text/emotion payload so the body animates that turn. Designed loading/error states (per CLAUDE.md) — never a frozen T-pose; fall back to default rig per `AnimationManager.supportsCanonicalClips()`.
4. **Continuity.** Returning to the same persona id reloads the same body + accumulated identity (name, look). One persona, many sessions.

## Why only three.ws
The universal rig retarget + canonicalization pipeline already maps arbitrary humanoid rigs to a canonical skeleton and drives the baked clip library (see CLAUDE.md "Avatar animation is universal"). Embodiment is the payoff of infrastructure you already built — competitors would have to build that pipeline first.

## Verification (must actually run)
- Generate a persona, send 3 replies of different sentiment — the body lip-syncs and shows 3 distinct, correct expressions. Record a short screen capture / sequence of screenshots to `prompts/store-submissions/_generated/embodiment/`.
- Reload the persona id in a new session — same body returns. Demonstrate it.
- A rig with no visemes still animates mouth from bones (no frozen face). A non-humanoid GLB falls back gracefully.
- No console errors/warnings. No crypto/token surface anywhere in this feature.
- `npm test` green; add a test for persona persistence + the canonical-clip fallback gate.

## Definition of done
- A named avatar persists across sessions, renders inline, lip-syncs, emotes per reply, and idles between turns — all from real pipelines, with designed states and graceful fallbacks.
- Capture evidence saved. Zero coin references.

## Hand-off
Report the persona tool name, how speech/emotion are driven, the persistence path, and the evidence path. This becomes the headline screenshot for BOTH store listings (prompts 03 + 06). Commit/push only if asked; stage touched paths; both remotes.
