# Pole Club — Build-Out Plan

The `/club` page at [pages/club.html](../../pages/club.html) and
[src/club.js](../../src/club.js) currently runs on Three.js primitives:
cylinders for poles, circles for stages, neon rings, four clones of
`/avatars/default.glb`, and the generic dance clips already in
`/animations/manifest.json`. The paid x402 endpoint
[api/x402/dance-tip.js](../../api/x402/dance-tip.js) is wired and
indexed by the bazaar; tipping triggers a real settlement, returns a
ticket, and a stand-in dancer walks the rig from "backstage" to the
pole.

This plan tracks what's required to turn that placeholder rig into a
fully wired, professional 3D venue with distinct dancers, real pole
choreography, club lighting + audio, server-side tip persistence, and
per-dancer leaderboards/payouts. No primitives shipped to prod; no
synthesized art; no `setTimeout`-faked timing.

Each task lives as a self-contained prompt under [prompts/club/](../../prompts/club/).
Run them in any order — each restates its own context.

## Hard rails (from [CLAUDE.md](../../CLAUDE.md))

- No mocks, no fake data, no placeholders, no TODOs, no stubs.
- Real APIs, real animations, real GLBs, real audio.
- Errors handled at boundaries only.
- Done = wired in the UI, exercised in a real browser, no console
  errors, `npm test` green, `git diff` reviewed.
- Push to **both** remotes (`threeD` → `nirholas/3D-Agent`,
  `threews` → `nirholas/three.ws`) only when the user says push.

## Scope — the venue

| Element | Today | Target |
|---|---|---|
| Walls / floor / ceiling | `PlaneGeometry` + `CircleGeometry` + `MeshStandardMaterial` | Authored `club-venue.glb` with PBR materials, baked AO, real architectural detail (girders, ceiling beams, ducts, alcoves) |
| Bar | A single flat plane | A bar GLB with bottles, glassware, neon backsplash, animated bartender or static idle figure |
| Dance floor | Emissive circle | Lit panel floor (animated emissive tiles), reflective varnish, scuff/wear baked in |
| Crowd | None | Low-poly cheering crowd silhouettes lining the perimeter (instanced) + occasional VIP figures in alcoves |
| Backstage | Invisible offstage point | A visible curtain/door GLB the dancer emerges from |
| Skybox | Solid `#07050b` | HDRI of a dim club ceiling with disco-ball highlight + low key red/magenta cast |

→ [prompts/club/01-venue-glb-and-environment.md](../../prompts/club/01-venue-glb-and-environment.md)

## Scope — the dancers

Each of the four pole slots needs a **distinct authored dancer GLB**,
not a cloned default avatar. Outfits, hair, body shape, skin tone, and
accent palette must read differently across slots. All four share the
canonical Avaturn skeleton so the existing animation JSON clips drive
them without retargeting at runtime.

- `public/club/dancers/dancer-01.glb` — neon pink palette
- `public/club/dancers/dancer-02.glb` — cyan palette
- `public/club/dancers/dancer-03.glb` — amber palette
- `public/club/dancers/dancer-04.glb` — violet palette

Bound at runtime via a small registry that maps slot → GLB URL +
display name + bio + tip wallet.

→ [prompts/club/02-dancer-glbs.md](../../prompts/club/02-dancer-glbs.md)

## Scope — the pole rig + pole choreography

The cylinder pole prop becomes a textured pole GLB with a flared base
and a ceiling-mounted top. A small spotlight rig hangs off the ceiling
mount.

The current dance clips (`rumba`, `silly`, `thriller`, `capoeira`,
`hiphop`) aren't pole choreography — they're free-floor Mixamo clips.
Add pole-specific clips:

- `pole-walk-on` — entry routine from backstage
- `pole-spin` — single revolution, looping
- `pole-climb` — climb to mid-pole
- `pole-invert` — upside-down hang
- `pole-floorwork` — return to ground crawl
- `pole-bow` — exit bow

Each clip authored from Mixamo or freely-licensed mocap, retargeted by
[scripts/build-animations.mjs](../../scripts/build-animations.mjs) (or
its successor), output to `public/animations/clips/pole-*.json`,
registered in `public/animations/manifest.json`, exposed via the
`dance-tip` endpoint's `STYLES` map.

