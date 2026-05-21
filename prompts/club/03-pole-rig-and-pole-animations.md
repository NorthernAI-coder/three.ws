# Task: Real pole rig GLB + pole-specific dance clips

## Repo context

Working tree: `/workspaces/three.ws`. Today the pole at
[src/club.js:234-247](../../src/club.js) is a single
`CylinderGeometry(0.05, 0.05, 3.6)` chrome cylinder, floating between
a stage disc and nothing. There's no ceiling mount, no flared base, no
spotlight hardware attached.

The animation clips driven by tips
([api/x402/dance-tip.js:22-28](../../api/x402/dance-tip.js)) —
`rumba`, `silly`, `thriller`, `capoeira`, `hiphop` — are generic
Mixamo free-floor clips. None of them touch the pole. The dancer
performs *next to* the pole, not *on* it.

## Rails (CLAUDE.md — non-negotiable)

- No primitive cylinder shipped as a "pole." Authored GLB.
- No reusing existing free-floor clips as "pole choreography."
- Animation clips authored / sourced under a commercial-use license,
  baked via the project's existing retarget pipeline, registered in
  `public/animations/manifest.json`, exposed via the
  `dance-tip` `STYLES` map.
- Done = a tip with `dance=spin` plays a real pole-spin clip on the
  dancer, the dancer's hands actually grip the pole (foot/hand IK
  matches the pole position).

## Subagent delegation

### Subagent A (Explore)

> In `/workspaces/three.ws`, return:
>
> 1. The retarget pipeline in
>    [scripts/build-animations.mjs](../../scripts/build-animations.mjs)
>    — what it consumes, what it emits, how it's invoked, and
>    whether it supports pole-anchored hand/foot targets.
> 2. The current `STYLES` map in
>    [api/x402/dance-tip.js](../../api/x402/dance-tip.js):26-28 and
>    every place it's referenced.
> 3. How `AnimationManager.crossfadeTo` is invoked from
>    [src/club.js](../../src/club.js) (`PoleStation.startPerformance`,
>    `_arriveAtPole`, `_endPerformance`).
> 4. Whether `src/animation-state-machine.js` is used anywhere
>    relevant — would a state machine help for the entry → spin →
>    invert → bow sequence?

### Subagent B (Explore)

> Quote `public/animations/manifest.json` clip list. Confirm which
> clip names already exist (e.g. `walk`, `idle`, `rumba`). Then list
> the new pole-specific clip names this task needs to add and what
> Mixamo / source clip each should originate from.

Wait for both.

## What to implement

### Step 1 — pole rig GLB

Author `public/club/props/pole.glb`:

- A 3.6m chrome pole (`PoleHeight` in `src/club.js:57`).
- Flared circular base, 0.45m radius, brushed chrome material.
- Ceiling mount: a flat plate at the top, four small bolts visible.
- Spotlight bracket on the mount with an empty `pole.light.attach`
  for prompt 04 to anchor `SpotLight`s.
- Optional: subtle smudge/handprint roughness map (no two poles
  identical — variation comes from material instance tint).

Save to `public/club/props/pole.glb`. ≤500 KB compressed.

Replace the cylinder in
[src/club.js:234-247](../../src/club.js) with an instanced
`SkeletonUtils.clone()` of the pole GLB, positioned at each
`POLES[i].x/z`. Tint the chrome material with the slot accent via a
`material.clone()` + emissive offset (subtle — 0.02–0.05).

### Step 2 — pole stage disc

Replace the `CylinderGeometry` stage disc
([src/club.js:218-230](../../src/club.js)) with a stage GLB:

- 1.1m radius, 0.18m tall, slightly tilted top with anti-slip
  texture, LED strip around the edge (named empty
  `stage.led.strip` for prompt 04 to drive emissive pulse).
- Save to `public/club/props/stage.glb`.

### Step 3 — pole choreography clips

Author / source the following clips, retargeted to the canonical
skeleton via
[scripts/build-animations.mjs](../../scripts/build-animations.mjs).
Each ends with the dancer's hands and feet at known offsets relative
to a 3.6m pole at origin:

| Clip name | Duration | Loop? | Source | Notes |
|---|---|---|---|---|
| `pole-walk-on` | ~3.0s | false | Mixamo "Strut Walk" trimmed | Ends at pole with right hand on pole at 1.4m height |
| `pole-spin` | ~4.0s | true | Mixamo "Pole Spin" or custom mocap | Right hand at 2.0m, left hand at 1.4m, full body revolution |
| `pole-climb` | ~5.0s | false | Custom mocap | Climbs from 0 to 2.0m, holds, descends |
| `pole-invert` | ~6.0s | true | Custom mocap | Upside-down hang, legs locked around pole at 2.4m |
| `pole-floorwork` | ~5.0s | true | Mixamo "Floor Work" retargeted | On the stage disc, low to ground |
| `pole-bow` | ~2.0s | false | Mixamo "Bow" | Exits forward off the stage |

Output JSON to `public/animations/clips/pole-*.json`. Register in
`public/animations/manifest.json` with `icon` field (a Unicode glyph
or emoji to render in the picker — pole emoji 🪩, spin 🌀, etc.).

