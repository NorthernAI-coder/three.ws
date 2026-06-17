# Task 27 — Dashboard: Walking Avatar in Topbar / Sidebar

## Priority: MEDIUM

## Objective
Show the signed-in user's primary avatar walking inside a small embedded canvas in the dashboard topbar. The avatar is a live status indicator: idle when no notifications, walks/waves when there's something new.

## Scope
- Files: `public/dashboard-classic/index.html`, `public/dashboard/`, `src/dashboard/dashboard.js`, `public/dashboard-next/`
- Add a 64×80px walking avatar canvas in the topbar (right side, before user menu)
- Uses real `/api/avatars/mine?primary=true` to get the user's primary avatar
- State driven by real data:
  - Default: avatar idles
  - New notification (poll `/api/notifications/unread-count` every 30s or via existing SSE/WS): avatar plays `wave` gesture
  - User receives a tip / payment: avatar plays `cheer` gesture
  - Long inactivity (10 min): avatar sits down
- Click the avatar → opens a dropdown with:
  - Avatar's name + handle
  - "Open Walk" → `/walk?avatar=<id>`
  - "Edit Avatar" → `/avatar-edit?id=<id>`
- Render with low-cost settings: 30 FPS, antialias off, no shadows — keeps dashboard snappy

## Definition of Done
- Sign in, open dashboard → avatar walks/idles in topbar
- Trigger a real notification → avatar waves within 30s
- Click avatar → dropdown opens with working links
- No measurable impact on dashboard render performance (verify with DevTools Performance tab)
- No console errors

## Rules
Complete 100%. No stubs. No fake data. Real avatar fetch, real notification source, real interactions. Wire end-to-end.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/walk/27-dashboard-topbar-walking-avatar.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
