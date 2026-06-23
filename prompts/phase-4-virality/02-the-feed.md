# Phase 4 · 02 — The Feed (follow-graph activity + recommendations)

Read `00-README.md` in this folder and `/CLAUDE.md` first — shared context, existing
files, and non-negotiable operating rules. This task assumes them.

## Goal

Turn `pages/feed.html` from a thin shell into the platform's living activity stream:
a real-time, mobile-first feed of what the traders and agents you follow (and copy)
are doing — scoped to **your** follow graph — plus recommendations computed from
**real copy data**, not influencer noise. The feed is where shared cards (prompt 01)
get their second life and where "who should I copy next" gets answered honestly.

## Build on (do not rebuild)

- `pages/feed.html` — "Your Feed" page already exists ("Recent activity from the
  people and agents you follow"). Fill it; keep the route.
- `api/sniper/leaderboard.js`, `api/sniper/history.js`, `api/sniper/trader.js` — the
  trade + stats truth layer.
- Copy data from the copy engine (`api/cron/copy-fanout.js`,
  `api/cron/mirror-fanout.js` and their tables) — the source for "who copies whom".
- `api/_lib/db.js`, `api/_lib/http.js`, `api/_lib/validate.js`.
- PnL/trade cards from prompt 01 — feed items embed/link them.

## Deliver

1. **Feed API.** `GET /api/feed?cursor=…` returning the authenticated user's
   follow-graph activity (followed/copied traders' opens, closes, big wins, vault
   deposits/withdrawals, graduations), newest first, cursor-paginated. Each item
   carries enough to render without an N+1 fan-out. IP + auth rate-limited.
2. **Recommendations from real copy data.** A "traders you follow also copy X"
   strip computed from the actual copy graph (co-copy / collaborative signal), not a
   hardcoded list. Exclude already-followed traders; rank by a defensible signal
   (co-copy count × recent realized PnL). Show *why* it's recommended ("copied by 4
   traders you follow").
3. **Feed UI.** Render in `pages/feed.html`: trade-close items show the PnL card
   inline with a share control (prompt 01); each item links to the trader profile and
   a one-tap "Copy" / "Back this agent" CTA. Live updates via the existing stream
   mechanism if one is wired (e.g. `api/sniper/stream.js`/`trades-stream.js`),
   otherwise poll-on-focus — no fake "live" indicator without a real source.
4. **Every state designed.** Empty (not following anyone yet → surface the
   leaderboard + top recommendations as the onboarding path), loading (skeleton
   rows), error (retry), overflow (long names/large numbers truncate cleanly),
   end-of-feed.

## Acceptance

- The feed shows only the signed-in user's graph; a fresh account with no follows
  gets the designed empty/onboarding state, not a blank page.
- Recommendations are reproducibly derived from real copy rows (a test asserts the
  ranking against a fixture copy graph); no hardcoded trader arrays.
- Pagination is stable under new inserts (cursor, not offset); no dupes/skips.
- Mobile-first; hover/active/focus on every interactive element; keyboard navigable.
- `npm test` + `npm run typecheck` green. `data/changelog.json` entry (`feature`);
  `npm run build:pages` run.

## When done

Run the `/CLAUDE.md` self-review protocol, then delete **only this file**
(`02-the-feed.md`).
