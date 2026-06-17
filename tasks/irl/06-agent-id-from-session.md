# Task: IRL — Link the placed pin to the session's active agent_id

## What to build

When a user pins their avatar in IRL mode, `savePin()` currently sends `agent_id: undefined` because the session's active agent ID isn't plumbed into `src/irl.js`. Wire the agent ID so that the stored pin carries a real `agent_id`, enabling the "View agent" profile link (task 02) to work for self-placed pins.

## How agents are selected in IRL

The IRL page (`/irl`) inherits the avatar selected in the 3D walk scene. The user picks an avatar via the "Avatar" pill button (`#irl-avatar-btn`), which opens the avatar picker. The current avatar is tracked by `_currentAvatarId` in `src/irl.js` (a string like `"3d-agent-id-or-glb-key"`).

Read `src/irl.js` to find:
1. Where `_currentAvatarId` is set and what format it holds
2. Whether an `agent_id` (UUID) is stored anywhere alongside the GLB URL

## What to change

### If `_currentAvatarId` IS a UUID agent ID

Simply add it to the `savePin` POST body:

```js
// in savePin():
agentId: _currentAvatarId ?? null,
```

### If `_currentAvatarId` is a filename/key (not a UUID)

The avatar URL may encode the agent ID. Check if the avatar URL pattern is `/cdn/<agent-id>/avatar.glb` or similar. If so, extract the UUID:

```js
function agentIdFromUrl(url) {
    if (!url) return null;
    const m = url.match(/\/agents?\/([0-9a-f-]{36})\//i)
             ?? url.match(/\/([0-9a-f-]{36})(?:\/|\.)/i);
    return m?.[1] ?? null;
}
```

Pass `agentIdFromUrl(resolveAvatarUrl(_currentAvatarId))` as `agentId` in `savePin`.

### If agent ID comes from a different source

The page URL may carry `?agent=<id>` (set by the avatar picker redirect). Check `new URLSearchParams(location.search).get('agent')` as a fallback.

## Research first

Before writing any code:

```bash
grep -n "_currentAvatarId\|resolveAvatarUrl\|agent_id\|agentId" src/irl.js | head -30
grep -n "avatar-picker\|irl-avatar-btn\|loadAvatar" src/irl.js | head -20
```

Understand what `_currentAvatarId` actually is, then pick the right extraction strategy above.

## Files to touch

- `src/irl.js` — `savePin()` and possibly a new helper `agentIdFromUrl()`

## Checklist

- [ ] `savePin` POST body includes a valid UUID `agentId` when an agent is selected
- [ ] Falls back to `null` gracefully when no agent is selected (anonymous avatar)
- [ ] Verified by inspecting the `irl_pins` table (`agent_id` column populated on new pins)
- [ ] No console errors

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl/06-agent-id-from-session.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
