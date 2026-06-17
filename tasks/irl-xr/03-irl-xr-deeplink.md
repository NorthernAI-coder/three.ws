# IRL + XR Deep-link From Avatar Profile

## What to build

Add "Open in IRL" and "Open in XR" buttons to the avatar detail page (`/avatars/:id`) so users can jump directly from their avatar's profile into the immersive experience with that avatar pre-loaded.

## Context

Avatar detail page: `src/avatar-page.js` + the HTML rendered at `/avatars/:slug`.

Both `/irl` and `/xr` already accept a `?avatar=<id>` URL param which pre-loads that specific avatar:
- `/irl?avatar=<uuid>` — walks the avatar on a dark ground or camera-AR
- `/xr?avatar=<uuid>` — places the avatar in WebXR / camera passthrough

The avatar page currently has action buttons (Edit, Share, etc). We need two new CTA buttons.

## What to do

### 1. Find where action buttons are rendered

In `src/avatar-page.js`, locate the section that renders the avatar action buttons / CTA row (likely near `share`, `edit`, or `download` buttons).

### 2. Add IRL and XR buttons

```js
// Build the avatar action row — add alongside existing buttons
const irlUrl = `/irl?avatar=${avatar.id}`;
const xrUrl  = `/xr?avatar=${avatar.id}`;
```

Button markup (match the existing button style on the page):
```html
<a href="/irl?avatar=UUID" class="av-action-btn">
  <svg ...walk/person icon...></svg>
  Walk IRL
</a>
<a href="/xr?avatar=UUID" class="av-action-btn">
  <svg ...AR/cube icon...></svg>
  View in XR
</a>
```

### 3. Also add to the avatar gallery card hover state

In the avatar gallery / explore page, each avatar card on hover (or long-press on mobile) should show an "IRL" badge link. Find the card component in `src/avatar-page.js` or wherever the gallery renders, and add a small pill overlay on the card thumbnail.

## Files to touch

- `src/avatar-page.js` — add IRL/XR buttons to detail view and optionally gallery cards
- Possibly the avatar detail HTML template if it's server-rendered

## Notes

- Buttons should only appear if `avatar.visibility === 'public'` OR the viewer is the owner
- The XR button can be hidden behind a `if (navigator.xr || true)` check — show it always for now since `/xr` has camera-passthrough fallback
- Use `<a href>` not `<button onclick>` so right-click → open in new tab works

## Definition of done

- Avatar detail page shows "Walk IRL" and "View in XR" action buttons
- Clicking either navigates to the correct URL with `?avatar=<id>`
- The destination pages load the correct avatar immediately (this already works — the param handling is in place)
- No console errors

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-xr/03-irl-xr-deeplink.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
