# IRL + XR Task Queue

Tasks from the IRL/XR session — run each in a fresh Claude Code chat.

| # | File | Summary | Effort |
|---|------|---------|--------|
| 01 | [01-xr-avatar-lock.md](01-xr-avatar-lock.md) | Add pin/lock toggle to /xr (orbit lock instead of movement lock) | Small |
| 02 | [02-avatar-picker-thumbnail-3d.md](02-avatar-picker-thumbnail-3d.md) | Render live 3D GLB thumbnails in the avatar picker when no image exists | Medium |
| 03 | [03-irl-xr-deeplink.md](03-irl-xr-deeplink.md) | "Walk IRL" + "View in XR" buttons on avatar detail page | Small |
| 04 | [04-irl-scene-persistence.md](04-irl-scene-persistence.md) | Save/restore chosen avatar, lock state, and placed objects to localStorage | Small |
| 05 | [05-irl-xr-screenshot.md](05-irl-xr-screenshot.md) | Screenshot + share: composites 3D canvas + camera feed, native share sheet | Medium |

## What's already done (this session)

- `/xr` loading overlay stuck fix (`#xr-loading[hidden] { display: none }`)
- Avatar picker bottom sheet (`src/avatar-picker.js`) — shared by IRL + XR
- `/irl` avatar picker wired (Avatar pill button → hot-swap GLB in-scene)
- `/xr` avatar picker wired (Change button → hot-swap GLB in-scene)
- `/irl` avatar lock (Lock pill → freezes movement, unfreezes camera orbit in AR mode)

## Run order

01 → 03 → 04 → 05 → 02 (02 is the most complex; save for last)
