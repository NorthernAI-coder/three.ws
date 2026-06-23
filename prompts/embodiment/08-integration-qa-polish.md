# Task 08 — Integration, QA & Polish (one continuous being, end to end)

> Read `prompts/embodiment/00-README.md` and `CLAUDE.md` first. Depends on Tasks 01–07.
> This is the last task. Do not start until the others have landed (or land what exists and
> note precisely what is still missing — never fake the gap).

## Mission

Tie the whole Embodiment suite into one coherent, polished, demo-ready experience: pair → the
soul descends → the body thinks with the real mind, moves and emotes as the avatar, is provably
owned on-chain and gated in $THREE, can be piloted/mirrored, and is safe and revocable. Audit
every seam. Make it something you'd film and put on the homepage.

## What to do

1. **End-to-end exercise.** With the simulator adapter (real avatar twin) at minimum — and a real
   robot adapter if one is reachable — run the full journey in a real browser: pair, on-chain
   bind, mind load + greeting from real recall, motion + face mirroring, telepresence/pilot,
   $THREE-gated session, revoke → safe state. Confirm real API calls in the network tab. Fix
   every break.
2. **Cross-feature wiring audit.** Verify all surfaces share one `RobotLink`, one bus, one active
   agent, one memory store, one mood — no forked interfaces or divergent state between 01–07.
   Reconcile with the Living Agents bus/mood if present.
3. **Every-state-designed audit.** Loading (skeletons), empty (e.g. "No robot paired"), error
   (actionable + recovery), populated, fault/offline, low-battery, revoked, overflow — across
   every embodiment surface. Hover/active/focus everywhere; keyboard paths; ARIA; contrast; focus
   rings; `prefers-reduced-motion`.
4. **Performance.** Avatar twin + camera feed + telemetry coexist within `src/webgl-budget.js`;
   lazy-boot offscreen viewers; throttle telemetry; low-latency media; no jank, no leaks across
   pair/unpair cycles.
5. **Safety regression.** Re-verify e-stop (out-of-band), envelope rejection, geofence, and
   revoke-drives-safe-state still hold after integration. These never regress.
6. **Tests.** Add/extend integration tests for the bus contract, the `RobotLink` adapter
   interface (sim adapter), the joint-map, the safety envelope, and e-stop. `npm test` green.
7. **Discovery & docs.** The feature is reachable via navigation and surfaced where it belongs
   (agent edit hub, dashboard, the agent's public page). Add a short `docs/` page describing the
   embodiment architecture (RobotLink, bus, on-chain soul, safety) and link it from `STRUCTURE.md`.
8. **Changelog.** One holder-readable `feature` entry summarizing the Embodiment launch (plus any
   `fix`/`security` entries for issues found), then `npm run build:pages`.

## Definition of done

- [ ] Full pair→think→move→emote→own→pilot→revoke journey works end-to-end in a real browser
      against the real adapters available; no console errors/warnings; real API calls succeed.
- [ ] One shared RobotLink/bus/active-agent/memory/mood across all surfaces; no forked state.
- [ ] Every state designed on every surface; a11y + responsive + reduced-motion verified.
- [ ] Performance within the WebGL/context budget; no leaks across pair/unpair.
- [ ] Safety (e-stop/envelope/geofence/revoke) re-verified post-integration; tests cover it.
- [ ] `npm test` passes; `git diff` reviewed line by line.
- [ ] Architecture doc added + linked from `STRUCTURE.md`; changelog entry + `npm run build:pages`.

## Self-improvement pass

Find the one seam that still feels like "two things" instead of "one being" and fix it so the
illusion is total. Then add the demo flourish that makes someone share it — the synchronized
blink, the "it remembered me" moment, the on-chain soul certificate — fully grounded in real
signals.

## When done

Delete this file. Report the end-to-end journey you exercised, the seams you fixed, the tests
added, and the final architecture as shipped.
