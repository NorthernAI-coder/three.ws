# 05 · Admin Console & Observability

## Mission
Give an operator a single surface to **arm, watch, and stop** the autonomous launcher with
total confidence — see what it's about to do, what it did, what it earned, and kill it
instantly. A money-moving autonomous system without a great console is a liability.

## Context
- Engine + data: `launcher-engine.js`, tables `launcher_config` / `launcher_queue` / `launcher_runs`.
- Cron: `/api/cron/launcher-tick` (`* * * * *`). Tips analogue lives under the systems admin panel
  (see `api/admin/all-systems.js`, `src/dashboard-next/pages/systems.js`) — follow that pattern.
- Read endpoints to add (admin-auth): config get/set, live runs feed, aggregate metrics.

## Surfaces to build
1. **Config panel** — edit the global row (and per-user rows): `enabled`, `dry_run`, `mode`,
   `sources` (toggle coin_intel / trending / x / hackernews / reddit / wikipedia), `categories`,
   `target_cadence_seconds`, `max_per_hour`, `per_launch_sol`, `dev_buy_sol`, `daily_sol_cap`,
   `buyback_bps`, `network`. A prominent **Arm / Disarm** and **dry-run** toggle.
2. **Live runs feed** — stream `launcher_runs` newest-first: status pill
   (pending/dry_run/funded/launched/confirmed/skipped/failed), coin name+ticker, the agent, the
   **why** (`trigger_detail.top_narrative` + confirming sources), SOL spent, mint + tx links.
3. **Headline metrics** — launches today / this hour, success rate, SOL spent vs. daily cap,
   master wallet balance, realized creator revenue + $THREE burned (prompt 04), breaker state.
4. **Narrative preview** — render the current `rankNarratives` output (what it would launch into
   next) so an operator sees the zeitgeist the engine is reading.
5. **Kill switch + breaker** — one-click pause (sets `paused`), clear-breaker, and per-agent
   disable in `launcher_queue`.

## States (design every one)
- **Disarmed** — clear "inert, nothing will fire" with the exact arm steps.
- **Dry-run** — runs flowing but labelled "no SOL moved."
- **Armed/healthy** — cadence, caps, balance, revenue all green.
- **Breaker tripped** — loud banner with the failure reason and a clear-and-resume action.
- **Empty** — no runs yet → what to do next. **Error** — endpoint/RPC down → actionable, not blank.

## Tasks
1. Build admin read/write endpoints for config, runs, and metrics (reuse admin auth + rate limits).
2. Build the console page in the dashboard-next systems panel, monochrome + token-driven, every
   state designed, real data only.
3. Wire the narrative preview to `rankNarratives` (cached) and the revenue rollup to prompt 04.
4. Add the changelog entry when this ships user-visibly.

## Acceptance
- An operator can arm in dry-run, watch real runs, flip to live with caps, and kill instantly —
  without touching SQL.
- Every number is real (DB / on-chain); no placeholders, no fake progress.
- Breaker and caps are visible and enforceable from the UI; the kill switch is immediate.

---
### Operating rules — read CLAUDE.md + STRUCTURE.md first. No mocks/fake data/stubs. Real APIs only. $THREE only (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`). Use design tokens (`public/tokens.css`); monochrome on near-black. Stage explicit paths; never `git add -A`. Don't commit `api/*.js` bundles. User-visible change → `data/changelog.json` + `npm run build:pages`. Push both remotes when asked; never pull from `threeD`. DoD = CLAUDE.md checklist.
