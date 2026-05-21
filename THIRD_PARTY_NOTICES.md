# Third-Party Notices

three.ws is licensed under [Apache-2.0](LICENSE). It incorporates third-party
material whose original copyright notices and license terms are reproduced
below as required.

This file is not exhaustive of npm dependencies — each dependency retains its
own license as declared in its package metadata. The entries here cover code
and assets that were copied, forked, or otherwise vendored into this
repository.

---

## 1. CharacterStudio — [character-studio/](character-studio)

The `character-studio/` directory is derived from
[M3-org/CharacterStudio](https://github.com/M3-org/CharacterStudio),
copyright (c) 2022 Atlas Foundation, distributed under the MIT License.

The upstream LICENSE text is reproduced in [character-studio/LICENSE](character-studio/LICENSE).

Modifications by three.ws contributors include integration with the three.ws
runtime, additional chain providers, and UI changes. Modified portions remain
under the MIT License with respect to upstream Atlas Foundation copyright; new
contributions by three.ws are dual-available under Apache-2.0.

---

## 2. Mixamo animations — [public/animations/](public/animations)

The `*.fbx` clips in `public/animations/` and the retargeted `*.glb` clips in
`public/animations/clips/` are sourced from
[Adobe Mixamo](https://www.mixamo.com/). Per Adobe's Mixamo FAQ, Mixamo
animations are licensed royalty-free for personal, commercial, and
non-profit projects, including as part of products distributed to third
parties.

The build-time retargeting pipeline that produces the GLB clips is implemented
in [scripts/build-animations.mjs](scripts/build-animations.mjs).

Mixamo is a trademark of Adobe Inc.

---

## 3. Avatar reference meshes — [public/avatars/](public/avatars)

The reference avatar meshes (`cz.glb`, `default.glb`) used as canonical skeleton
targets for the animation retargeting pipeline are compatible with the
[Avaturn](https://avaturn.me/) skeleton layout. Sample assets shipped here are
used per the originating service's terms for personal and commercial use.

If you ship a downstream product that bundles these meshes, verify the current
terms of the upstream avatar service for your use case.

---

## 4. Asset notice — accessories

The `*.glb` accessories in [public/accessories/](public/accessories) (hats,
glasses, earrings) and the procedural club props built by
[scripts/build-club-props.mjs](scripts/build-club-props.mjs) are original
content authored for three.ws unless otherwise noted in a sibling
`ATTRIBUTION.txt` next to a specific asset.

---

## 5. npm dependencies

All npm packages declared in [package.json](package.json) and every workspace
manifest retain their declared licenses. Run `npx license-checker --summary`
from the repo root for a current rollup. Notable copyleft-adjacent or
attribution-requiring dependencies in the dependency tree are listed by that
report; this file does not duplicate it.

---

## Reporting

If you believe this repository ships content whose attribution is missing,
incorrect, or whose license terms are not being honored, open an issue at
<https://github.com/nirholas/three.ws/issues> or email
<support@three.ws> and we will correct it promptly.