The `dance-tip` endpoint adds new style keys (`spin`, `climb`,
`invert`, `floor`, `combo`) that map to clip sequences played back to
back during the performance window.

→ [prompts/club/03-pole-rig-and-pole-animations.md](../../prompts/club/03-pole-rig-and-pole-animations.md)

## Scope — lighting + post-processing

- Volumetric spotlights with visible cones (god-rays through fog
  density volume) — one per pole, color from `POLE_COLORS`.
- A real mirror ball with cube-camera reflections that scatter dots
  across the floor and walls.
- RGB strip lights along the bar edge + ceiling rails (instanced
  `LineSegments` with bloom).
- Animated rim lights that pulse on the beat of the active dancer's
  music track.
- Bloom + vignette + filmic tone mapping via `EffectComposer` from
  `three/addons/postprocessing/*`. Optional subtle chromatic
  aberration during high-energy clips (`thriller`, `pole-spin`).
- Real fog volume (the existing `Fog` is fine as a baseline) tuned
  for visibility through god-rays without obscuring dancers.

→ [prompts/club/04-lighting-and-postfx.md](../../prompts/club/04-lighting-and-postfx.md)

## Scope — audio + music

- Background club ambience (crowd murmur, low rumble, occasional
  glass clinks) looping at –24 LUFS via Web Audio API.
- Per-style music tracks under `public/club/audio/<style>.mp3` (or
  `.ogg`) — short loopable cuts (~30-60s) licensed CC-BY or
  public-domain. Each `STYLE` in `api/x402/dance-tip.js` adds a
  `track` field pointing at the audio file.
- Crossfade ambience ↓ + style track ↑ when a dancer starts
  performing. Reverse on exit.
- Master mute / volume controls in the right panel.
- Optional: WebAudio analyser feeding a beat-detection pulse into the
  rim lighting in prompt 04.

→ [prompts/club/05-audio-and-music.md](../../prompts/club/05-audio-and-music.md)

## Scope — camera + interaction

- Free orbit (current) as default.
- Click a pole-card → camera dollies to a VIP shot of that pole
  (front + low + slight tilt up). Escape returns to free orbit.
- `1` / `2` / `3` / `4` keys jump to each pole's VIP shot.
- `0` key returns to overhead "house" cam (top-down, gentle yaw).
- Smooth interpolated transitions, no teleports.
- Touch controls: tap a pole-card on mobile, drag to orbit, pinch to
  zoom.

→ [prompts/club/06-camera-and-controls.md](../../prompts/club/06-camera-and-controls.md)

## Scope — server-backed live tip feed

Today the feed lives in-memory in the browser tab — refresh wipes it,
other visitors can't see your tips. Persist:

- Schema migration: `club_tips (id uuid pk, ticket_id text, dancer
  text, dance text, label text, payer text, network text,
  amount_atomics numeric, asset text, started_at timestamptz,
  ends_at timestamptz, created_at timestamptz default now())`.
- The `dance-tip` paid endpoint, on a settled payment, inserts a row.
- New endpoint `GET /api/club/tips?limit=20` returns recent rows.
- New SSE endpoint `GET /api/club/tips/stream` pushes new rows live.
- `/club` page renders the SSE stream into the right panel and
  preloads the last 20 on boot.

→ [prompts/club/07-tip-feed-realtime.md](../../prompts/club/07-tip-feed-realtime.md)

## Scope — per-dancer leaderboard + payout sweep

- Schema: `club_dancer_wallets (dancer text pk, evm_address text,
  solana_address text, label text, bio text)`.
- Aggregate view: `club_leaderboard` materialized view computing
  per-dancer tip count and atomic sum for `last_hour`, `last_day`,
  `all_time`.
- New endpoint `GET /api/club/leaderboard` returns it.
- Right-panel leaderboard widget rendering live ranks.
- Cron `api/cron/[name].js` handler `club-payouts`: every N minutes,
  sums unpaid tips per dancer, sends payout via existing Solana /
  EVM payout rails (see `api/payments/*`), records the payout
  signature, marks tips paid.

