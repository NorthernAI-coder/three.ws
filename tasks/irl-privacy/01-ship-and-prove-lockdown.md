# 01 — Ship both surfaces safely + adversarial "no roster" proof

> Size **M** · Touches deploy of `api/` (Vercel) **and** the standalone Colyseus
> server (`multiplayer/`), plus a written red-team proof. No app-code changes
> expected unless the proof finds a hole.

## Goal

Get the location-privacy model **live on both deploy targets** and then *prove*,
adversarially and from the open internet, that an agent's location cannot be
obtained without physical presence. The implementation is done; this task makes
"it's actually shipped and actually locked" a verified fact, not an assumption.

## Why it matters

Two independent deploy targets back /irl: the Vercel API (`api/irl/*`) and the
standalone Colyseus multiplayer server (`multiplayer/src/index.js`, hosts the
`irl_world` room **and `/walk`**). A privacy fix that only landed on one is a
false sense of safety. Past incident: `/api/irl/*` endpoints 404'd in prod from a
stale deploy ([memory: irl-b2-agent-card]). And a realtime change can silently
regress `/walk`. The whole point of the feature is safety — so we verify it like
safety, not like a feature.

## What to do

### 1. Deploy, in order
- Deploy the **multiplayer server** first (it no longer depends on the API's
  publish webhook). Confirm boot logs show `irl_world` registered and **no**
  reference to the removed `irl-registry` / `irl-publish-auth` / `/internal/irl-publish`.
- Deploy the **Vercel API**. Confirm the live commit is the one containing the
  lockdown (`git`-verify against the deployments API, per [memory: vercel-symlink-build-trap]).
- Guard against `npx vercel build` clobbering `api/*.js` ([memory: vercel-build-clobbers-api]).

### 2. Adversarial proof (write results to `reports/irl-privacy-proof.md`)
Run each from an **unauthenticated, off-platform** client and record the result:

- **No window feed.** `GET /api/irl/pins?bbox=…` (any box, with and without an
  `x-mp-internal` header) → must be `400` (missing lat/lng), never a multi-pin body.
- **Radius is hard-capped.** `GET /api/irl/pins?lat&lng&radius=100000` → the
  returned set is confined to a tight box; a pin known to be ~200 m away is **not**
  returned. (Place a throwaway test pin via the real POST, stand it 200 m off, verify.)
- **Rate limit bites.** A scripted grid sweep of nearby reads trips `429` quickly
  (the `limits.publicIp` ceiling) — a global harvest is impractical.
- **Realtime carries no pins.** Connect a raw `colyseus.js` client to an
  `irl_world` geocell (the same join `src/irl-net.js` does) and dump
  `room.state` — `state.pins` must be **empty**; only `viewers` (coarse, jittered)
  and `reaction` messages appear. This is the headline proof: joining a cell hands
  you no coordinates.
- **No owner ids.** The nearby projection contains no `user_id` / `device_token`.
- **`/walk` unaffected.** Join a `walk_world` room; movement/presence still work.

### 3. If any check fails
Fix the root cause in app code (not the test), re-deploy, re-run. Zero failures is
the bar. There is always a correct fix — find it.

## Acceptance checklist

- [ ] Multiplayer server live; boot logs clean; `/walk` verified working.
- [ ] Vercel API live on the lockdown commit (verified via deployments API).
- [ ] `reports/irl-privacy-proof.md` committed with all six checks **passing**,
      each with the exact request and observed response.
- [ ] The raw-WS dump showing `state.pins` empty is captured verbatim in the proof.
- [ ] A throwaway test pin used for the radius proof is deleted afterward.

## Out of scope

UX, copy, new tests in CI (that's 07). This is deploy + manual adversarial proof.

## Verify

The proof doc IS the verification. A reviewer should be able to re-run every
command in it and reproduce the same safe result.
