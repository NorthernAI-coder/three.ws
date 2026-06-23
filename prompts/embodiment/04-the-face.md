# Task 04 — The Face (the avatar's face, on the robot's head)

> Read `prompts/embodiment/00-README.md` and `CLAUDE.md` first. Depends on Tasks 01, 03.
> Builds on `api/a2f.js` (audio2face), the `<agent-3d>` morph system, and `@three-ws/voice`.

## Mission

Put the **agent's actual face** on the robot's head display (or projected face) — the same
features, the same lipsync, the same expressions and mood as the on-screen avatar — so the
being looking at you in the room is recognizably the one you raised on the screen.

## The innovation bar

Most humanoids have a fixed or abstract face. The game-changer: the robot wears the **user's
own agent's face**, lip-synced to its real speech via the existing audio2face pipeline and
emoting from the real mood model — and it's the *same* face as the avatar, frame-for-frame
mirrored. The face on the screen and the face in the room blink together.

## What to build

1. **Face render target.** Render the agent's avatar head — real GLB/morphs from the avatar
   system — to a stream sized for the robot's head display, delivered via `RobotLink.setFace()`
   (a frame/morph stream the adapter maps to the device's display or projector). The simulator
   adapter renders it on the `<agent-3d>` twin. Reuse the real renderer; respect the WebGL
   budget.
2. **Lipsync.** Drive visemes from real speech audio through `api/a2f.js` so the mouth matches
   what the body says (audio from Task 02's TTS). No fake mouth flapping — real viseme timeline
   synced to real audio. Honor `prefers-reduced-motion` on any web mirror.
3. **Expression + mood.** Map the agent's mood (Living Agents mood model if present; otherwise
   the mood signals available) and conversational state onto facial morphs (`setMorph`) — gaze,
   blink, brow, smile. The face is an honest readout of the mind, same as the avatar.
4. **Eye contact + gaze.** Use the robot camera (`RobotLink.camera()`) to find the user and
   drive gaze/head so the robot makes real eye contact while speaking. Degrade to a natural
   idle gaze when no camera or no face detected.
5. **Mirror.** Emit `face:expressed`; the on-screen avatar mirrors the same morph frame so web
   and body share one face. Every state designed (no-display fallback: drive expression purely
   through the head/gaze motion path from Task 03).

## Wiring & real-API mandate

- Visemes come from `api/a2f.js` on real audio; expressions from real mood/state — never random.
- Reuse the real avatar renderer + morph API; do not build a second face system.

## Definition of done

- [ ] The agent's real avatar face renders to the robot's head display via `RobotLink.setFace()`
      (and the twin in sim mode); same face as the on-screen avatar.
- [ ] Lipsync driven by `api/a2f.js` on real TTS audio; mouth matches speech.
- [ ] Mood/expression maps onto real morphs (gaze, blink, brow, smile); `prefers-reduced-motion`
      honored on web mirror.
- [ ] Camera-driven eye contact with graceful no-camera fallback.
- [ ] `face:expressed` emitted; avatar mirrors the same frame; no-display fallback designed.
- [ ] No console errors/warnings; WebGL budget respected; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Make recognition land: a micro-expression of recognition when the camera identifies the owner,
and a synchronized blink between the screen avatar and the robot face so the "same being"
illusion is total. Subtle, grounded in real signals.

## When done

Delete this file. Report the face render/transport path, the viseme pipeline, and the
mood→morph mapping.
