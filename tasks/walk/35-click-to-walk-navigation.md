# Task 35 — Click-to-Walk: Navigate by Pointing Where Avatar Should Go

## Priority: MEDIUM

## Objective
Add a navigation mode where the user clicks anywhere on a page and the avatar physically walks to that spot before any further action. Clicking a link makes the avatar walk to the link first, then triggers the navigation.

## Scope
- Module: `src/walk-companion-click-to-walk.js`
- Mode toggle: held key `Alt` (desktop) or long-press (mobile) puts the avatar into "directable" mode
- In directable mode:
  - Cursor changes to a footstep icon
  - Click anywhere → avatar walks to that screen position (translated to canvas coords)
  - During walk: a faint dotted path renders showing the route (using canvas overlay or SVG)
- Smart link interaction:
  - Click on a link while directable → avatar walks there, plays `point` gesture, opens link 200ms later
  - Click on a button → avatar walks there, plays `tap` gesture, fires real click event 200ms later
- Obstacle avoidance:
  - Avatar avoids walking over images and major UI cards — use a simple grid pathfinder around blocking elements (treat elements with `data-walk-block` as walls)
- Visual feedback:
  - Brief ripple on click point
  - Footprint trail fades after 2 seconds

## Definition of Done
- Hold Alt, click anywhere on a page → avatar walks to that point
- Click on a link in directable mode → avatar walks to it, then link opens
- Obstacle avoidance works (avatar routes around `data-walk-block` elements)
- Footprint trail renders and fades
- No console errors

## Rules
Complete 100%. No stubs. No fake data. Real pathfinding, real click delegation. Wire end-to-end.

<!-- AUTO:self-delete-on-complete -->

---

## ✅ On completion — delete this file

This file is a unit of work, not a permanent doc. The moment every item above is **built, wired, verified, and committed** to the "Definition of done" in the repo-root `CLAUDE.md`, remove it in the same change:

```bash
git rm "tasks/walk/35-click-to-walk-navigation.md"
```

Stage the deletion alongside your implementation and include it in the completion commit. This directory is the backlog: a file that still exists is unfinished work; a file that is gone has shipped. Do not delete early, and never leave a completed prompt behind.
