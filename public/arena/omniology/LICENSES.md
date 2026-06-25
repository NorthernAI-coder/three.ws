# /arena/omniology asset provenance

Both files in this directory are synthesised at build time from procedural
geometry / sampled radiance functions — nothing traces back to a third-party
asset, so three.ws holds full copyright and dedicates them to the public
domain under **Creative Commons CC0 1.0 Universal**
(https://creativecommons.org/publicdomain/zero/1.0/). Use, modify, and
redistribute freely; attribution is appreciated but not required.

- [scripts/build-arena-venue.mjs](../../../scripts/build-arena-venue.mjs) →
  `venue.glb` (authored via `@gltf-transform/core`)
- [scripts/build-arena-hdri.mjs](../../../scripts/build-arena-hdri.mjs) →
  `hdri.hdr` (Radiance RGBE, no third-party samples)

| File        | Source                                                             | License | Notes                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `venue.glb` | Authored — primitive geometry assembled via `@gltf-transform/core` | CC0 1.0 | Floor + glowing inlay ring, sealed walls + ceiling cove, three canted contest-screen bays, an entry desk. Every anchor in the `src/game/arena/arena-venue.js` contract is present (`spawn_01`, `screen_01..03`, `desk_01`, `light_*`, `camera_intro`). |
| `hdri.hdr`  | Authored — radiance functions sampled into Radiance RGBE           | CC0 1.0 | 128×64 equirectangular. Cool blue hemisphere + warm entry key glow + cyan/magenta/amber contest-wall band + ceiling cove sheen. Tuned for PBR reflections (`scene.environment`) only — the background stays the dark arena fog colour.            |

## The named-anchor contract

The only thing the runtime depends on inside `venue.glb` is the set of named
empties enumerated in
[src/game/arena/arena-venue.js](../../../src/game/arena/arena-venue.js)
(`ARENA_REQUIRED_EMPTIES`). The loader runs `collectArenaEmpties()` which
throws a named error if any anchor is missing — there is no silent fallback.
Underscore names (`screen_01`, not `screen.01`) survive three.js's
`PropertyBinding.sanitizeNodeName`; mirror that convention in any replacement.

## Upgrading to artist-authored assets

Drop a richer `venue.glb` / `hdri.hdr` into this directory (e.g. a hand-modelled
GLB + a Polyhaven CC0 HDR) and the page picks it up on next load — provided the
GLB still exposes every `ARENA_REQUIRED_EMPTIES` anchor with underscore names.
Update this file with provenance for each replacement before committing:

```markdown
### `venue.glb`

- **Source**: https://example.com/asset-page
- **Author**: Studio name
- **License**: CC0 1.0 (or SPDX identifier)
- **Modifications**: named-empty injection, draco compression, ...
```

## Regenerating the procedural baseline

```sh
npm run build:arena-venue   # → venue.glb
npm run build:arena-hdri    # → hdri.hdr
npm run build:arena-assets  # → both, in one shot
```

Output is deterministic — the same builder code produces byte-identical files —
so committed assets only change when a builder script changes.
