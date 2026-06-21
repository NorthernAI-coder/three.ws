# 26 · Dashboard (dashboard-next)

## Mission
The signed-in home must surface what matters and turn data into action: agents, avatars, earnings,
usage, notifications, account — all real, all actionable, beautifully laid out.

## Context
- `src/dashboard-next/*`: `pages/*` (home, account, walk, developers, etc.), `components/*` (topbar,
  drawer), `nav.js`, `api.js`. Topbar has command palette, notifications, walking avatar, user menu.
- Auth via `/api/auth/me`; notifications via `/api/notifications`.

## Tasks
1. **Real, actionable data:** every widget loads real data (agents, avatars, earnings/affiliate,
   usage, recent activity) with deep links into the relevant editor/surface. No decorative dead panels.
2. **Account:** profile, wallet, email, plan, API keys, security settings — all functional with
   designed states; sign-in/out flows correct.
3. **Notifications:** real unread counts + dropdown + activity drawer; mark-read; deep links.
4. **Empty states:** a new user with nothing sees inviting, actionable empty states (create your first
   agent/avatar), not blank panels — and those CTAs route correctly (e.g. create button → `/create`).
5. **Topbar avatar:** the user's avatar lives in the topbar (no T-pose), links to edit; reacts to events.
6. **Performance + consistency:** fast loads, skeletons, consistent `--nxt-*` tokens, responsive.

## Acceptance
- Every widget shows real data and links to a real action; empty states inviting + correctly routed.
- Account/notifications/avatar all functional; designed loading/empty/error states throughout.
- Clean console; responsive; changelog for visible changes.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
