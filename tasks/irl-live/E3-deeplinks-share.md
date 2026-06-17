# E3 — Deep-links & share (View in IRL/XR + composite screenshot)

> **Supersedes `tasks/irl-xr/03-irl-xr-deeplink.md` and `tasks/irl-xr/05-irl-xr-screenshot.md`.**
> Both partially landed since those were written — this task reconciles what
> already ships with what's still missing. Treat 03/05 as reference only.

## Goal

1. **"View in IRL" / "View in XR" buttons on agent _and_ avatar detail pages** that
   deep-link to `/irl` (and `/xr`) with that agent/avatar preselected and loaded.
2. **A screenshot/share feature** that composites the 3D canvas over the camera feed
   into one image and offers it through the native share sheet (`navigator.share`
   with `files`), with a desktop download fallback.

## Why it matters

The platform feels linked only when every surface routes into the immersive layer.
An agent's profile that can't drop you into IRL with *that agent* is a dead end. And
a one-tap composite share ("here's my agent standing in my room") is the
screenshot-and-post moment that drives the loop — it must be real (camera + 3D
flattened into one PNG), not a bare canvas grab.

## Current state (real lines)

- **Avatar detail — already done.** `src/avatar-page.js:289-301` already renders the
  `.av-ar-row` with **View in AR**, **Walk IRL** (`/irl?avatar=<id>`), and
  **View in XR** (`/xr?avatar=<id>`). E3 does **not** rebuild this — it verifies
  parity and reuses the markup/icon pattern for the agent page.
- **Agent detail — missing the IRL/XR pair.** `src/agent-detail.js` has only a
  "View in AR" world link via `seeInWorldHref(agent)` (`:466-477`, the `#ad-3d-modal-world`
  link). There is **no** "View in IRL"/"View in XR" CTA on the agent page. This is
  the real gap to fill.
