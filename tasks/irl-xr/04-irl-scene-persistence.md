# IRL Scene Persistence — Save & Restore Session State

## What to build

Persist the user's IRL session to `localStorage` so that refreshing the page or coming back later restores: the chosen avatar, the lock state, and any placed objects.

## Context

`src/irl.js` currently has:
- `_currentAvatarId` — the selected avatar UUID (or null for default)
- `avatarLocked` — boolean lock state
- `placedObjects[]` — array of `{ mesh, spawnT }` — these are Three.js Mesh objects, not serializable directly. Each was created from `OBJ_DEFS[selectedType].create()` where `selectedType` is `'orb'|'crate'|'crystal'|'ring'|'pillar'`.

The placed objects have positions (`mesh.position.x/z`) and a type. We need to save type + position and recreate them on restore.

## What to do

### 1. Define the persisted state shape

```js
// localStorage key
const STORAGE_KEY = 'irl_session_v1';

// Shape
{
  avatarId: string | null,
  locked: boolean,
  placedObjects: Array<{ type: string, x: number, z: number }>
}
```

### 2. Save on every change

Call `_saveSession()` after:
- Avatar swap completes (`loadAvatar` resolves)
- Lock state changes (`setLocked`)
- Object placed (in the `pointerup` tap handler)
- Objects cleared (in `clearBtn` handler)

```js
function _saveSession() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      avatarId: _currentAvatarId,
      locked: avatarLocked,
      placedObjects: placedObjects.map(o => ({
        type: o.type,
        x: o.mesh.position.x,
        z: o.mesh.position.z,
      })),
    }));
  } catch {}
}
```

Note: the existing `placedObjects` array stores `{ mesh, spawnT }`. Extend it to also store `type` at placement time so we can serialize it:
```js
placedObjects.push({ mesh, spawnT: 0, type: selectedType });
```

### 3. Restore on boot

After `loadAvatar()` resolves in the boot sequence, read and apply the saved session:

```js
function _restoreSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.locked) setLocked(true);
    for (const o of (s.placedObjects || [])) {
      const def = OBJ_DEFS[o.type];
      if (!def) continue;
      const mesh = def.create();
      mesh.position.x = o.x;
      mesh.position.z = o.z;
      mesh.scale.setScalar(1); // skip spawn animation on restore
      scene.add(mesh);
      placedObjects.push({ mesh, spawnT: SPAWN_DURATION, type: o.type });
    }
    if (placedObjects.length) clearBtn.hidden = false;
  } catch {}
}
```

Avatar restore: if `s.avatarId` differs from the URL param, prefer the URL param (explicit link wins); otherwise use the saved one.

```js
const targetId = avatarIdParam || s?.avatarId || null;
```

Restore this before calling `loadAvatar()` in boot.

### 4. Clear session on explicit "Clear" button press

When the user taps "Clear", also remove placed objects from localStorage:
```js
clearBtn.addEventListener('click', () => {
  // existing clear logic...
  _saveSession(); // persists empty placedObjects
});
```

## Files to touch

- `src/irl.js` only

## Notes

- `localStorage` can throw in private browsing on some iOS versions — always wrap in `try/catch`
- Don't persist the AR camera state (that's a hardware permission, not a user preference)
- Don't persist `cameraYaw`/`cameraPitch` — start fresh each visit
- The schema version suffix `_v1` means we can bump to `_v2` later without corrupting old sessions

## Definition of done

- Refresh IRL page → same avatar is loaded, same placed objects appear, lock state restored
- Clearing objects → refresh shows empty scene
- URL param `?avatar=` always takes precedence over saved session
- No console errors in private browsing mode

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl-xr/04-irl-scene-persistence.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
