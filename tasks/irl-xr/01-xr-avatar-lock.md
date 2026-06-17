# XR Avatar Lock

## What to build

Add a pin/lock toggle to `/xr` that freezes the avatar's position while still allowing the camera to orbit freely. This is the same feature already live on `/irl` — bring full parity.

## Context

`/irl` (`pages/irl.html` + `src/irl.js`) already has this feature:
- A **"Lock"** pill button in the secondary row (id `irl-lock-btn`)
- `let avatarLocked = false` state in `src/irl.js`
- `setLocked(next)` function that toggles the state, updates button appearance (amber when active, label switches to "Locked"), and in AR mode unfreezes the camera so drag-to-orbit still works around the pinned avatar
- The tick loop gates avatar movement: `if (mag > 0.01 && avatar && !avatarLocked)`

`/xr` (`pages/xr.html` + `src/xr.js`) uses a different UI — no joystick, no placement objects. Instead it has:
- A bottom panel with: avatar row, body toggle (full/half), status row, Enter AR button
- The avatar is stationary (no walking); the user can orbit via `OrbitControls`

On `/xr` the avatar already doesn't move via joystick. "Lock" here means something slightly different: **lock the camera orbit** so the avatar stays centered and OrbitControls is disabled (useful when in WebXR or camera-AR mode, where you want the avatar fixed and the camera controlled by the device). When unlocked, OrbitControls works normally.

## What to do

### 1. Add lock state to `src/xr.js`

```js
let orbitLocked = false;

function setOrbitLocked(next) {
    orbitLocked = next;
    controls.enabled = !next;
    if (lockBtn) {
        lockBtn.setAttribute('aria-pressed', String(next));
        lockBtn.classList.toggle('xr-lock--active', next);
        lockBtn.querySelector('.xr-lock-label').textContent = next ? 'Locked' : 'Lock';
    }
    setStatus(next ? 'Avatar pinned — orbit disabled' : 'Orbit unlocked', 'idle');
}
```

Add DOM ref:
```js
const lockBtn = document.getElementById('xr-lock-btn');
```

Wire the button:
```js
if (lockBtn) lockBtn.addEventListener('click', () => setOrbitLocked(!orbitLocked));
```

### 2. Add the Lock button to `pages/xr.html`

Insert it inside `#xr-panel`, in the body-toggle row area — after the `#xr-body-toggle` div and before `#xr-half-info`. Style it as a small pill matching the XR design language:

```html
<button id="xr-lock-btn" type="button" class="xr-lock-btn" aria-pressed="false" aria-label="Lock avatar orbit">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
    <span class="xr-lock-label">Lock</span>
</button>
```

Add CSS in the page `<style>`:
```css
.xr-lock-btn {
    appearance: none;
    border: 1px solid var(--border);
    background: rgba(255,255,255,0.04);
    color: var(--text-2);
    font: inherit; font-size: 12px; font-weight: 600;
    padding: 7px 14px; border-radius: 999px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    align-self: flex-start;
}
.xr-lock-btn:hover { color: var(--text); border-color: rgba(255,255,255,0.2); }
.xr-lock-btn.xr-lock--active {
    color: #fbbf24;
    border-color: rgba(251,191,36,0.45);
    background: rgba(251,191,36,0.1);
}
```

## Files to touch

- `src/xr.js`
- `pages/xr.html`

## Definition of done

- Lock button appears in the XR bottom panel
- Tapping it disables OrbitControls (amber styling, label = "Locked")
- Tapping again re-enables OrbitControls (normal styling, label = "Lock")
- Status bar reflects the state change
- No console errors

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-xr/01-xr-avatar-lock.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
