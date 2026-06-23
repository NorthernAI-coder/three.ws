# Task 07 — Safety, Consent & Kill-switch (trust is the product)

> Read `prompts/embodiment/00-README.md` and `CLAUDE.md` first. Depends on Tasks 01, 05.
> Reuse the real custody/spend/trade guard patterns — do not invent a parallel guard system.

## Mission

Make embodiment **safe and consensual by construction**. Anything that moves a real motor or
acts in the physical world passes through a consent + safety layer with an always-reachable
e-stop, a geofence, validated motion limits, and a revocable on-chain embodiment grant. The
robot defaults to the safe state on any fault, lost link, or revoked grant.

## The innovation bar

Safety is usually a checkbox and a fragile remote. The game-changer: safety that is **legible
and provable** — the user can see exactly what the body is allowed to do, who consented, and on
what authority (the on-chain grant), and can revoke it instantly from anywhere with the result
verifiable on-chain. Trust you can read and prove, not a disclaimer.

## What to build

1. **Consent & custody guards.** Reuse the patterns in `api/_lib/agent-custody-guards.js`,
   `api/_lib/agent-spend-policy.js`, `api/_lib/agent-trade-guards.js` (and their tests) to gate
   embodiment actions: who may embody this agent, in which bodies, with what capability scope
   (move / speak / spend / leave-room), and under what limits. Every physical action checks the
   guard before reaching `RobotLink`. Deny-by-default.
2. **E-stop.** A hard kill-switch reachable from every embodiment surface and via a dedicated
   `api/embodiment/estop.js` endpoint — single action → motors safe, body unbinds, `estop` event
   on the bus. It must work even when the reasoning loop is hung (out-of-band path). Test it.
3. **Safety envelope (shared with Task 03).** Per-joint position/velocity/accel limits, balance/
   self-collision guard, and a workspace **geofence** (reuse `@three-ws/irl` / `_lib/geohash.js`
   for real-world bounds). Commands that can't be made safe are rejected with `robot:fault`, not
   clipped silently. This is the one envelope Task 03 feeds; harden it here.
4. **Revocable on-chain grant.** Wire to Task 05's embodiment right so revoking the grant (or its
   expiry) immediately drives the runtime to safe state + unbind, logged in `agent_actions` and
   verifiable on-chain. Lost link / low battery / fault → same safe state.
5. **Audit & transparency.** A real, append-only embodiment action log (reuse `agent_actions`,
   signed) and a UI panel showing capability scope, active consent, the governing on-chain grant,
   recent physical actions, and faults — every state designed. The user always knows what their
   body can do and on whose authority.

## Wiring & real-API mandate

- Reuse the real guard modules and the real on-chain grant — no parallel ad-hoc permission code,
  no fake "safe" that doesn't actually stop motion.
- E-stop is out-of-band and verified by a test that proves motion stops even with the loop busy.

## Definition of done

- [ ] Every physical action passes deny-by-default consent/custody guards reusing the existing
      guard modules; capability scope + limits enforced.
- [ ] E-stop reachable everywhere + `api/embodiment/estop.js`; works out-of-band; → motors safe +
      unbind + `estop` event; test proves it.
- [ ] Safety envelope (joint/velocity/balance + geofence) rejects unsafe commands with
      `robot:fault`; shared with Task 03.
- [ ] Revoked/expired on-chain grant, lost link, fault, low battery → immediate safe state +
      unbind, logged in `agent_actions`, on-chain-verifiable.
- [ ] Transparency panel shows scope/consent/grant/recent-actions/faults; every state designed.
- [ ] No console errors/warnings; `npm test` passes; `git diff` reviewed.
- [ ] Changelog entry (`security` + `feature`) + `npm run build:pages`.

## Self-improvement pass

Make safety reassuring, not scary: a calm, always-visible status ("autonomous · in-bounds ·
battery 82% · e-stop ready") and a one-tap "pause my agent's body" that any household member can
hit. Provable, instant, friendly.

## When done

Delete this file. Report the guards reused, the e-stop path + its test, the safety-envelope
limits + geofence, and how the on-chain grant drives the runtime safe state.
