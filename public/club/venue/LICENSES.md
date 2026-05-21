# /club/venue asset provenance

Both files in this directory are synthesised at build time from procedural
geometry / sampled radiance functions:

- [scripts/build-club-venue.mjs](../../../scripts/build-club-venue.mjs) →
  `club-venue.glb` (authored via `@gltf-transform/core`)
- [scripts/build-club-hdri.mjs](../../../scripts/build-club-hdri.mjs) →
  `club-hdri.hdr` (Radiance RGBE, no third-party samples)

Because nothing in either file traces back to a third-party asset, three.ws
holds full copyright and dedicates them to the public domain under
**Creative Commons CC0 1.0 Universal**
(https://creativecommons.org/publicdomain/zero/1.0/). Use, modify, and
redistribute freely; attribution is appreciated but not required.

| File | Source | License | Notes |
|---|---|---|---|
| `club-venue.glb` | Authored — primitive geometry assembled via `@gltf-transform/core` | CC0 1.0 | Floor disc, cylinder wall, ceiling, bar + neon backsplash, truss beams, per-slot backstage doors. All 14 named empties from the `src/club-venue.js` contract are present. |
| `club-hdri.hdr` | Authored — radiance functions sampled into Radiance RGBE | CC0 1.0 | 128×64 equirectangular. Dark purple wash + four warm/coloured spot bumps + mirrorball ring + bar back-glow. Tuned for PBR reflections (`scene.environment`) only — background stays the dark fog colour. |

## Upgrading to artist-authored assets

The named-empty contract in [src/club-venue.js](../../../src/club-venue.js)
is the only thing the runtime depends on. Drop a richer
`club-venue.glb` / `club-hdri.hdr` into this directory (e.g. a Polyhaven
CC0 nightclub HDR + a hand-modelled GLB) and the page will pick it up on
next load. Update this file with provenance for each replacement asset
before committing:

```markdown
### `club-venue.glb`
- **Source**: https://example.com/asset-page
- **Author**: Studio name
- **License**: CC0 1.0 (or SPDX identifier)
- **Modifications**: named-empty injection, draco compression, ...
```

## Regenerating the procedural baseline

```sh
npm run build:club-venue   # → club-venue.glb
npm run build:club-hdri    # → club-hdri.hdr
npm run build:club-assets  # → both props + venue (in one shot)
```

Output is deterministic — same input code produces byte-identical files —
so committed files only change when a builder script changes.
