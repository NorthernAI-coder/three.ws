# 01 — GCP Foundation: project, auth, quotas, Claude Code on Vertex

## Mission

We have ~$100k of Google Cloud credits expiring in ~1 year. This prompt sets up the GCP
foundation everything else builds on: verified billing/credits, enabled APIs, service accounts,
Claude enabled in Vertex Model Garden with quota headroom, credentials wired into Vercel, and
Claude Code dev sessions routable through Vertex. Later prompts (02–08) depend on the outputs of
this one. Do the work end to end — where a step genuinely requires the human (console-only terms
acceptance), do everything around it, verify after, and list exactly what the owner must click.

## Context

- This repo (three.ws) already uses GCP in places: `api/_mcp3d/vertex-imagen.js` is a working
  Vertex Imagen client with service-account JWT→OAuth exchange (env:
  `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`), and
  `workers/model-*/cloudbuild.yaml` deploy GPU workers to Cloud Run. `.gcloudignore` exists at
  repo root. GCS buckets referenced: `three-ws-model-weights`, `three-ws-avatar-reconstructions`.
- Deployment platform for `api/` is Vercel (use the `vercel` CLI; `vercel env ls` to inspect).
- Claude models are served on Vertex AI as partner models under publisher `anthropic`, billed
  through the GCP project. Current-generation model IDs on Vertex are the bare first-party IDs
  (e.g. `claude-sonnet-4-6`, `claude-opus-4-8`); dated snapshots use `@` (e.g.
  `claude-haiku-4-5@20251001` — note the repo's default model string is
  `claude-haiku-4-5-20251001`, which must map to the `@` form on Vertex).

## Tasks

1. **CLI + auth.** Ensure `gcloud` is installed and authenticated (install if missing). Identify
   the target project (check existing env/`vercel env ls`/`workers/deploy/*.sh` for a project ID
   already in use; if ambiguous, list projects and pick the one holding the existing buckets).
   Set it as default.
2. **Credits & partner-model coverage (go/no-go).** Via `gcloud billing` (and the Cloud Billing
   API), confirm: the active billing account, that credits are applied, remaining balance, and
   expiry date. **Critical check:** determine whether the credit grant covers Vertex AI *partner
   models* (Anthropic). Google-for-Startups credits do; some grants exclude third-party models.
   If this cannot be confirmed programmatically, produce a precise console path + question for
   the owner and continue with the rest of the setup (the check gates prompt 02's chain
   inversion, not this prompt).
3. **Enable APIs:** `aiplatform.googleapis.com`, `run.googleapis.com`,
   `cloudbuild.googleapis.com`, `storage.googleapis.com`, `compute.googleapis.com`,
   `bigquery.googleapis.com`, `cloudbilling.googleapis.com`, `monitoring.googleapis.com`.
4. **Service accounts** (create only if no suitable one exists — check first):
   - `vercel-inference@…` with `roles/aiplatform.user` — used by Vercel functions for
     Vertex Claude + Imagen.
   - Confirm the existing worker deploy flow's SA still works (used by
     `workers/deploy/*.sh` / cloudbuild).
   Mint a JSON key for the Vercel SA and set it in Vercel as `GCP_SERVICE_ACCOUNT_JSON`
   (all environments), plus `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` (default
   `us-central1`; also set `GOOGLE_CLOUD_LOCATION_CLAUDE=global` for the Claude global
   endpoint). Never write the key into the repo.
5. **Enable Claude in Model Garden.** Attempt via gcloud/API; Model Garden partner-model
   enablement usually requires a one-time console acceptance — if so, give the owner the exact
   console URL and model list to enable: `claude-haiku-4-5`, `claude-sonnet-4-6`,
   `claude-opus-4-8`, `claude-fable-5` (if available), plus `claude-sonnet-5`.
6. **Quota.** Check current Vertex quotas for those models (QPM/TPM per region). File quota
   increase requests sized for production chat traffic (start: 300 QPM / 2M TPM on Haiku and
   Sonnet tiers, region `global` and `us-central1`). Document what was requested and current
   values.
7. **Smoke test.** Once enablement is confirmed, verify with a raw call (no SDK needed):
   `POST https://aiplatform.googleapis.com/v1/projects/{P}/locations/global/publishers/anthropic/models/claude-haiku-4-5@20251001:streamRawPredict`
   with body `{"anthropic_version":"vertex-2023-10-16","max_tokens":64,"messages":[{"role":"user","content":"ping"}]}`
   and an OAuth Bearer token from the Vercel SA key. A 200 with streamed content = pass. If
   enablement is pending human console action, write this smoke test as
   `scripts/gcp/vertex-smoke.mjs` (runnable, reading `GCP_SERVICE_ACCOUNT_JSON` from env) so it
   can be run the moment enablement lands.
8. **Claude Code on Vertex (dev spend → credits).** Create `scripts/gcp/claude-code-vertex.sh`
   that exports `CLAUDE_CODE_USE_VERTEX=1`, `ANTHROPIC_VERTEX_PROJECT_ID=<project>`,
   `CLOUD_ML_REGION=global`, and points ADC at a dev credential (document
   `gcloud auth application-default login` as the auth step). Opt-in by `source`-ing — do NOT
   set these globally in the devcontainer (sessions must be able to choose billing lane).
   Document usage in the runbook.
9. **Runbook.** Create `docs/gcp-credits.md`: project ID, billing account, credit balance +
   expiry date, what's enabled, SA inventory, env vars set (names only, no values), quota state,
   smoke-test instructions, and a "pending human actions" checklist. Later prompts append to
   this file.

## Acceptance criteria

- [ ] `gcloud` authenticated against the right project; project ID recorded in the runbook.
- [ ] Credit balance + expiry confirmed and recorded; partner-model coverage confirmed or
      escalated with an exact console path.
- [ ] All listed APIs enabled (verify with `gcloud services list --enabled`).
- [ ] Vercel envs set: `GCP_SERVICE_ACCOUNT_JSON`, `GOOGLE_CLOUD_PROJECT`,
      `GOOGLE_CLOUD_LOCATION`, `GOOGLE_CLOUD_LOCATION_CLAUDE` (verify `vercel env ls`).
- [ ] `scripts/gcp/vertex-smoke.mjs` exists and passes (or is ready + blocked only on the
      documented console enablement).
- [ ] `scripts/gcp/claude-code-vertex.sh` exists and works when sourced.
- [ ] `docs/gcp-credits.md` written.
- [ ] No secret material anywhere in the working tree (`git diff` audited before commit).

## Wrap-up

Add a `data/changelog.json` entry only if something user-visible shipped (this prompt is
infra — likely no entry). Commit with explicit paths (`scripts/gcp/`, `docs/gcp-credits.md`),
push to `threews` and attempt `threeD` (known flaky mirror — report failure, don't block).
Report: credit balance, expiry date, what's live, what's blocked on the owner.