Source licensing recorded in
`public/animations/LICENSES.md` (extend the existing one if it
exists; create if not).

### Step 4 — sequence playback

The current `PoleStation.startPerformance` plays a single clip then
ends. Add a sequence-capable wrapper:

```js
// In PoleStation:
async startPerformance(ticket) {
  this.performing = true;
  this.activeTicket = ticket;
  const seq = ticket.sequence ?? [{ clip: ticket.clip, durationSec: ticket.durationSec }];
  this.walkPhase = 'to-pole';
  await this.anim.crossfadeTo(WALK_CLIP, PERFORMANCE_FADE);
  // ...arrive at pole...
  for (const step of seq) {
    if (!this.performing) break;
    await this.anim.crossfadeTo(step.clip, PERFORMANCE_FADE);
    await sleep(step.durationSec * 1000);
  }
  await this._endPerformance();
}
```

A `sleep()` helper that's *not* `setTimeout` faking work — it
awaits a real timer that participates in the render loop's clock.

### Step 5 — expand `STYLES`

In [api/x402/dance-tip.js:22-28](../../api/x402/dance-tip.js):

```js
const STYLES = Object.freeze({
  // Free-floor (existing)
  rumba:    { clip: 'rumba',    label: 'Rumba',   loop: true, durationSec: 14 },
  silly:    { clip: 'silly',    label: 'Silly',   loop: true, durationSec: 10 },
  thriller: { clip: 'thriller', label: 'Thriller',loop: true, durationSec: 14 },
  capoeira: { clip: 'capoeira', label: 'Capoeira',loop: true, durationSec: 12 },
  hiphop:   { clip: 'dance',    label: 'Hip Hop', loop: true, durationSec: 12 },

  // Pole choreography (new)
  spin:    { sequence: [
    { clip: 'pole-spin', durationSec: 8 },
    { clip: 'pole-bow',  durationSec: 2 },
  ], label: 'Pole Spin',   durationSec: 10 },
  climb:   { sequence: [
    { clip: 'pole-climb',   durationSec: 5 },
    { clip: 'pole-invert',  durationSec: 6 },
    { clip: 'pole-bow',     durationSec: 2 },
  ], label: 'Climb + Invert', durationSec: 13 },
  combo:   { sequence: [
    { clip: 'pole-spin',     durationSec: 4 },
    { clip: 'pole-climb',    durationSec: 4 },
    { clip: 'pole-invert',   durationSec: 4 },
    { clip: 'pole-floorwork',durationSec: 4 },
    { clip: 'pole-bow',      durationSec: 2 },
  ], label: 'Combo', durationSec: 18 },
});
```

Update `OUTPUT_EXAMPLE`, `OUTPUT_SCHEMA`, `INPUT_SCHEMA`'s `dance`
enum, and the bazaar schema.

### Step 6 — hand/foot IK alignment (optional but recommended)

If the pole GLB's exact world position drifts from where the clip
was authored, the dancer's hand will pass through the pole or miss
it. Add a one-pass IK correction at clip load time:

- Read the pole's world `x/z` from the venue empty.
- Translate the clip's `track` keyframes for the hand bones by the
  delta from the clip's authored origin. This is a small offset, no
  per-frame solver needed.

If the artist can author all clips at the same canonical pole
position relative to the dancer rig origin, this step is a no-op.

### Step 7 — manual end-to-end

```bash
npm run dev
```

Tip a dancer with `dance=spin`. Confirm:

- Dancer walks from backstage to pole.
- Hand makes contact at the right height (no clipping, no air gap).
- Clip loops cleanly for 8s.
- `pole-bow` plays, dancer walks back.

Repeat for `climb` and `combo`.

### Step 8 — tests

`tests/api/dance-tip.test.js` (extend existing if present):

- All new style keys return a 402 challenge then settle to a
  ticket whose `sequence` matches the `STYLES` table.
- Unknown style returns 400 with `unknown_dance`.
- Bazaar schema validates.

`tests/club-station.test.js`:

- Mock `AnimationManager.crossfadeTo`; assert
  `PoleStation.startPerformance` calls it in sequence order with
  matching durations.
- Cancellation: setting `performing = false` mid-sequence stops
  the next crossfade.

## Definition of done

- `public/club/props/pole.glb` + `stage.glb` authored and loaded.
- 6 new pole-* clips exist in
  `public/animations/clips/` and `public/animations/manifest.json`.
- `STYLES` exports `spin`, `climb`, `combo` (free-floor still
  available).
- `/club` tip flow plays sequences end-to-end with visible hand
  contact on the pole.
- Tests green.

## Constraints

- Do not synthesize pole clips with a clever procedural shader. If
  the choreography isn't authored, it doesn't ship.
- Do not author the new clips against a different skeleton — they
  must drive the same bones as `idle`/`walk`.
- Do not break existing free-floor styles (`rumba`, etc.) when
  adding sequences. The `STYLES` schema must accept both `clip`-
  only entries and `sequence` entries.
