# C2 — $THREE holder "Your position" widget (wow-sprint Task 14)

**Track:** C — build next · **Priority:** P1 · **Effort:** ~1 day · **Depends on:** **C1** (the shared hook)

## Context

`tasks/wow-sprint/14-holder-dashboard.md` calls for a $THREE holder dashboard — "the reason to log
in." Most of it is **already built**: `src/dashboard-next/pages/three-token.js` renders hero
metrics, the revenue-share calculator, deploy-burn, activity feed, and token info from the real
endpoints (~60% done). **The missing piece is the "Your position" widget**: the connected wallet's
real $THREE holding — amount, USD value, % of supply — plus a proper connect-wallet empty state.

Read `tasks/wow-sprint/14-holder-dashboard.md` in full before starting.

## Prerequisite

This task consumes the `createThreeTokenData` store from **C1** (`src/pump/three-token-data.js`),
specifically its `position` field. **Do not start until C1 is merged.** Do not re-fetch
`/api/wallet/balances` directly — use the store's `position` + `refreshPosition()`.

## What to build

1. **Refactor `three-token.js` to consume the C1 store.** Replace the inline `Promise.all` boot
   (~lines 112–117) with `createThreeTokenData(...)` + `subscribe(...)`. Existing sections
   (hero metrics, calculator, burns, activity) should now read from the store's fields instead of
   their own fetches. Keep the existing renderers (`renderHeroMetrics`, `fmtUsd`, `fmtCompact`,
   `fmtPct`, `pctColor`, `toast`, `safeGet`) — just change their data source.
2. **Add the "Your position" widget** as a new section near the top of the page:
   - **Connected + holding:** show $THREE balance, USD value, % of supply, and (if cheaply
     available from the store) price. Use the existing number formatters.
   - **Connected + zero balance (`position.status === 'zero'`):** show a "you don't hold $THREE yet"
     state with a clear CTA to acquire it (link to the token/swap page — coin-agnostic copy, only
     $THREE named).
   - **Not signed in (`unauthenticated`):** show a connect-wallet empty state with a sign-in CTA
     (reuse the page's existing `ApiError 401 → /login` convention).
   - **Loading:** skeleton (use the page's `skeletonBlock`/`skeletonGrid`).
   - **Error:** designed, actionable error state (not a blank void).
3. **Refresh on relevant events.** After a sign-in or a trade completes, call
   `store.refreshPosition()` so the widget updates without a full reload.
4. **States, motion, a11y:** every interactive element gets hover/active/focus states; transitions
   on opacity/transform; semantic markup + ARIA labels; works at 320 / 768 / 1440px.

## Acceptance criteria

- [ ] `three-token.js` reads all data from the C1 store; no duplicate $THREE fetching remains.
- [ ] "Your position" shows real balance / USD / % supply for a connected, holding wallet.
- [ ] All four non-happy states are designed: zero-balance, unauthenticated, loading, error.
- [ ] Position updates after sign-in / trade via `refreshPosition()` (no full reload needed).
- [ ] No console errors/warnings from changed code; Network tab shows real calls succeeding.
- [ ] Responsive + accessible + hover/active/focus on all interactive elements.

## Verification

1. `npm run dev`; open the holder dashboard route.
2. With **no** wallet/session: confirm the connect-wallet empty state + working sign-in CTA.
3. With a connected wallet holding $THREE: confirm real position numbers; cross-check the balance
   against `/api/wallet/balances` in the Network tab.
4. With a connected wallet holding **no** $THREE: confirm the zero-state + acquire CTA.
5. Throttle/offline to confirm the error state renders (not a blank).
6. `npx vitest run` — existing dashboard tests still pass.

## Rules

Obey [CLAUDE.md](../../CLAUDE.md). Only $THREE. No fake balances or placeholder numbers — if the
store has no data yet, show the loading/empty state, never invented values.

## Completion protocol

1. Re-read your diff (`git diff`) and confirm every line is justified.
2. Delete this file: `tasks/week-2026-06-08/C2-holder-position-widget.md`.
3. Commit your code **and** this file's deletion together, e.g.:
   `git add -A && git commit -m "feat(holder): your-position widget on $THREE dashboard via shared store; close C2"`
4. Do **not** push — the human controls pushes.
