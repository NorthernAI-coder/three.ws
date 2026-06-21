# 29 — Uptime monitoring & public status page

> Part of the three.ws "Production → $1B" program. Run in a fresh chat. Read
> `/CLAUDE.md` first (its rules override everything) and `prompts/billion-dollar-program/00-README.md`
> for shared context.

## Why this matters for $1B

Trust is the currency of a money-moving platform. When something breaks, users and
$THREE holders need a single honest place that tells them what's up, what's degraded,
and that the team already knows — before they tweet. A polished public status page
with real uptime history converts incidents from credibility losses into proof of
operational maturity. And external monitoring is the smoke detector that pages the
team even when the platform is too down to alert itself.

## Mission

Aggregate every health probe into one `/api/status` feed backing a public `/status`
page with real 90-day uptime history, wire external (off-box) uptime monitoring, and
ensure degradation pages the team via the existing ops-alert channel.

## Map (trust but verify — files move)

- **Public status page** — [pages/status.html](../../pages/status.html) — live
  dashboard, 90-day uptime bars, auto-polls `/api/status` every 5 min. Registered in
  [data/pages.json](../../data/pages.json) (`/status`, section "learn").
- **Status feed** — `api/status.js` (powers the page; verify path under [api/](../../api)).
- **Aggregate health** — [api/healthz.js](../../api/healthz.js) — probes Resend,
  x402 facilitator, SIWX payments table, bot heartbeat, alert watches.
- **Forge health** — [api/_lib/forge-health.js](../../api/_lib/forge-health.js)
  (served via `GET /api/forge?health`) — probes generation backends + Redis + world.
- **Admin probes** — [api/admin/redis-health.js](../../api/admin/redis-health.js),
  [api/admin/pump-cron-health.js](../../api/admin/pump-cron-health.js).
- **Health crons** — [api/cron/world-health.js](../../api/cron/world-health.js),
  `api/cron/uptime-check.js`, [api/llm/health.js](../../api/llm/health.js).
- **Ops alerts** — [api/_lib/alerts.js](../../api/_lib/alerts.js) — `sendOpsAlert()`,
  deduped + 20/hr ceiling (Telegram).
- **Nav** — [public/nav-data.js](../../public/nav-data.js) (`NAV_GROUPS`, single
  source of truth for menu items), [public/nav.js](../../public/nav.js).
- **Tests** — [tests/api/healthz.test.js](../../tests/api/healthz.test.js),
  [tests/api/forge-health.test.js](../../tests/api/forge-health.test.js).

## Do this

1. **Exercise what exists.** Open `/status` in a real browser (`npm run dev`) and
   hit `/api/status`. Confirm the page polls every 5 min, renders per-service dots,
   90-day bars, and the "warming-up" first-deploy state. Note any probe missing.
2. **Make the feed complete.** Ensure `/api/status` aggregates ALL subsystems:
   `healthz` (Resend/x402/DB/heartbeat/watches), `forge?health` (gen backends + Redis
   + world), redis-health, pump-cron-health, world-health, llm/health. Add any
   probe that the public page should reflect; admin-gated probes feed status via the
   server (the public response must never leak admin detail or secrets).
3. **Real history, not synthetic.** Verify the 90-day uptime data is recorded from
   actual probe results (a cron writing samples to Redis/DB), not faked. If history
   storage is thin, persist each `uptime-check` result with a retention window so the
   bars reflect truth. No `setTimeout` fake data.
4. **Every state designed.** Confirm `/status` has designed loading, warming-up
   (no history yet), all-operational, degraded, and down states — accessible,
   responsive at 320/768/1440, with hover/focus on interactive elements.
5. **External monitoring.** Wire an off-box uptime monitor (e.g. an
   UptimeRobot/BetterStack/Checkly HTTP check, or a free cron-job.org ping) against
   `/api/healthz` and `/api/status` that pages the team independently of Vercel.
   Document the config and the alert destination. Do not invent a fake integration —
   set up a real one or document the exact steps + env to enable it.
6. **Degradation pages the team.** Confirm the health crons call `sendOpsAlert` on
   degradation only (not every probe), respecting dedup + the 20/hr ceiling — no
   alert storms. Add alerting for any subsystem currently probed-but-silent.
7. **Discoverability.** Add `/status` to `public/nav-data.js` (footer/utility group)
   and link it from error pages and the footer so users can find it when things break.
8. Run `npx vitest run tests/api/healthz.test.js tests/api/forge-health.test.js`,
   exercise `/status` in the browser (no console errors), then add a
   `data/changelog.json` entry (status page improvements are user-visible) and
   `npm run build:pages`.

## Must-not

- Never expose admin-only health detail, internal URLs, or secrets in the public `/api/status`.
- Never fake uptime history with `setTimeout` or hardcoded bars — record real samples.
- Never let the public page flip top-level "operational" to red on a single flaky probe — debounce.
- Do not pull/fetch/merge from the `threeD` remote (push-only mirror).
- No mocks, stubs, or TODOs. The only coin is `$THREE`.

## Acceptance (all true before claiming done)

- [ ] `/api/status` aggregates all subsystem probes; the public response leaks no admin detail/secrets.
- [ ] `/status` renders real 90-day history from recorded samples; loading/warming/degraded/down states designed.
- [ ] An external, off-box uptime monitor pings `/api/healthz` + `/api/status` and pages the team (real config documented).
- [ ] Health crons alert via `sendOpsAlert` on degradation only, respecting dedup + ceiling.
- [ ] `/status` is reachable from nav + footer + error pages; no console errors; responsive + accessible.
- [ ] `healthz` and `forge-health` tests pass; changelog updated and `npm run build:pages` clean.