- **Deep-link target.** `/irl` reads `?avatar=<id>` (`src/irl.js:64`) and resolves
  via `resolveAvatarUrl()` / `loadAvatar()` (`:67`, `:554`). An agent page has an
  `agent.id`; map it to its avatar (the agent's `avatar_id`/`asset`) so the deep
  link preselects the **agent's** body, and pass through to the inspect/profile wiring.
- **Screenshot — already implemented inline, but only on `/irl`.** `pages/irl.html:886-945`
  has a working `#irl-share-btn` handler that composites `#irl-camera` (when
  `body.is-ar`) under `#irl-canvas` and shares via `navigator.share`/`canShare` with
  a download fallback. Renderer is built with `preserveDrawingBuffer:true`
  (`src/irl.js:103`). So 05's IRL portion is **done** — but it's an inline `<script>`,
  not reusable, and `/xr` still has no share affordance.

## What to build

### A. Agent-page IRL/XR deep-link CTAs (`src/agent-detail.js`)

Add a **View in IRL** + **View in XR** pair near the existing AR/world link. Resolve
the agent's avatar id so the link preselects the agent's body:

```js
// agent.avatar_id (or agent.asset / agent.glb) → /irl?avatar=<id>&agent=<agent.id>
function irlHref(agent) {
  const av = agent.avatar_id || agent.asset || '';
  const sp = new URLSearchParams();
  if (av) sp.set('avatar', av);
  if (agent.id) sp.set('agent', agent.id);  // lets /irl deep-focus this agent's pin / inspect card
  return `/irl${sp.toString() ? '?' + sp : ''}`;
}
const xrHref = (a) => `/xr?avatar=${encodeURIComponent(a.avatar_id || a.asset || '')}`;
```

Render as `<a href>` (right-click / new-tab friendly), matching `.av-ar-btn` styling
and the walk/cube icons used at `src/avatar-page.js:294-300`. Gate visibility on a
resolvable body (every agent has one — custom GLB or mannequin — so the href is
always real, same invariant the world link relies on at `:467`). Add a new
`&agent=` handler in `src/irl.js` that, once nearby pins load, focuses/opens the
matching pin's inspect card (reuse `highlightPinId` flash at `:933` + `openPinSheet`).

### B. Reusable composite-share module (`src/irl/share-frame.js`)

Lift the inline IRL handler into a module so `/xr` reuses it and IRL imports it
(delete the duplicated inline `<script>` in `pages/irl.html` once ported):

```js
// src/irl/share-frame.js
export async function captureComposite({ canvas, video, isAR }) {
  const w = canvas.width, h = canvas.height;          // renderer pixel size, not CSS
  if (!w || !h) return null;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  if (isAR && video && !video.paused) {                // camera feed = background
    try { ctx.drawImage(video, 0, 0, w, h); } catch {}
  }
  try { ctx.drawImage(canvas, 0, 0); } catch {}        // 3D (alpha) over the top
  return await new Promise((r) => out.toBlob(r, 'image/png'));
}

export async function shareOrDownload(blob, { filename = 'three-ws-irl.png', title = 'IRL · three.ws', fallbackUrl } = {}) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title, files: [file] }); return 'shared';
  }
  const url = URL.createObjectURL(blob);               // desktop download
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000); return 'downloaded';
}
```

Requires `preserveDrawingBuffer:true` on the renderer (already set in IRL at `:103`;
**add it in `src/xr.js`** if absent). All states designed: button shows
`…` while capturing, then `Shared!` / `Saved!`, and on a blank-canvas/share-abort
failure falls back to URL share → clipboard copy (the existing IRL fallback chain).

### C. Add share to `/xr`

`pages/xr.html` has no share button — add one in the topbar (mirror `.irl-share-btn`
position), wire to `captureComposite({ canvas:'#xr-canvas', video:'#xr-camera-feed',
isAR: <xr/passthrough active> })` + `shareOrDownload`. Confirm `src/xr.js` renderer
has `preserveDrawingBuffer:true`.

## Data / API changes

None. Deep-links are pure URL params; share is fully client-side. The `&agent=` focus
reuses the existing public `GET /api/irl/pins` nearby feed — no new endpoint.

## Acceptance checklist

- [ ] Agent detail page (`/agents/:id`) shows **View in IRL** + **View in XR** CTAs as real `<a href>` links.
- [ ] IRL link carries `?avatar=<agent body>&agent=<id>`; `/irl` loads that body and focuses the matching pin's inspect card when nearby.
- [ ] Avatar detail parity confirmed (existing `.av-ar-row` buttons unchanged / still correct).
- [ ] Composite-share logic lives in `src/irl/share-frame.js`; IRL imports it and the inline `<script>` in `pages/irl.html` is removed.
- [ ] `/xr` has a share button that composites camera + canvas; `src/xr.js` renderer uses `preserveDrawingBuffer:true`.
- [ ] In AR mode the shared PNG shows camera feed + 3D agent flattened together; non-AR shares the canvas alone.
- [ ] Mobile opens the native share sheet with the PNG; desktop downloads it; capture failure falls back to URL share → clipboard.
- [ ] Buttons have hover/active/focus states; capturing/shared/saved states are designed.
- [ ] No console errors; no duplicated share code across IRL and XR.

## Out of scope

- The inspect-card content itself (Epic B2/B3) — E3 only routes to it and focuses it.
- Server-side OG image rendering of shared frames (future).

## Verify

`npm run dev`. On `/agents/:id`, confirm both CTAs appear and open `/irl`/`/xr` in a
new tab with the agent's body loaded; with the agent pinned nearby, confirm `&agent=`
opens its inspect card. On `/irl` (AR on) and `/xr`, tap Share on a phone → native
sheet with a composited PNG; on desktop → PNG downloads. Inspect the PNG to confirm
camera + 3D are flattened. `npm test` green; review `git diff` for the deleted inline script.
