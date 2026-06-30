# Site UI — cluster: markets & standings

You are working in `/workspaces/three.ws`. Apply the shared game-feel library to the
**compete-shaped** surfaces — the ones that rank, score, and update live. These get the
biggest payoff from the treatment, because they're already games that aren't scored
visually yet.

**Prerequisite:** `src/ui-juice.js` from `prompts/site-ui/01-foundation-juice-library.md`.
If it doesn't exist yet, run that first (or build the primitives inline and extract later).

## Surfaces in this cluster

`src/leaderboard.{js,css}`, `src/trader.{js,css}`, `src/signals.{js,css}`,
`src/radar.{js,css}`, `src/pulse.{js,css}`, `src/watchlist.{js,css}`,
`src/clash.{js,css}`, `src/vaults.{js,css}`, `src/labor-market.{js,css}`.

Work one surface at a time. For each: read the `.js`/`.css`, find its real data source and
any live feed, then apply the relevant primitives. Don't force every primitive onto every
page — use what fits the data.

## The treatment (apply what fits each surface)

1. **Ranked ladders.** Where a list ranks entities, add clear rank ordinals, a restrained #1 marker, and `flipReorder` so re-sorts animate instead of snapping. Make the ranking stat the dominant visual.
2. **Count-up + flash** (`countUp`, `flashValue`) on any live or refreshed numeric — P&L, scores, volumes, prices. Direction-aware. Never animate from 0 on every refresh (fakes activity) — from the previously displayed real value only.
3. **Sparklines** (`sparkline`) on rows/cards with a real time series (price, score history, equity). Real data only; designed empty state when the series is too short.
4. **Live-dot** (`liveDot`) on surfaces with a real feed, mirroring the `/swarms` connecting/live vocabulary. `enterRow` for live-appended feed items.
5. **Ring gauges** (`ring`) for percentages that read as a "level" (win rate, conviction, fill).
6. **State coverage.** Ensure loading (skeleton), empty (guides the user), error (actionable + retry), and overflow states all exist and are polished. Fix any missing per CLAUDE.md.
7. **Consistency.** Replace hardcoded colors/durations with `public/tokens.css` tokens. Ensure hover/active/focus on every interactive element.

## Rails (non-negotiable)

- Tokens only from `public/tokens.css`. No raw hex/px/ms where a token exists.
- Reduced motion is handled by the token override + the library's final-state paths — verify each page in DevTools emulation.
- No fake data: every animated value, rank, and series traces to a real API/SSE field. If a feed doesn't exist on a surface, don't invent one — apply only the static-data improvements.
- Match `/swarms` — same vocabulary, same restraint. This cluster should feel like one product.
- Concurrent agents edit `main`: stage explicit paths only (the specific surface's files), re-check `git status`, never `git add -A`.

## Definition of done (per surface)

- `npm run dev`, open the route, exercise it against real data — confirm ranks, count-ups, sparklines, and live updates behave and trace to real values. No console errors/warnings.
- All four+ states verified (loading/empty/error/overflow). Hover/active/focus present.
- Reduced-motion verified.
- `npm test` passes.
- One `data/changelog.json` entry per surface (or one batched entry for the cluster), tag `improvement`, holder-readable.
- Review your `git diff`. Don't commit unless asked.

Track progress with TodoWrite (one item per surface) and report which surfaces are done vs deferred.
