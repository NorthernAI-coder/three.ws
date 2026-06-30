# Swarms UI — count-up treasury tiles

You are working in `/workspaces/three.ws`. The `/swarms` dashboard has a row of
treasury tiles — Treasury balance, Net contributed, Realized P&L, Open positions,
Win rate. They update live over SSE, but they **hard-swap** the text: a number jumps
from one value to another with no signal that money just moved. The single cheapest,
highest-impact piece of game-feel is making those numbers *count* to their new value
and flash on change. This is legitimate juice (a transition between two real values),
not fake data.

## What exists today (read these first)

- `src/swarms.js` — `paintDashboard()` (~line 190) renders the tiles. IDs: `#sw-bal` (balance), `#sw-pnl` (realized P&L), `#sw-open` (open positions). The win-rate tile has **no id** — add one (e.g. `#sw-wr`) as part of this work.
- `subscribeStream(id)` (~line 528): the `tick` SSE event updates `#sw-bal`, `#sw-open`, `#sw-pnl` via `textContent` (instant). The `payout` event inserts a row and `flash()`es it.
- `tick` payload fields: `status`, `balance_sol`, `open_positions`, `closed_trades`, `realized_pnl_sol`. (Win rate is derived from closed trades on full render; recompute on tick from the same numbers, or expose it on the tick payload in `api/swarms/[id].js` — your call, keep it real.)
- `src/swarms.css` — `.sw-tile-v` is the big number; `.pos` / `.neg` color it green/red.

## Build this

1. **A reusable count-up.** Add a small helper that animates a tile's numeric value from its current value to the new one over ~400–600ms with easing, preserving the existing formatting (`SOL()`, the `+`/`−` sign on P&L, `%` on win rate, integer on open positions). Use `requestAnimationFrame`, not a library — it's a dozen lines. Cancel any in-flight count-up on the same element before starting a new one.
2. **Flash on change, direction-aware.** When a value increases, a brief green tint on the tile; when it decreases, a brief red/neutral tint — then settle. Reuse/extend the existing `flash()` idea but make it directional and scoped to the tile. P&L going up should *feel* good; balance dropping should register.
3. **Wire every live update through it.** `tick` → count-up balance, open positions, P&L, win rate. A confirmed `payout` should also pulse the P&L / balance tiles (money landed). Keep `#sw-pnl`'s `.pos`/`.neg` class correct after the animation.
4. **No layout shift.** Tiles already use `font-variant-numeric: tabular-nums` — keep widths stable through the count so nothing jitters.

## Rails (non-negotiable)

- Tokens only from `/tokens.css`. No hardcoded colors.
- **Gate the animation** behind `@media (prefers-reduced-motion: reduce)` → those users get an instant set to the final value (current behavior), no count, no flash.
- No fake data: count *between two real values* only. Never animate from 0 on every tick (that fakes activity) — animate from the previously displayed real value to the new real value.
- Fast and subtle — if the counting is slow enough to read digit-by-digit, shorten it.
- Concurrent agents edit `main`: stage explicit paths only, re-check `git status`, never `git add -A`.

## Definition of done

- `npm run dev`, open a live swarm, watch a real `tick`/`payout` move the tiles — confirm count-up + directional flash, no jitter, P&L sign/color correct.
- No console errors/warnings. `npm test` passes.
- `prefers-reduced-motion` verified — instant, correct final values.
- `data/changelog.json` entry (tag: `improvement`): treasury figures now animate and flash on live updates.
- Review your `git diff`. Don't commit unless asked.
