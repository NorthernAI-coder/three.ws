# Task 06 — Telepresence & Twin (one being, two places)

> Read `prompts/embodiment/00-README.md` and `CLAUDE.md` first. Depends on Tasks 01, 03, 04.
> Builds on the bus, the avatar twin, and the `RobotLink` camera/motion paths.

## Mission

Make the on-screen avatar and the physical robot **demonstrably one being in two places**:
their mood, gesture, gaze, and speech mirror live; the user can pilot the body or see through
its eyes from the web; and switching attention between screen and room feels seamless, not like
controlling a separate machine.

## The innovation bar

Telepresence robots are a webcam on wheels. The game-changer: the operator *is the agent's
avatar* — you don't drive a robot, you **step into your agent's body**. The avatar you've lived
with becomes your presence in the room, and bystanders see the same face/mood whether they look
at the screen or the robot. Two windows onto one continuous self.

## What to build

1. **Live mirror.** Subscribe to the bus (`mood:changed`, `motion:played`, `face:expressed`,
   `memory:recalled`) so the web avatar and the physical body reflect the same state in real
   time, both directions. One state, two renderers.
2. **See-through-its-eyes.** Stream `RobotLink.camera()` to the web with real low-latency
   transport (WebRTC where available). Designed states for no-camera/permission-denied/poor-link.
3. **Pilot / teleop.** Let the user drive the body from the web — at minimum head/gaze + gesture
   + "go to / look at," and (where the hardware supports it) live pose via `body-mocap` from
   Task 03. Every command flows through Task 03's safety envelope and Task 07's consent — no raw
   joint access from the browser. Clear "you are piloting" vs "agent is autonomous" mode with a
   visible, instant handoff.
4. **Presence handoff.** A clean model for who is in control — the autonomous agent mind (Task
   02) or the human pilot — with the avatar/face honestly signaling which. Returning control to
   the agent restores its autonomous behavior immediately.
5. **Unified surface.** A telepresence view (e.g. `/agent/{id}/embody` live tab): camera feed,
   the avatar twin, telemetry, mood, controls, mute/e-stop always reachable. Responsive; the
   feed and twin respect the WebGL/context budget.

## Wiring & real-API mandate

- Real media transport and real telemetry only — no looping sample video, no fake feed.
- All physical control passes through the safety envelope (03) and consent guards (07).

## Definition of done

- [ ] Web avatar and physical body mirror mood/gesture/gaze/speech live, both directions, off
      the shared bus.
- [ ] Real camera stream to the web with designed no-camera/denied/poor-link states.
- [ ] Pilot/teleop works through the safety envelope + consent; visible autonomous↔piloted
      handoff that takes effect instantly.
- [ ] Unified telepresence surface reachable; mute/e-stop always present; responsive; budget
      respected.
- [ ] No console errors/warnings; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`feature`) + `npm run build:pages`.

## Self-improvement pass

Sell "two places, one self": a side-by-side that films well (avatar and robot blinking/gesturing
in lockstep), and a "whisper" mode where the user types and the body speaks it in the agent's
voice while staying in character. Real, low-latency, screenshot-worthy.

## When done

Delete this file. Report the media transport, the mirror mechanism, the teleop command path, and
the control-handoff model.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "prompts/embodiment/06-telepresence-twin.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
