# 05 — Location-leak audit across every sibling surface

> Size **M** · Read-heavy audit of `api/irl/*`, `src/irl.js` deep-links,
> `src/irl/share-frame.js`, `src/dashboard-next/pages/irl-*`, plus any agent-profile
> "View in IRL" link. Output: a written audit + fixes for anything that leaks.

## Goal

Close the *side doors*. The nearby read is locked down — but an agent's location
could still leak through a sibling endpoint, a deep-link, a share image, the
dashboard, or an error/log. Audit every surface that touches a pin and prove none
of them lets you resolve **another** user's agent → its location without physical
presence.

## Why it matters

A privacy guarantee is only as strong as its weakest endpoint. We have a family of
IRL endpoints added around the same time (`agent-card`, `agent-summary`,
`interactions`, `interactions-stream`, `report`) plus deep-links (`?agent=`,
`?highlight=`) and a share-frame generator. Any one of them returning a `lat`/`lng`,
an origin coordinate, or an agent→pin mapping that works from afar reopens exactly
the hole we just closed — quietly.

## Current state / where to look (real files)

- `api/irl/agent-card.js`, `api/irl/agent-summary.js` — do their responses include
  `lat`/`lng`/`origin_*` for an agent the caller isn't near? They must not (an agent
  *card* should describe the agent, not pinpoint it).
- `api/irl/interactions.js`, `api/irl/interactions-stream.js` — the owner SSE inbox.
  Confirm the privacy filter (`publicRow`/`matches`, see [memory: irl-d3-interaction-broadcast])
  never ships an actor's GPS, and that an interaction record doesn't carry pin coords
  to anyone but the owner.
- `api/irl/pins.js` `?mine` / `/mine` feeds — return coordinates, which is correct
  (they're the owner's own pins). Confirm they're strictly owner/device-scoped and
  can't be coerced cross-user (e.g. a guessed `deviceToken`, a missing auth check).
- `src/irl.js` deep-links: `?agent=<id>` (`agentFocusId`) and `?highlight=<pinId>`
  open/flash a pin **only after it loads via the proximity poll**. Confirm neither
  fetches or reveals a location for an agent that isn't already in range — i.e. the
  deep-link is a "focus it *if* you're near it," never a "take me to it."
- `src/irl/share-frame.js` — the share image/card must not embed lat/lng or a map.
- `src/dashboard-next/pages/irl-placements.js` (+ `irl-reputation`, `irl-outfit-editor`)
  — these show the owner *their own* pins (fine); confirm they never fetch others'.
- Logs: grep for any `console.*` that prints pin `lat`/`lng` on a public path
  (client-error reporter, server logs) per [memory: observability-stack].

## What to do

1. For each surface above, document **what it returns/exposes** and whether a
   non-present, non-owner caller can learn a location. Put it in
   `reports/irl-location-leak-audit.md` as a table: surface · exposes coords? ·
   owner-scoped? · verdict.
2. Fix every leak found, smallest change that holds the invariant (e.g. drop
   `lat`/`lng`/`origin_*` from an agent-card response; tighten an owner check). Add a
   focused test for each fix.
3. Re-state the invariant in a one-line code comment at each fixed site so a future
   edit doesn't silently re-add the field.

## Acceptance checklist

- [ ] `reports/irl-location-leak-audit.md` covers every `api/irl/*` endpoint, both
      deep-links, the share frame, and the three dashboard pages, with a verdict each.
- [ ] No public/non-owner surface returns `lat`/`lng`/`origin_*` or an agent→location
      mapping resolvable from afar.
- [ ] `?mine` / `/mine` proven strictly owner/device-scoped (test for the cross-user
      attempt → no data).
- [ ] Deep-links (`?agent`, `?highlight`) only focus an already-in-range pin; verified.
- [ ] Each fix has a regression test; full suite green.

## Out of scope

The nearby feed itself (already locked + covered by `irl-pins-location-guards`).
CI wiring of new tests is fine here or rolled into task 07.

## Verify

For each "exposes coords? = no" verdict, run the actual request unauthenticated /
as a non-owner and confirm the response carries no location. Paste the responses
into the audit doc.
