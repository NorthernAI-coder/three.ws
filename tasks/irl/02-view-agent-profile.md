# Task: IRL — Wire "View agent" to real agent profile

## What to build

When a user taps a nearby pin's floating label and the interaction sheet opens, the "View agent" button currently navigates to `/walk?agent=<name>` (a name-search fallback). It should navigate to the agent's actual profile page at `/agents/<id>` when `agent_id` is available.

## Current state

`src/irl.js` ~line 893:

```js
document.getElementById('irl-sheet-view')?.addEventListener('click', () => {
    const sheet = document.getElementById('irl-sheet');
    const name  = document.getElementById('irl-sheet-name')?.textContent || '';
    sheet?.classList.remove('is-open');
    window.open(`/walk?agent=${encodeURIComponent(name)}`, '_blank', 'noopener');
});
```

The `openPinSheet(pin)` function at ~line 872 already has the full pin object including `pin.agent_id`. It just doesn't forward it to the button.

## Changes required

### 1. Store agent_id on the sheet element

In `openPinSheet(pin)`, store `agent_id` on the sheet element as a data attribute:

```js
sheet.dataset.agentId  = pin.agent_id  ?? '';
sheet.dataset.agentName = pin.avatar_name ?? '';
```

### 2. Update the click handler

```js
document.getElementById('irl-sheet-view')?.addEventListener('click', () => {
    const sheet   = document.getElementById('irl-sheet');
    const agentId = sheet?.dataset.agentId;
    const name    = sheet?.dataset.agentName || '';
    sheet?.classList.remove('is-open');
    if (agentId) {
        window.open(`/agents/${agentId}`, '_blank', 'noopener');
    } else {
        // Fallback: search by name in the 3D walk scene
        window.open(`/walk?agent=${encodeURIComponent(name)}`, '_blank', 'noopener');
    }
});
```

### 3. Confirm `/agents/<id>` route exists

Check `vercel.json` for a route that maps `/agents/:id` → an HTML page. It should already exist as:

```json
{ "src": "/agents/([^/]+)", "dest": "/agents.html" }
```

(or similar). If the agent profile page reads the ID from `location.pathname`, the link will work. Verify the agent profile page URL format by checking `pages/agents.html` or looking at how existing agent links are constructed in the codebase (grep for `/agents/` in `src/`).

If the agents page reads from query string (`/agents?id=`), adjust the URL accordingly.

## Files to touch

- `src/irl.js` — `openPinSheet()` and the `irl-sheet-view` click handler (~lines 872–897)

## Checklist

- [ ] `openPinSheet` stores `agent_id` and `avatar_name` on `sheet.dataset`
- [ ] Click handler uses `agent_id` if present, falls back to name search
- [ ] Target URL format verified against how the rest of the site links to agent profiles
- [ ] No console errors

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/irl/02-view-agent-profile.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
