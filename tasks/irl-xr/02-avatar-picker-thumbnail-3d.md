# Avatar Picker — 3D Thumbnail Previews

## What to build

Upgrade the avatar picker bottom sheet (`src/avatar-picker.js`) so each card shows a live 3D thumbnail rendered from the GLB, not a flat image. If no `thumbnail_url` exists (common for user-uploaded avatars), render the GLB in a tiny offscreen Three.js canvas instead of the blank silhouette placeholder.

## Context

`src/avatar-picker.js` is a shared bottom-sheet component used by both `/irl` and `/xr`. It fetches `GET /api/avatars` and renders a grid of cards. Currently each card shows:
- `thumbnail_url` (a flat image) if available, OR
- An SVG silhouette placeholder if the avatar has no thumbnail

The placeholder silhouette looks weak. Many user avatars lack a thumbnail. A 3D render gives a much better preview.

## Approach

Use a single shared offscreen `WebGLRenderer` with a tiny orthographic/perspective camera. Render each GLB into it one at a time (they're loaded lazily as the user scrolls through the grid — use `IntersectionObserver`). Cache rendered canvases as `data:image/png` URLs so each GLB is only rendered once per picker session.

```
OffscreenRenderer (singleton, 256×256)
  └─ for each card entering viewport:
       1. fetch + parse GLB (GLTFLoader.loadAsync)
       2. center + scale scene to fill frame
       3. renderer.render(scene, camera) → canvas.toDataURL()
       4. set as card <img> src
       5. dispose GLB from scene
```

## Implementation sketch

```js
// inside avatar-picker.js

let _offscreenRenderer = null;

function getOffscreenRenderer() {
    if (_offscreenRenderer) return _offscreenRenderer;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const { WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Box3, Vector3 } = THREE;
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(256, 256);
    // ... camera + lights setup
    _offscreenRenderer = { renderer, /* camera, scene, lights */ };
    return _offscreenRenderer;
}

async function render3dThumbnail(glbUrl) {
    // GLTFLoader.loadAsync(glbUrl)
    // fit to frame
    // render → canvas.toDataURL('image/png')
    // return data URL
}
```

Use `IntersectionObserver` on each card's thumbnail div to trigger `render3dThumbnail` lazily (don't render all 50 avatars upfront).

## Files to touch

- `src/avatar-picker.js` — add offscreen renderer + lazy 3D thumbnail logic

## Notes

- The offscreen renderer must be created lazily (first card load), not at module import time, to avoid a WebGL context being created when the picker is never opened
- Dispose of each loaded GLB scene after rendering to free GPU memory — only the PNG data URL is kept
- If the GLB fails to load, silently fall back to the existing placeholder
- No new npm packages — Three.js is already imported elsewhere in the project via Vite (import from `'three'` and `'three/addons/loaders/GLTFLoader.js'`)
- Import Three.js dynamically inside the render function to keep the picker's initial bundle lean

## Definition of done

- Cards without a `thumbnail_url` show a 3D render of the actual GLB
- 3D thumbnails load lazily as cards enter the viewport (IntersectionObserver)
- No perceptible freeze when the picker opens (renders happen async)
- No console errors on open/close

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-xr/02-avatar-picker-thumbnail-3d.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
