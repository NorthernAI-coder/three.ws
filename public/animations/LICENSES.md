# Animation clip licensing

This file records the upstream source and license for every clip in
`/public/animations/clips/`. Each entry uses the canonical-skeleton JSON
emitted by [`scripts/build-animations.mjs`](../../scripts/build-animations.mjs)
from a source FBX.

## Mixamo (commercial use OK)

All clips below were exported from [mixamo.com](https://www.mixamo.com/) under
an authenticated Adobe Creative Cloud account. Mixamo's terms allow free
commercial use of exported animations as part of a product (Mixamo Terms of
Use §2 — characters and animations may be used in personal, commercial, or
non-profit projects).

| Clip name in manifest | Mixamo source | Notes |
|---|---|---|
| `idle` | Idle | trim |
| `walk` | Walking | trim |
| `dance` | Hip Hop Dancing | loop |
| `rumba` | Rumba Dancing | loop |
| `silly` | Silly Dancing | loop |
| `thriller` | Thriller Part 2 | loop |
| `capoeira` | Capoeira | loop |
| `kiss` | Blow A Kiss | — |
| `pray` | Praying | — |
| `wave` | Waving | — |
| `taunt` | Taunt | — |
| `angry` | Angry Gesture | — |
| `celebrate` | Cheering | — |
| `reaction` | Surprised | — |
| `defeated` | Defeated | — |
| `dying` | Dying | — |
| `falling` | Falling | — |
| `falltolanding` | Falling To Landing | — |
| `jump` | Jumping | — |
| `jumpdown` | Jump Down | — |
| `jumpdown2` | Jump Down (Light) | — |
| `jumpdown3` | Jump Down (Heavy) | — |
| `header` | Soccer Header | — |
| `goalkeeper` | Goalkeeper Save | — |
| `dodge` | Dodging | — |
| `stepback` | Step Back | — |
| `shoved` | Pushed To Floor | — |
| `coverstand` | Cover Stand | — |
| `removing` | Standup Cover | — |
| `standup` | Standing Up | — |
| `sitclap` | Sitting Clap | — |
| `sitidle` | Sitting Idle | — |
| `sitlaugh` | Sitting Laughing | — |
| `downdog` | Down Dog | — |

To add a new Mixamo clip:

1. Log into Mixamo, find the animation, choose **In Place** and **Without Skin**,
   download as FBX (binary, 30fps).
2. Drop the FBX into the source directory consumed by
   [scripts/build-animations.mjs](../../scripts/build-animations.mjs).
3. Run `npm run build:animations` to retarget to the canonical skeleton and
   emit the JSON under `/public/animations/clips/`.
4. Register the clip in [`/public/animations/manifest.json`](./manifest.json)
   with a `name`, `url`, `label`, `icon`, and `loop` flag.
5. Add a row to the table above with the Mixamo source name.

## Custom mocap

> _No custom-mocap clips have shipped yet._

When a non-Mixamo source lands here (custom recording, third-party studio,
etc.), add a section below covering: the clip name, the licensor, the license
terms (commercial use, attribution requirements, derivative works), and a
link to the signed agreement or storefront receipt.

## Pole choreography (pending)

The `/api/x402/dance-tip` endpoint advertises three pole choreography styles
— `spin`, `climb`, `combo` — that chain the following clip names:

- `pole-walk-on`
- `pole-spin`
- `pole-climb`
- `pole-invert`
- `pole-floorwork`
- `pole-bow`

These clips are **not yet shipped**. Until the source FBX (Mixamo "Strut Walk",
"Pole Spin", "Floor Work", "Bow" — and custom mocap for `pole-climb` /
`pole-invert`) lands and `npm run build:animations` regenerates them, a tip
with `dance=spin|climb|combo` will pay successfully and the dancer will walk
on stage, but `AnimationManager.crossfadeTo` will warn that the clip is
unavailable and skip the missing step. Add the entries to the table above
when the FBX sources are committed.
