# Swarms UI — the directory becomes a ladder

You are working in `/workspaces/three.ws`. The `/swarms` directory shows swarm cards in
a grid where every card is a visual equal. But swarms *compete* — some are crushing it,
some are bleeding, some just fired a trade thirty seconds ago. Turn the flat grid into a
ranked, sortable ladder where the standings are obvious at a glance and the live ones
feel alive.

## What exists today (read these first)

- `src/swarms.js` — `renderDirectory()` (~line 69) builds the hero + toolbar (network toggle, "My swarms"); `loadList()` fetches `/api/swarms?network=…`; `cardHTML(s)` (~line 141) renders each `.sw-card`. Card fields per swarm: `id`, `name`, `description`, `status` (`open|active|paused|killed|closed`), `members`, `contributed_sol`, `realized_pnl_sol`, `closed_trades`, win rate (`wr`), `policy.min_consensus`.
- `src/swarms.css` — `.sw-grid` (responsive `auto-fill minmax(310px,1fr)`), `.sw-card` (hover lift + shadow), `.sw-stats` (3-col), `.sw-pill--*` (status pills), `.pos`/`.neg`.
- The list API is `api/swarms/index.js`. It does **not** currently return a "last fired" timestamp — to mark swarms as "hot," add a real `last_fire_at` (max `swarm_votes.created_at where decision='fire'`) to the list query.

## Build this

1. **Rank the grid.** Add a sort control (segmented, matching `.sw-seg`): **Top P&L** (default), **Hottest** (most recent fire), **Most pooled**, **Newest**. Sorting is client-side over the fetched list unless the set is large enough to warrant a server `sort` param — use judgment, keep it real.
2. **Standings markers.** Under "Top P&L", the #1 swarm gets a restrained medal/glow treatment, #2–#3 a position badge. Token-colored, subtle — a tasteful highlight, not a leaderboard carnival. Markers update when the sort changes.
3. **"Hot" marker.** A swarm that fired within the last hour (from real `last_fire_at`) gets a small live/flame indicator and a faint pulse on the card — reuse the live-dot vocabulary from the dashboard (`.sw-live`). Only real recency drives it.
4. **Card hierarchy.** Make P&L the dominant stat on each card (it's the score), with members/pooled/win-rate secondary. Keep the existing 6 stats but let the eye land on the number that ranks the swarm.
5. **States.** Preserve and polish the existing empty ("no swarms yet"), loading (skeletons), and error/retry states — don't regress them. Empty under a sort should still guide the user to create one.

## Rails (non-negotiable)

- Tokens only from `/tokens.css`. No hardcoded colors.
- **Gate any pulse/animation** behind `@media (prefers-reduced-motion: reduce)` → static markers, no pulse.
- No fake data: ranks and "hot" come from **real** fields. `last_fire_at` must be real (add it to the query); never fake recency. If a value is null, render the neutral state.
- Responsive: ladder must hold at 320 / 768 / 1440. Don't break the `auto-fill` grid.
- Concurrent agents edit `main`: stage explicit paths only (`src/swarms.js`, `src/swarms.css`, `api/swarms/index.js`), re-check `git status`, never `git add -A`.

## Definition of done

- `npm run dev`, open `/swarms` with multiple swarms — confirm each sort reorders correctly, #1 gets its marker, and a recently-fired swarm shows "hot" (cross-check the timestamp).
- Confirm empty / loading / error states still work (kill the network to test error+retry).
- No console errors/warnings. `npm test` passes. Confirm the added `last_fire_at` field doesn't break the existing list consumers.
- `prefers-reduced-motion` verified.
- `data/changelog.json` entry (tag: `improvement`): the swarms directory is now a ranked, sortable ladder with live "hot" markers.
- Review your `git diff`. Don't commit unless asked.
