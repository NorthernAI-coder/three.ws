# Feature task prompts

Standalone, assign-to-an-agent prompts for closing gaps in the 3D generation pipeline. Each file is self-contained: hand it to an agent as the task. All tasks must follow the rules in [CLAUDE.md](../../CLAUDE.md) — real APIs, no mocks, every state designed, self-reviewed diffs.

| # | Task | Impact | Rough effort |
|---|------|--------|--------------|
| 01 | [Multiview-to-3D](01-multiview-to-3d.md) | High — biggest quality lever | Medium |
| 02 | [FBX export](02-fbx-export.md) | High — unblocks game-engine users | Small–Medium |
| 03 | [Parts segmentation](03-parts-segmentation.md) | High — clear differentiator | Large |
| 04 | [Quad remesh + low-poly](04-quad-remesh-low-poly.md) | High — game-ready topology | Medium |
| 05 | [Magic Brush local retexture](05-magic-brush-local-retexture.md) | Medium — user control | Medium–Large |
| 06 | [Stylization filters](06-stylization-filters.md) | Medium — shareable delight | Medium |
| 07 | [Animation preset library](07-animation-preset-library.md) | Medium — closes rig→motion loop | Medium |
| 08 | [Higher-res / native geometry](08-native-geometry-highres.md) | High — fidelity ceiling | Large (research-first) |

## Suggested order
Ship in roughly this order: **02 → 01 → 04 → 03 → 06 → 07 → 05 → 08**. FBX export and multiview are the cheapest high-impact wins; native geometry (08) is research-first and biggest.
