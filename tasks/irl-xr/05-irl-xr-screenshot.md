# IRL + XR Screenshot / Share

## What to build

Add a **screenshot** button to both `/irl` and `/xr` that captures the current Three.js canvas (with or without the camera feed composited) and either:
1. Shares via the native Web Share API (`navigator.share`) on mobile with `files: [blob]`
2. Downloads as a PNG on desktop

The IRL page already has a "Share" button in the top bar — extend it to capture the frame first. XR has no share affordance yet — add one.

## Context

**`/irl`** (`pages/irl.html` + `src/irl.js`):
- Three.js canvas: `#irl-canvas`, rendered by `renderer` (a `WebGLRenderer`)
- Camera feed: `#irl-camera` (a `<video>`) — visible only in AR mode (`body.is-ar`)
- Existing share button: `#irl-share-btn` in the top bar — currently copies URL to clipboard
- `renderer` is accessible at module scope in `src/irl.js`

**`/xr`** (`pages/xr.html` + `src/xr.js`):
- Three.js canvas: `#xr-canvas`
- Camera feed: `#xr-camera-feed` (a `<video>`)
- No share button exists yet
- `renderer` is accessible at module scope in `src/xr.js`

## Compositing

In AR mode, the real picture is: video (background) + 3D canvas (foreground with alpha). To composite both into one PNG:

```js
async function captureFrame(renderer, videoEl, isArActive) {
    // Ensure preserveDrawingBuffer is true on the renderer
    // (set it at renderer construction time)

    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');

    if (isArActive && videoEl && !videoEl.paused) {
        // Draw the camera feed first (background)
        ctx.drawImage(videoEl, 0, 0, w, h);
    }

    // Draw the Three.js frame on top
    // Force a render so the pixels are fresh
    // (renderer must have been created with preserveDrawingBuffer: true)
    ctx.drawImage(renderer.domElement, 0, 0);

    return new Promise(resolve => out.toBlob(resolve, 'image/png'));
}
```

**Important:** `WebGLRenderer` must be constructed with `preserveDrawingBuffer: true`. Currently both pages construct it without this flag — add it.

## Sharing

```js
async function shareOrDownload(blob, filename) {
    if (navigator.share && navigator.canShare?.({ files: [new File([blob], filename)] })) {
        await navigator.share({
            title: 'My 3D avatar — three.ws',
            files: [new File([blob], filename, { type: 'image/png' })],
        });
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
}
```

## IRL changes

1. Add `preserveDrawingBuffer: true` to the `WebGLRenderer` constructor in `src/irl.js`
2. Replace the existing `#irl-share-btn` click handler (which only copies URL) with:
   - Capture frame → share/download PNG
   - Fallback to URL copy if capture fails

## XR changes

1. Add `preserveDrawingBuffer: true` to the `WebGLRenderer` constructor in `src/xr.js`
2. Add a screenshot button to `pages/xr.html` (top bar, right side — same position as IRL's share button)
3. Wire it to `captureFrame` + `shareOrDownload`

## Files to touch

- `src/irl.js` — add `preserveDrawingBuffer: true`, replace share handler
- `src/xr.js` — add `preserveDrawingBuffer: true`, add screenshot handler
- `pages/xr.html` — add screenshot button to top bar

## Notes

- `preserveDrawingBuffer: true` has a small performance cost (disables buffer swap optimization). It's acceptable on these pages since they're not performance-critical multiplayer scenes.
- On iOS, `navigator.share` with `files` requires iOS 15+. The download fallback handles older devices.
- The compositing canvas must match the renderer's pixel size, not CSS size (`renderer.domElement.width`, not `window.innerWidth`).

## Definition of done

- Tapping Share/Screenshot on mobile opens the native share sheet with a PNG attached
- On desktop, tapping downloads a PNG
- In AR mode, the downloaded image shows the camera feed + 3D avatar composited together
- `preserveDrawingBuffer: true` is set on both renderers
- No console errors

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-xr/05-irl-xr-screenshot.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
