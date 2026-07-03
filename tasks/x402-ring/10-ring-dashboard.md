# Task 10 — Ring Dashboard: See the Economy Breathe

## Mission

The ring has a JSON scoreboard (`/api/x402-ring`) and no eyes. Build the live
operator dashboard that makes the closed-loop economy visible at a glance —
per-minute settlement pulse, who bought what, fees burned vs budget, wallet
balances vs floors, leak status, config health — so "it stopped working" can
never again go unnoticed for days. This is an owner/ops surface: polished to
the platform bar, but access-controlled and never marketing organic volume.

## Context you must know

- Data sources (all real, no mocks):
  - `GET /api/x402-ring?period=24h|7d|30d|all` (`api/x402-ring.js`) — gross
    volume, tx count, SOL burned (+USD), sweep totals, live
    treasury/payer/sponsor balances, `sponsor.below_floor`, and (post task 02/05)
    `config_warnings` + fee-efficiency metrics.
  - `x402_volume_metrics` — per-endpoint counts/last-paid (via a small admin
    read endpoint you may add).
  - `x402_autonomous_log` — the live activity feed (buyer `agent_id` per task
    09, slug, price, status incl. skips like `cap_would_exceed`).
  - `payment_reconciliation` (sources `x402_ring_*`) — leak scanner + reconcile
    verdicts (tasks 06/07).
- Precedents to match, not reinvent: admin analytics dashboard
  `dashboard/x402-admin.html` (routed in `vercel.json:1723-1728`), admin
  seeder control room (`pages/admin/seeder.html` + `src/admin-seeder.js`,
  backend `api/admin/seeder.js`) — follow its auth pattern and its
  noindex/admin conventions.
- Frontend stack: vanilla JS modules + Vite; design tokens/CSS variables from
  existing pages (read a current page's CSS before writing yours).
- Internal-volume labeling rule (docs/x402-ring-economy.md:11-17): this
  dashboard must label ring volume as internal dogfooding — it is the
  anti-"fake organic revenue" surface, not a growth chart.

## Tasks

1. **Backend read model — `api/admin/ring-dashboard.js`**: one admin-authed
   endpoint aggregating: ring report, per-endpoint metrics, last 100 activity
   rows (with agent attribution), open reconciliation verdicts, config
   validation findings, and a `minutes_since_last_settle` scalar. Admin auth
   identical to `api/admin/seeder.js`. Efficient: single handler, parallel
   queries, no N+1.
2. **Page — `pages/admin/ring.html` + `src/admin-ring.js`** (route
   `/admin/ring`, noindex, follow the seeder page's wiring in `vercel.json` /
   `vite.config.js`):
   - **Pulse strip**: settlements per minute over the last 60 min (task 04's
     tick makes this the heartbeat) — a live bar/spark strip where a gap is
     instantly visible; `minutes_since_last_settle` as a big status number with
     green/amber/red thresholds (≤1 / ≤5 / >5 min).
   - **Loop diagram**: payer → endpoint → treasury → (sweep) → payer with live
     balances on each node and floor indicators (sponsor optional in self-pay).
   - **Activity feed**: streaming table of paid calls — time, agent persona,
     endpoint slug, kind (tip/service/intel/commerce/settle), price, settle
     sig (Solscan link), skips/failures in amber/red with their structured
     reason.
   - **Fees panel**: lamports/settlement vs the 5,000 1-sig floor,
     SOL-per-$100 volume, daily burn vs `X402_RING_DAILY_FEE_BUDGET_LAMPORTS`.
   - **Integrity panel**: leak-scan status (last run, findings count),
     reconciliation verdict counts by class, config warnings — all green =
     one calm row; any finding = expanded red detail.
   - **Coverage panel**: per-endpoint last-paid age from `x402_volume_metrics`
     (task 08's hourly guarantee made visible; stale >2h = amber).
   - Poll every 15s (`setInterval` + fetch, abort on hidden tab); relative
     timestamps; skeleton loading states; designed empty state ("ring idle —
     run the activation runbook") and error state (API unreachable, with the
     curl to debug). Keyboard: `r` refresh, `p` pause polling. Every
     interactive element has hover/focus/active states. 320/768/1440 widths.
   - Persistent header badge: "INTERNAL DOGFOODING VOLUME — not organic
     revenue" per the labeling rule.
3. **Wire navigation**: link from the existing admin surfaces (wherever
   `/admin/seeder` is linked) so it's findable; add to `data/pages.json`
   (admin/noindex flags per existing admin entries).
4. **Tests**: read-model shape test for `api/admin/ring-dashboard.js` (fixture
   DB rows → aggregated payload), threshold logic (pulse status color), and a
   route smoke test if the repo has one for admin pages.
5. **Docs + changelog.** `docs/x402-ring-economy.md` gains a "Watching it"
   section with a screenshot-worthy description + the `/admin/ring` path;
   `STRUCTURE.md` row for the new surface; changelog entry (tags: `feature`).

## Files you own

`api/admin/ring-dashboard.js` (new), `pages/admin/ring.html` (new),
`src/admin-ring.js` (new), `vercel.json`/`vite.config.js` (routing for the one
page), `data/pages.json`, tests, `docs/x402-ring-economy.md`, `STRUCTURE.md`,
`data/changelog.json`.

## Constraints

- Admin-authed and noindexed; zero secrets in the client bundle; balances and
  pubkeys are fine, secret names are not.
- Real data only — every panel renders from the live read model; no sample
  arrays shipped (CLAUDE.md hard rule 6).
- Don't modify `/api/x402-ring` beyond what tasks 02/05 already added — the
  admin read model composes, it doesn't fork the public report.
- Performance: one aggregate fetch per poll, not seven; payload < 100KB.

## Acceptance criteria

- [ ] `/admin/ring` loads with real data from the deployed (or locally-run)
      stack — screenshot or DOM-dump evidence of every panel populated.
- [ ] Pulse strip visibly reflects task 04's per-minute cadence; killing the
      tick turns the status amber→red within thresholds.
- [ ] All designed states verified: loading, empty (ring off), error (API
      down), populated — per the Definition of Done in CLAUDE.md.
- [ ] No console errors; network tab shows the single aggregate call.
- [ ] `npm test` green; pages.json + STRUCTURE.md + changelog landed.
