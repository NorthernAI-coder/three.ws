# 07 — Spend observability & burn-rate control

## Mission

$100k over ~2 months is ~$1,600/day. We need to see the burn in real time, attribute it to each
lane (Vertex Claude, Imagen, GPU workers, spot CPU), and get alerted before any lane runs away —
especially the GPU fleet (a stuck min-instances service or a runaway batch can burn hundreds/day
silently) and Vertex Claude if production gets flipped to primary. Build the dashboard + alerts
+ a kill-switch story. Also guard against the *opposite* failure: credits sitting unused because
we're too timid.

## Prerequisites

- Prompt 01 ran (billing/monitoring APIs enabled, project set). Most useful after 02/03/04 so
  there's real traffic to attribute, but the alerting scaffold can be built anytime.

## Context

- Billing export: enable BigQuery billing export (Cloud Billing → export) for line-item,
  label-attributable cost data. Credit balance/expiry recorded in `docs/gcp-credits.md` (prompt 01).
- App-side attribution: prompts 02–04 add provider/lane telemetry markers
  (`vertex-anthropic`, Imagen provider, self-host forge backends,
  `GCP_RECONSTRUCTION_KEY`-authed worker calls). Use those.
- Existing platform surfaces for dashboards: check `api/insights/`, `api/admin/` (if present),
  and how existing internal dashboards are built/authed before inventing a new pattern.

## Tasks

1. **Billing export → BigQuery.** Enable it (console step if needed — document exactly).
   Write `scripts/gcp/burn-report.mjs` that queries the billing dataset for: total credit spend
   to date, spend by service (Vertex AI, Cloud Run, Compute, Storage, BigQuery), spend by label
   (label the resources — Cloud Run services, SA, etc. — so lanes are attributable), daily burn
   rate, and **projected exhaustion date vs credit expiry date**. Human-readable output.
2. **Resource labeling.** Ensure every credit-consuming resource created in prompts 02–06
   carries a consistent label (e.g. `program=gcp-credits`, `lane=vertex-claude|imagen|forge-gpu|vanity`).
   Retro-label existing ones. This is what makes attribution work — don't skip it.
3. **Budgets & alerts.** Create GCP Budget alerts (Cloud Billing Budgets API): overall program
   budget with alerts at 25/50/75/90%, plus per-service thresholds where possible. Route alerts
   somewhere the team sees them — reuse the platform's existing notification path if there is
   one (the changelog pushes to a Telegram channel via `TELEGRAM_BOT_TOKEN` /
   `TELEGRAM_CHANGELOG_CHAT_ID` — consider a separate ops chat, don't spam the holder channel).
   Implement the webhook/handler that turns a budget pub/sub notification into a team ping.
4. **App-side spend dashboard.** An internal (auth-gated — match existing admin auth) page/endpoint
   that shows, from app telemetry: requests/tokens per lane per day, Vertex Claude token spend
   estimate, forge generations per backend, and cross-references the BigQuery burn number.
   Wire it into existing internal navigation — no orphan page. Design all states (loading/empty/error)
   per CLAUDE.md.
5. **Runaway kill-switches (document + implement the mechanism):**
   - Vertex Claude: the `VERTEX_CLAUDE_PRIMARY` flag (prompt 02) — unset to fall back to free
     lanes instantly. Verify it's a true kill switch (no deploy needed — env flip + effect).
   - GPU workers: `gcloud run services update … --min-instances 0` and the
     `FORGE_SELFHOST_PRIMARY` flag (prompt 04). Script it: `scripts/gcp/emergency-stop.sh` that
     drops all worker min-instances to 0 and prints the flags to unset.
   - Spot batch jobs: documented stop command.
6. **Under-utilization guard.** The report should also flag if projected spend at current burn
   will leave >30% of credits unused at expiry — with a prompt to scale up (more seed batches,
   flip production to Vertex primary, bigger vanity runs). Wasting credits is a failure mode too.
7. **Cron the report.** Daily burn report to the ops channel (reuse the platform's cron pattern
   in `api/cron/` or a scheduled GCP job). Include days-of-runway and unused-credit projection.

## Acceptance criteria

- [ ] BigQuery billing export live; `scripts/gcp/burn-report.mjs` produces attributed spend +
      projection vs expiry.
- [ ] All program resources labeled; attribution verified in the report.
- [ ] Budget alerts at 25/50/75/90% routed to a team channel; alert handler tested (trigger a
      test notification).
- [ ] Internal spend dashboard live, auth-gated, wired into nav, all states designed.
- [ ] `scripts/gcp/emergency-stop.sh` works (dry-run verified); kill-switch flags confirmed as
      no-deploy env flips.
- [ ] Under-utilization guard implemented; daily report cron scheduled.
- [ ] `npm test` green; `git diff` reviewed.

## Wrap-up

Update `docs/gcp-credits.md` with the ops section (dashboards, alert thresholds, kill-switch
commands, how to read the burn report). Changelog only if the internal dashboard counts as
user-visible (it's admin — likely not). Commit explicit paths, push `threews` (+ attempt
`threeD`). Report current burn rate, projected exhaustion vs expiry, and whether we're on
track to use the credits fully.
