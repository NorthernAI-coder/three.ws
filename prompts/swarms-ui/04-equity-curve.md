# Swarms UI — equity curve + win-rate ring

You are working in `/workspaces/three.ws`. The `/swarms` dashboard shows the treasury's
realized P&L and win rate as bare numbers. A swarm has a *trajectory* — it's making or
losing money over time — and nothing on the page shows the shape of that story. Add the
heartbeat: a real equity-curve sparkline and a win-rate ring above the tiles. This is
what makes someone screenshot the page.

## What exists today (read these first)

- `src/swarms.js` — `paintDashboard()` (~line 190) renders the `.sw-tiles` row. `getSwarmState` (in `api/_lib/swarms.js`) provides `s.positions` (each closed position has `pnl_sol`, plus status/exit info) and `s.track_record` (`realized_pnl_sol`, `win_rate`, `closed_trades`, `open_positions`).
- The SSE `tick` event already streams `realized_pnl_sol`, `closed_trades`, `open_positions` live.
- `src/swarms.css` — tiles use `.sw-tile` / `.sw-tile-v`; `.pos`/`.neg` for color.

## Build this

1. **Equity-curve sparkline.** Build a cumulative realized-P&L series from the **real** closed positions (order by close time, running sum of `pnl_sol`). Render as a lightweight inline SVG sparkline — a hero element above or beside the tiles, larger than a tile, with a subtle area fill (green when net-positive, red when net-negative, token-colored). Last point gets a dot. No charting library unless one is already in `package.json` and clearly justified — a sparkline is ~30 lines of SVG path math; check `package.json` first per the open-source-first rule, but don't pull a 100KB dep for one curve.
2. **Live extension.** When a `tick` raises `closed_trades` / `realized_pnl_sol`, append the new point and animate the line drawing to it (stroke-dashoffset or a width reveal). The curve should visibly *grow* as trades close.
3. **Win-rate ring.** Replace (or augment) the win-rate number with a small ring/arc gauge filling to the real win-rate %, with the number centered. Color by band if you like, but keep it token-driven.
4. **Designed empty state.** A brand-new swarm with 0 closed trades has no curve — show a flat baseline with a helpful one-liner ("No closed trades yet — the curve starts on the first exit"), not a broken/blank SVG.

## Rails (non-negotiable)

- Tokens only from `/tokens.css`. No hardcoded colors.
- **Gate the draw animation** behind `@media (prefers-reduced-motion: reduce)` → render the final curve/ring statically, no animated draw.
- No fake data: the curve is the **real cumulative realized P&L** from real closed positions. Do not smooth in invented points or pad the series. If you need a per-position timestamp the state doesn't expose, add it to `getSwarmState`/the API from real data — don't fabricate ordering.
- Responsive: the sparkline must scale cleanly at 320px / 768px / 1440px and not overflow the tile row.
- Concurrent agents edit `main`: stage explicit paths only, re-check `git status`, never `git add -A`.

## Definition of done

- `npm run dev`, open a swarm with closed trades — confirm the curve matches the realized P&L and the ring matches the win rate. Open a fresh swarm — confirm the empty state, not a blank box.
- Watch a real `tick` close a trade and confirm the curve extends live.
- No console errors/warnings. `npm test` passes.
- `prefers-reduced-motion` verified — static curve/ring, correct values.
- `data/changelog.json` entry (tag: `improvement`): swarm dashboards now show a live equity curve and win-rate gauge.
- Review your `git diff`. Don't commit unless asked.