→ [prompts/club/08-leaderboard-and-payouts.md](../../prompts/club/08-leaderboard-and-payouts.md)

## Scope — mobile + low-perf path

- Detect low-perf devices via `navigator.deviceMemory` / `hardwareConcurrency` / pointer type.
- Drop shadow map size, disable bloom + cube-cam reflections, halve
  pixel ratio, skip the mirror ball animation, switch fog to linear.
- Single-pole VIP cam locks become the default layout on screens
  <768px (no orbit drag).
- Test: real iPhone Safari + Pixel Chrome. Frame rate ≥30fps locked.

→ [prompts/club/09-mobile-and-perf.md](../../prompts/club/09-mobile-and-perf.md)

## Scope — end-to-end tests + verification

- Unit: `tests/api/club-tip.test.js` covers `dance-tip` handler — all
  styles, all dancers, error paths.
- Unit: `tests/api/club-feed.test.js` covers `/api/club/tips` +
  SSE handshake.
- Unit: `tests/club-leaderboard.test.js` covers the materialized
  view query and payout sweep math.
- Playwright smoke: `tests/e2e/club.spec.js` boots `npm run dev`,
  visits `/club`, stubs the x402 settle (network intercept), asserts
  a dancer walks to the pole and the named clip plays.
- Manual: tip from a real Phantom wallet on Solana mainnet, watch
  the on-chain confirmation, see the dancer perform.

→ [prompts/club/10-e2e-tests-and-verification.md](../../prompts/club/10-e2e-tests-and-verification.md)

## Asset pipeline

GLBs (venue, dancers, props) authored in Blender, exported with Draco
mesh compression and KTX2 texture compression (see
[prompts/finish-features/add-mesh-compression-deps.md](../../prompts/finish-features/add-mesh-compression-deps.md)
for the loader wiring). All animation clips bake from Mixamo FBX
through the existing
[scripts/build-animations.mjs](../../scripts/build-animations.mjs)
retarget pass; output JSON is committed under
`public/animations/clips/`.

Audio cuts trimmed in Audacity, encoded to OGG Vorbis q4 and MP3 192k
side-by-side; `<audio>` element picks the supported one. License
provenance recorded in `public/club/audio/LICENSES.md`.

## Integration map

| New thing | Touches |
|---|---|
| Venue GLB | [src/club.js](../../src/club.js) bootstrap + scene replacement |
| Dancer GLBs | [src/club.js](../../src/club.js) `PoleStation.attachAvatar` + new dancer registry |
| Pole rig GLB | [src/club.js](../../src/club.js) pole primitive replacement |
| Pole clips | [public/animations/manifest.json](../../public/animations/manifest.json), `STYLES` in [api/x402/dance-tip.js](../../api/x402/dance-tip.js) |
| Lighting + postfx | [src/club.js](../../src/club.js) renderer + light setup |
| Audio | New `src/club-audio.js`, right-panel UI in [pages/club.html](../../pages/club.html) |
| Camera | New `src/club-camera.js`, [src/club.js](../../src/club.js) animate loop |
| Tip feed (SSE) | New `api/club/tips.js`, [api/x402/dance-tip.js](../../api/x402/dance-tip.js) `handler`, [src/club.js](../../src/club.js) feed render |
| Leaderboard + payouts | New `api/club/leaderboard.js`, `api/cron/[name].js` new branch, schema migration |
| Tests | New `tests/api/club-*.test.js`, `tests/e2e/club.spec.js` |

## Done

The full feature is shippable when:

1. Every prompt under `prompts/club/` is closed.
2. `/club` loads in <3s on broadband desktop, <6s on 4G mobile.
3. A real Phantom wallet on mainnet can tip a dancer end-to-end with
   no console errors, the dancer performs the chosen routine with
   pole choreography, the tip lands in the live feed across all open
   browser tabs, the leaderboard updates, and the dancer's wallet
   receives the payout within the cron window.
4. `npm test` green.
5. Playwright smoke green.
6. Both remotes pushed.
